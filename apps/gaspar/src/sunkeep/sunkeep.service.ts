import { initLogger } from '@repo/logger/server';
import {
	CommunicationError,
	InvalidSession,
	NoActiveSessionError,
	StartVerificationTimeoutError,
	isWithinChargeScheduleWindow,
	type ChargingSession,
	type HomeChargerStatus,
	type TimeString,
	type UserChargingStatus,
} from 'node-chargepoint';
import type {
	ActiveSessionSummary,
	IChargePointClient,
	IPowerwallAdapter,
	PowerwallData,
	SunkeepConfig,
	SunkeepMeta,
	SunkeepStatus,
} from './sunkeep.types.js';
import { StopReason, SunkeepState } from './sunkeep.types.js';
import { TeslaAuthError } from './tesla.client.js';

const log = initLogger('sunkeep.service');

const MIN_AMPS = 8;
const MAX_AMPS = 32;
const VOLTAGE = 240;
const MIN_EXCESS_KW = 1.5;
// Open ChargingEvent rows older than this are assumed to belong to a prior
// session that ended outside our awareness — when adopting, we close them
// and start a fresh row rather than show a misleading multi-day duration.
const MAX_INCOMPLETE_EVENT_AGE_MS = 12 * 60 * 60 * 1000;

function calcTargetAmps(excessKw: number): number {
	const raw = Math.floor((excessKw * 1000) / VOLTAGE);
	return Math.max(MIN_AMPS, Math.min(MAX_AMPS, raw));
}

interface IncompleteChargingEvent {
	id: string;
	startedAt: Date;
	startAmps: number;
	peakSolarKw: number | null;
	forced: boolean;
}

interface IPrismaChargingEvent {
	create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
	update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
	delete(args: { where: { id: string } }): Promise<unknown>;
	findMany(args: {
		where: { stoppedAt: null };
		orderBy: { startedAt: 'asc' | 'desc' };
	}): Promise<IncompleteChargingEvent[]>;
}

interface IPrisma {
	chargingEvent: IPrismaChargingEvent;
}

export class SunkeepService {
	private state: SunkeepState = SunkeepState.DISABLED;
	private activeSession: ChargingSession | null = null;
	private activeEventId: string | null = null;
	private currentAmps = 0;
	private peakSolarKw = 0;
	private lastPollAt: Date | null = null;
	private lastPwData: PowerwallData | null = null;
	private sessionStartedAt: Date | null = null;
	private lockedAmps: number | null = null;
	private isPluggedIn: boolean | null = null;
	private chargerAmps: number | null = null;
	private waitReason: string | null = null;
	private isDuringScheduledTime: boolean | null = null;
	private chargerChargingStatus: HomeChargerStatus['chargingStatus'] | null = null;
	// True once we observe the charger as CHARGING for the current session; reset on
	// session stop and on new session start. Guards external-stop detection in
	// reconcileWithCharger so it doesn't misfire before the charger status propagates.
	private chargerConfirmedCurrentSession = false;
	// True once a start attempt was rejected with ChargePoint error 25 (car at its
	// charge limit) while the charger reports a non-DONE status. ChargePoint does not
	// always surface 'DONE' for a full car — when it reports 'NOT_CHARGING' instead,
	// tick() would otherwise sail past the DONE handler and re-attempt a start every
	// poll, creating a junk ChargingEvent row each time. This flag short-circuits those
	// attempts until the car is unplugged (or the charger reports CHARGING again).
	private carReportedFull = false;
	// True when the current session was deliberately force-started from fiendlord-keep
	// (POST /sunkeep/charge/start). A forced session bypasses the solar/battery policy
	// gates in tick() — solar window, no-solar, battery-below-threshold, and
	// insufficient-excess — and charges until unplugged, the car is full, or it is
	// manually stopped/disabled. Persisted on the ChargingEvent row so it survives a
	// process restart (restored during adoption) and is recorded in history.
	private forced = false;

	constructor(
		private readonly chargePoint: IChargePointClient,
		private readonly powerwall: IPowerwallAdapter,
		private readonly prisma: IPrisma,
		private readonly config: SunkeepConfig
	) {}

	enable(): void {
		if (this.state === SunkeepState.DISABLED) {
			this.state = SunkeepState.IDLE;
			log.info('Sunkeep enabled');
		}
	}

	updateTeslaRefreshToken(token: string): void {
		this.powerwall.updateRefreshToken?.(token);
		if (this.state === SunkeepState.DISABLED) {
			this.enable();
		}
	}

	async disable(): Promise<void> {
		if (this.state === SunkeepState.CHARGING) {
			await this.stopActiveSession(StopReason.MANUAL);
		}
		this.state = SunkeepState.DISABLED;
		log.info('Sunkeep disabled');
	}

	getStatus(): SunkeepStatus {
		const session: ActiveSessionSummary | null = this.activeSession
			? {
					sessionId: this.activeSession.sessionId,
					currentAmps: this.currentAmps,
					startedAt: this.sessionStartedAt?.toISOString() ?? null,
				}
			: null;

		return {
			state: this.state,
			enabled: this.state !== SunkeepState.DISABLED,
			lastPollAt: this.lastPollAt?.toISOString() ?? null,
			activeSession: session,
			solarKw: this.lastPwData?.solarKw ?? null,
			excessKw: this.lastPwData
				? this.lastPwData.solarKw -
					this.lastPwData.loadKw +
					Math.min(0, this.lastPwData.batteryKw ?? 0) +
					(this.activeSession
						? (this.currentAmps * VOLTAGE) / 1000
						: this.chargerChargingStatus === 'CHARGING' && this.chargerAmps
							? (this.chargerAmps * VOLTAGE) / 1000
							: 0)
				: null,
			loadKw: this.lastPwData?.loadKw ?? null,
			batteryPct: this.lastPwData?.batteryPct ?? null,
			batteryKw: this.lastPwData?.batteryKw ?? null,
			lockedAmps: this.lockedAmps,
			chargerAmps: this.chargerAmps,
			isPluggedIn: this.isPluggedIn,
			gridKw: this.lastPwData?.gridKw ?? null,
			gridStatus: this.lastPwData?.gridStatus ?? null,
			lastTeslaAt: this.lastPwData?.lastTeslaAt ?? null,
			waitReason: this.state === SunkeepState.WAITING ? this.waitReason : null,
			forced: this.forced,
		};
	}

	async runTick(): Promise<void> {
		if (this.state === SunkeepState.DISABLED) return;

		this.lastPollAt = new Date();

		try {
			await this.tick();
		} catch (err) {
			if (err instanceof TeslaAuthError) {
				log.error(
					'Tesla refresh token invalid — PUT /sunkeep/tesla/refresh-token with a new token to recover. Disabling sunkeep.'
				);
				if (this.state === SunkeepState.CHARGING) {
					await this.stopActiveSession(StopReason.ERROR);
				}
				this.state = SunkeepState.DISABLED;
				return;
			}
			if (err instanceof InvalidSession) {
				log.error(
					'ChargePoint session expired — restart the process with a valid CHARGEPOINT_TOKEN or CHARGEPOINT_PASSWORD to recover. Disabling sunkeep.'
				);
				if (this.state === SunkeepState.CHARGING) {
					await this.stopActiveSession(StopReason.ERROR);
				}
				this.state = SunkeepState.DISABLED;
				return;
			}
			log.error({ err }, 'Sunkeep tick error');
			if (this.state === SunkeepState.CHARGING) {
				await this.stopActiveSession(StopReason.ERROR);
			}
			this.state = SunkeepState.ERROR;
		}
	}

	async manualStopSession(): Promise<void> {
		if (this.state !== SunkeepState.CHARGING) return;
		await this.stopActiveSession(StopReason.MANUAL);
		this.state = SunkeepState.IDLE;
	}

	async manualStartSession(): Promise<void> {
		if (this.state === SunkeepState.CHARGING) return;
		const [chargerStatus, pwData] = await Promise.all([
			this.chargePoint.getHomeChargerStatus(this.config.chargePointDeviceId),
			this.powerwall.getData(),
		]);
		this.isPluggedIn = chargerStatus.isPluggedIn;
		this.chargerAmps = chargerStatus.amperageLimit;
		this.chargerChargingStatus = chargerStatus.chargingStatus;
		this.lastPwData = pwData;
		if (chargerStatus.chargingStatus === 'DONE') {
			// ChargePoint DONE state means the car hit its charge limit; the physical
			// connector must be unplugged and replugged before a new session will start.
			// Attempting startChargingSession here returns error 25 — skip it.
			this.state = SunkeepState.WAITING;
			this.waitReason = 'Car fully charged';
			return;
		}
		if (chargerStatus.chargingStatus === 'CHARGING') {
			await this.reconcileWithCharger(chargerStatus);
			// Cast: TS narrowed state to non-CHARGING after the early return at the
			// top of this method, but reconcile may have mutated it via adoption.
			if ((this.state as SunkeepState) === SunkeepState.CHARGING) {
				// The charger had already auto-started (e.g. on plug-in) and we just
				// adopted it. The user explicitly clicked Force Start, so mark the
				// adopted session forced — otherwise the next tick's battery/solar
				// gates would stop it.
				await this.markSessionForced();
				return;
			}
		}
		// A deliberate force-start: bypass the solar/battery policy gates on subsequent
		// ticks until the car is unplugged/full or the session is stopped.
		this.forced = true;
		const excessKw = pwData.solarKw - pwData.loadKw;
		const targetAmps = calcTargetAmps(excessKw);
		await this.startSession(targetAmps);
	}

	// Mark the in-flight session as force-charged and persist the flag onto its
	// ChargingEvent row so it survives a restart and is recorded in history.
	private async markSessionForced(): Promise<void> {
		this.forced = true;
		const eventId = this.activeEventId;
		if (!eventId) return;
		await this.prisma.chargingEvent
			.update({ where: { id: eventId }, data: { forced: true } })
			.catch((err: unknown) => {
				log.warn({ err, eventId }, 'Failed to persist forced flag on ChargingEvent');
			});
	}

	async lockAmps(amps: number): Promise<void> {
		if (!Number.isInteger(amps) || amps < MIN_AMPS || amps > MAX_AMPS) {
			throw new RangeError(`amps must be an integer between ${MIN_AMPS} and ${MAX_AMPS}`);
		}
		this.lockedAmps = amps;
		if (this.state === SunkeepState.CHARGING) {
			await this.chargePoint.setAmperageLimit(this.config.chargePointDeviceId, amps);
			this.currentAmps = amps;
			log.info({ amps }, 'Amp lock applied, charger updated');
		} else {
			log.info({ amps }, 'Amp lock set (not currently charging)');
		}
	}

	unlockAmps(): void {
		this.lockedAmps = null;
		log.info('Amp lock cleared, auto-adjust restored');
	}

	async getMeta(): Promise<SunkeepMeta> {
		let softwareVersion: string | null = null;
		let deviceIp: string | null = null;
		let cpPowerSourceAmps: number | null = null;
		let cpPowerSourceType: string | null = null;
		let cpLedBrightnessLevel: number | null = null;
		let cpLedBrightnessMax: number | null = null;
		let teslaSiteName: string | null = null;
		let teslaBatteryCapacityKwh: number | null = null;
		let teslaBackupReservePct: number | null = null;
		let teslaModel: string | null = null;
		let teslaFirmwareVersion: string | null = null;
		let teslaBatteryCount: number | null = null;
		let teslaStormModeEnabled: boolean | null = null;

		const [cpTechResult, cpConfigResult, teslaResult] = await Promise.allSettled([
			this.chargePoint.getHomeChargerTechnicalInfo(this.config.chargePointDeviceId),
			this.chargePoint.getHomeChargerConfig(this.config.chargePointDeviceId),
			this.powerwall.getSiteInfo?.(),
		]);

		if (cpTechResult.status === 'fulfilled') {
			softwareVersion = cpTechResult.value.softwareVersion;
			deviceIp = cpTechResult.value.deviceIp;
		} else {
			log.warn({ err: cpTechResult.reason }, 'Could not fetch ChargePoint technical info');
		}

		if (cpConfigResult.status === 'fulfilled') {
			const cfg = cpConfigResult.value;
			cpPowerSourceAmps = cfg.powerSource?.amps ?? null;
			cpPowerSourceType = cfg.powerSource?.type ?? null;
			cpLedBrightnessLevel = cfg.ledBrightness.level;
			cpLedBrightnessMax =
				cfg.ledBrightness.supportedLevels.length > 0
					? Math.max(...cfg.ledBrightness.supportedLevels)
					: null;
		} else {
			log.warn({ err: cpConfigResult.reason }, 'Could not fetch ChargePoint config');
		}

		if (teslaResult.status === 'fulfilled' && teslaResult.value != null) {
			teslaSiteName = teslaResult.value.siteName;
			teslaBatteryCapacityKwh = teslaResult.value.batteryCapacityKwh;
			teslaBackupReservePct = teslaResult.value.backupReservePct;
			teslaModel = teslaResult.value.model;
			teslaFirmwareVersion = teslaResult.value.firmwareVersion;
			teslaBatteryCount = teslaResult.value.batteryCount;
			teslaStormModeEnabled = teslaResult.value.stormModeEnabled;
		} else if (teslaResult.status === 'rejected') {
			log.warn({ err: teslaResult.reason }, 'Could not fetch Tesla site info');
		}

		return {
			chargePointDeviceId: this.config.chargePointDeviceId,
			teslaEnergySiteId: this.config.teslaEnergySiteId,
			softwareVersion,
			deviceIp,
			cpPowerSourceAmps,
			cpPowerSourceType,
			cpLedBrightnessLevel,
			cpLedBrightnessMax,
			cpScheduleActive: this.isDuringScheduledTime,
			teslaSiteName,
			teslaBatteryCapacityKwh,
			teslaBackupReservePct,
			teslaModel,
			teslaFirmwareVersion,
			teslaBatteryCount,
			teslaStormModeEnabled,
		};
	}

	private async tick(): Promise<void> {
		const [chargerStatus, pwData] = await Promise.all([
			this.chargePoint.getHomeChargerStatus(this.config.chargePointDeviceId),
			this.powerwall.getData(),
		]);

		this.isPluggedIn = chargerStatus.isPluggedIn;
		this.chargerAmps = chargerStatus.amperageLimit;
		this.isDuringScheduledTime = chargerStatus.isDuringScheduledTime;
		this.chargerChargingStatus = chargerStatus.chargingStatus;
		this.lastPwData = pwData;
		if (chargerStatus.chargingStatus === 'CHARGING' && (this.activeSession || this.activeEventId)) {
			this.chargerConfirmedCurrentSession = true;
		}
		// The charger is delivering current again, so any prior "car full" rejection is
		// stale — clear the guard so normal management resumes.
		if (chargerStatus.chargingStatus === 'CHARGING') {
			this.carReportedFull = false;
		}

		// Reconcile in-memory state with what the charger and database say.
		// Handles process restarts that left a session running on the charger
		// and/or an open ChargingEvent row in the DB, and adopts sessions started
		// outside Sunkeep (ChargePoint app, auto-start on plug-in) so we manage them.
		await this.reconcileWithCharger(chargerStatus);

		// Charger is delivering current but adoption did not take ownership this
		// tick. This only happens on a transient ChargePoint API failure (e.g.
		// getUserChargingStatus threw) — wait and retry adoption next tick rather
		// than starting a competing session. A successful adoption always sets
		// activeEventId (and usually activeSession), so this branch is skipped then.
		if (chargerStatus.chargingStatus === 'CHARGING' && !this.activeSession && !this.activeEventId) {
			this.state = SunkeepState.WAITING;
			this.waitReason = 'Charger busy';
			return;
		}

		// ChargePoint reports 'DONE' when the car reached its charge limit and stopped
		// accepting current. Detect this before the solar window check so it takes
		// priority over less informative reasons like "Outside solar window".
		if (chargerStatus.isPluggedIn && chargerStatus.chargingStatus === 'DONE') {
			if (this.state === SunkeepState.CHARGING) {
				await this.stopActiveSession(StopReason.CAR_FULL);
			}
			this.state = SunkeepState.WAITING;
			this.waitReason = 'Car fully charged';
			return;
		}

		// Car previously rejected a start with error 25 (at its charge limit) and the
		// charger reports a non-DONE status. Don't re-attempt a start (which would create
		// a junk ChargingEvent row every tick) — hold in WAITING until the car is
		// unplugged (handled in the !isPluggedIn branch below) or starts charging again
		// (handled at the top of tick).
		if (chargerStatus.isPluggedIn && this.carReportedFull) {
			this.state = SunkeepState.WAITING;
			this.waitReason = 'Car fully charged';
			return;
		}

		const inSolarWindow = isWithinChargeScheduleWindow({
			startTime: this.config.solarWindowStart as TimeString,
			endTime: this.config.solarWindowEnd as TimeString,
		});
		// A forced session charges at any hour — skip the solar-window/night-safety,
		// no-solar, battery-threshold, and insufficient-excess gates below.
		if (!this.forced && !inSolarWindow) {
			if (this.state === SunkeepState.CHARGING) {
				await this.stopActiveSession(StopReason.NIGHT_SAFETY);
			}
			this.state = chargerStatus.isPluggedIn ? SunkeepState.WAITING : SunkeepState.IDLE;
			if (chargerStatus.isPluggedIn) this.waitReason = 'Outside solar window';
			else this.waitReason = null;
			return;
		}

		if (!chargerStatus.isPluggedIn) {
			if (this.state === SunkeepState.CHARGING) {
				await this.stopActiveSession(StopReason.UNPLUGGED);
			}
			// Unplugging clears the "car full" guard: the next plug-in may be a
			// different charge state and deserves a fresh start attempt.
			this.carReportedFull = false;
			this.state = SunkeepState.IDLE;
			this.waitReason = null;
			return;
		}

		if (!this.forced && pwData.solarKw === 0) {
			if (this.state === SunkeepState.CHARGING) {
				await this.stopActiveSession(StopReason.NIGHT_SAFETY);
			}
			this.state = SunkeepState.WAITING;
			this.waitReason = 'No solar production';
			return;
		}

		if (!this.forced && pwData.batteryPct < this.config.soeThreshold) {
			if (this.state === SunkeepState.CHARGING) {
				// We adopted a session the charger auto-started (e.g. on plug-in) but the
				// Powerwall is below the start threshold — stop it. Force-charged sessions
				// skip this gate (this.forced short-circuits above).
				log.info(
					{ batteryPct: pwData.batteryPct, soeThreshold: this.config.soeThreshold },
					'Charger is charging but Powerwall is below threshold — stopping session'
				);
				await this.stopActiveSession(StopReason.BATTERY_DEPLETED);
				this.state = SunkeepState.WAITING;
			} else {
				this.state = SunkeepState.WAITING;
			}
			this.waitReason = 'Battery below threshold';
			return;
		}

		// Tesla load_power includes EV charging load; add it back so we measure solar excess
		// available for the car rather than treating the car's own draw as a deficit.
		// When we have an adopted session use currentAmps (what we commanded); otherwise
		// fall back to the charger's reported amperageLimit if it's actively charging.
		const carAmps =
			this.state === SunkeepState.CHARGING
				? this.currentAmps
				: chargerStatus.chargingStatus === 'CHARGING' && chargerStatus.amperageLimit
					? chargerStatus.amperageLimit
					: 0;
		const excessKw = pwData.solarKw - pwData.loadKw + (carAmps * VOLTAGE) / 1000;

		if (!this.forced && excessKw < MIN_EXCESS_KW) {
			if (this.state === SunkeepState.CHARGING) {
				await this.stopActiveSession(StopReason.SOLAR_DROPPED);
				this.state = SunkeepState.WAITING;
			} else {
				this.state = SunkeepState.WAITING;
			}
			this.waitReason = 'Insufficient solar excess';
			return;
		}

		const targetAmps = calcTargetAmps(excessKw);

		if (this.state === SunkeepState.CHARGING) {
			if (this.lockedAmps === null && targetAmps !== this.currentAmps) {
				await this.chargePoint.setAmperageLimit(this.config.chargePointDeviceId, targetAmps);
				this.currentAmps = targetAmps;
				log.info({ targetAmps }, 'Adjusted charge amps');
			}
			if (pwData.solarKw > this.peakSolarKw && this.activeEventId) {
				this.peakSolarKw = pwData.solarKw;
				await this.prisma.chargingEvent.update({
					where: { id: this.activeEventId },
					data: { peakSolarKw: this.peakSolarKw },
				});
			}
		} else {
			this.waitReason = null;
			await this.startSession(targetAmps);
		}
	}

	private async reconcileWithCharger(chargerStatus: HomeChargerStatus): Promise<void> {
		const chargerIsCharging = chargerStatus.chargingStatus === 'CHARGING';

		// Case 1: Charger is delivering current but we have no in-memory session.
		// The session was started by a prior process instance, the ChargePoint app,
		// or an auto-start on plug-in — adopt it so the state machine and excessKw
		// calculation behave correctly and Sunkeep can manage its amperage.
		if (chargerIsCharging && !this.activeSession) {
			await this.adoptOrphanedSession(chargerStatus);
			return;
		}

		// Case 2: Charger stopped externally while we still hold a session handle.
		// Exclude DONE (tick's dedicated handler records CAR_FULL) and unplugged
		// (tick's isPluggedIn check records UNPLUGGED) so those stop reasons are
		// preserved; this branch handles manual stops via the ChargePoint app.
		// Guard on chargerConfirmedCurrentSession so we don't misfire before the
		// charger status reflects our newly-started session.
		if (
			!chargerIsCharging &&
			this.activeSession &&
			chargerStatus.isPluggedIn &&
			chargerStatus.chargingStatus !== 'DONE' &&
			this.chargerConfirmedCurrentSession
		) {
			log.info('Charger stopped while session was active — closing session record');
			await this.stopActiveSession(StopReason.UNKNOWN);
			this.state = SunkeepState.IDLE;
			this.waitReason = null;
			return;
		}

		// Case 3: Charger stopped and we have an open event but no session handle.
		// Occurs when StartVerificationTimeoutError left an activeEventId without a
		// session object and the charger has since stopped (e.g. user stopped via app).
		// Guard on chargerConfirmedCurrentSession for the same reason as Case 2.
		if (
			!chargerIsCharging &&
			!this.activeSession &&
			this.activeEventId &&
			this.chargerConfirmedCurrentSession
		) {
			log.info('Charger stopped for unconfirmed session — closing event record');
			await this.stopActiveSession(StopReason.UNKNOWN);
			this.state = SunkeepState.IDLE;
			this.waitReason = null;
			return;
		}

		// Case 4: Charger not charging and no active state — close any lingering DB
		// events that outlived a prior process crash.
		if (!chargerIsCharging && !this.activeSession) {
			await this.closeStaleIncompleteEvent();
		}
	}

	private async adoptOrphanedSession(chargerStatus: HomeChargerStatus): Promise<void> {
		let userStatus: UserChargingStatus | null;
		try {
			userStatus = await this.chargePoint.getUserChargingStatus();
		} catch (err) {
			log.warn({ err }, 'getUserChargingStatus failed during session adoption');
			return;
		}

		let session: ChargingSession | null = null;
		if (userStatus) {
			try {
				session = await this.chargePoint.getChargingSession(userStatus.sessionId);
			} catch (err) {
				log.warn({ err, sessionId: userStatus.sessionId }, 'getChargingSession failed');
				return;
			}
		} else if (this.activeEventId) {
			// We started this session; the user-status API hasn't caught up yet.
			// Keep CHARGING state and retry adoption on the next tick rather than
			// creating a duplicate event or trying to stop our own session.
			log.warn(
				'Session we started is not yet visible via getUserChargingStatus — retrying adoption next tick'
			);
			this.state = SunkeepState.CHARGING;
			return;
		} else {
			// Charger is delivering current but the session is not visible via the
			// user-status API: started from the ChargePoint app, an auto-start on
			// plug-in, or simple propagation lag. Amperage is controlled at the
			// charger via setAmperageLimit regardless of who owns the session, so
			// adopt it without a session handle and let the normal tick logic manage
			// amps from solar excess. This replaces the old stop-and-restart, which
			// left app-started sessions (not stoppable via API) stuck on "Charger
			// busy" and never adjusting.
			log.info(
				'Charger CHARGING with no API-visible session — adopting without a session handle to manage amperage'
			);
		}

		await this.finalizeAdoption(chargerStatus, session);
	}

	// Resolve the DB ChargingEvent row (reuse a fresh one, close stale/extra rows,
	// or create a new one) and move into CHARGING state. The session handle may be
	// null when the charger is charging but no API-visible session exists; amperage
	// is still managed via setAmperageLimit on the device.
	private async finalizeAdoption(
		chargerStatus: HomeChargerStatus,
		session: ChargingSession | null
	): Promise<void> {
		const amps = chargerStatus.amperageLimit;
		const incompletes = await this.prisma.chargingEvent
			.findMany({ where: { stoppedAt: null }, orderBy: { startedAt: 'desc' } })
			.catch((err: unknown) => {
				log.warn({ err }, 'Failed to look up incomplete ChargingEvent during adoption');
				return null;
			});

		const now = new Date();
		// The freshest open row is the most likely candidate to reuse; everything
		// older is an orphaned row from a prior failed start — close them all now.
		const freshest = incompletes?.[0] ?? null;
		const extras = incompletes?.slice(1) ?? [];

		if (extras.length > 0) {
			await Promise.all(
				extras.map((ev) =>
					this.prisma.chargingEvent
						.update({
							where: { id: ev.id },
							data: { stoppedAt: now, stopReason: StopReason.UNKNOWN, endAmps: ev.startAmps },
						})
						.catch((err: unknown) => {
							log.warn({ err, eventId: ev.id }, 'Failed to close extra incomplete ChargingEvent');
						})
				)
			);
			log.info(
				{ count: extras.length, eventIds: extras.map((e) => e.id) },
				'Closed extra incomplete ChargingEvent(s) during adoption'
			);
		}

		const isFresh =
			freshest !== null &&
			now.getTime() - freshest.startedAt.getTime() <= MAX_INCOMPLETE_EVENT_AGE_MS;

		let eventId: string;
		let startedAt: Date;
		let peakSolarKw: number;
		// Restore the forced flag from a reused row so a force-charged session that
		// outlived a process restart stays exempt from the policy gates. A freshly
		// created row (externally-started session) is never forced.
		let forcedFlag: boolean;
		if (isFresh && freshest) {
			eventId = freshest.id;
			startedAt = freshest.startedAt;
			peakSolarKw = freshest.peakSolarKw ?? this.lastPwData?.solarKw ?? 0;
			forcedFlag = freshest.forced ?? false;
		} else {
			// Either no DB row exists, or the existing one is too old to plausibly
			// belong to the currently-active ChargePoint session. Close the stale
			// row (if any) and start a fresh event keyed to the adoption moment.
			if (freshest) {
				await this.prisma.chargingEvent
					.update({
						where: { id: freshest.id },
						data: {
							stoppedAt: now,
							stopReason: StopReason.UNKNOWN,
							endAmps: freshest.startAmps,
						},
					})
					.catch((err: unknown) => {
						log.warn(
							{ err, eventId: freshest.id },
							'Failed to close stale ChargingEvent before fresh adoption'
						);
					});
				log.info(
					{ eventId: freshest.id, ageMs: now.getTime() - freshest.startedAt.getTime() },
					'Closed stale incomplete ChargingEvent (older than max age) before fresh adoption'
				);
			}
			const event = await this.prisma.chargingEvent.create({
				data: {
					startAmps: amps,
					peakSolarKw: this.lastPwData?.solarKw ?? null,
				},
			});
			eventId = event.id;
			startedAt = now;
			peakSolarKw = this.lastPwData?.solarKw ?? 0;
			forcedFlag = false;
		}

		this.activeSession = session;
		this.activeEventId = eventId;
		this.currentAmps = amps;
		this.peakSolarKw = peakSolarKw;
		this.sessionStartedAt = startedAt;
		this.forced = forcedFlag;
		this.state = SunkeepState.CHARGING;
		this.waitReason = null;
		this.chargerConfirmedCurrentSession = true;
		log.info(
			{
				eventId,
				sessionId: session?.sessionId ?? null,
				amps,
				recoveredFromDb: isFresh,
				adoptedWithoutHandle: session === null,
				forced: forcedFlag,
			},
			'Adopted in-progress charging session'
		);
	}

	private async closeStaleIncompleteEvent(): Promise<void> {
		const incompletes = await this.prisma.chargingEvent
			.findMany({ where: { stoppedAt: null }, orderBy: { startedAt: 'desc' } })
			.catch((err: unknown) => {
				log.warn({ err }, 'Failed to look up incomplete ChargingEvent during reconcile');
				return null;
			});
		if (!incompletes || incompletes.length === 0) return;

		const now = new Date();
		await Promise.all(
			incompletes.map((incomplete) =>
				this.prisma.chargingEvent
					.update({
						where: { id: incomplete.id },
						data: {
							stoppedAt: now,
							stopReason: StopReason.UNKNOWN,
							endAmps: incomplete.startAmps,
						},
					})
					.catch((err: unknown) => {
						log.warn({ err, eventId: incomplete.id }, 'Failed to close stale ChargingEvent');
					})
			)
		);
		log.info(
			{ count: incompletes.length, eventIds: incompletes.map((e) => e.id) },
			'Closed stale incomplete ChargingEvent(s) (charger no longer charging)'
		);
	}

	private async startSession(targetAmps: number): Promise<void> {
		// ChargePoint rejects startChargingSession with error 25 when a session already
		// exists on their backend even though the hardware isn't actively CHARGING (ghost
		// session). Detect and stop it first, then fall through to start immediately so
		// manual force-charge doesn't require a second click.
		try {
			const existingStatus = await this.chargePoint.getUserChargingStatus();
			if (existingStatus !== null) {
				log.warn(
					{ sessionId: existingStatus.sessionId },
					'Found ghost ChargePoint session (not reflected on hardware) — stopping before start'
				);
				try {
					await this.chargePoint.stopChargingSession(this.config.chargePointDeviceId);
					log.info('Ghost session stopped; retrying start immediately');
				} catch (stopErr) {
					if (stopErr instanceof NoActiveSessionError) {
						log.info('Ghost session already ended — proceeding with start');
					} else {
						log.warn({ err: stopErr }, 'Failed to stop ghost session — will retry next tick');
						this.state = SunkeepState.WAITING;
						this.waitReason = 'ChargePoint start error';
						return;
					}
				}
				// Ghost is gone — fall through to start below
			}
		} catch (err) {
			log.warn({ err }, 'getUserChargingStatus check before start failed — proceeding anyway');
		}

		await this.chargePoint.setAmperageLimit(this.config.chargePointDeviceId, targetAmps);

		// Persist the event row up-front so the attempt is always recorded.
		// ChargePoint's post-start status poll can timeout (slow user-status
		// propagation) even when the start command succeeded and the car is
		// physically drawing power — without this, every such case left us
		// with a charging car and zero DB evidence.
		const event = await this.prisma.chargingEvent.create({
			data: {
				startAmps: targetAmps,
				peakSolarKw: this.lastPwData?.solarKw ?? null,
				forced: this.forced,
			},
		});
		const startedAt = new Date();

		let session: ChargingSession;
		try {
			session = await this.chargePoint.startChargingSession(this.config.chargePointDeviceId);
		} catch (err) {
			// node-chargepoint cross-checks the charger directly when user-status
			// polling times out. If that fallback confirmed CHARGING, the start
			// succeeded — adopt the row immediately so we record this session's
			// real start instead of waiting for the next tick.
			if (err instanceof StartVerificationTimeoutError && err.chargerConfirmedCharging) {
				this.activeEventId = event.id;
				this.currentAmps = targetAmps;
				this.peakSolarKw = this.lastPwData?.solarKw ?? 0;
				this.sessionStartedAt = startedAt;
				this.state = SunkeepState.CHARGING;
				this.chargerConfirmedCurrentSession = false;
				log.warn(
					{ targetAmps, eventId: event.id, pollAttempts: err.pollAttempts },
					'ChargePoint user-status poll timed out but charger reports CHARGING; treating as success'
				);
				return;
			}
			// Leave the row open so the next tick's reconcile resolves it (adopt if
			// the start did take, close as UNKNOWN if it didn't).
			log.warn(
				{ err, eventId: event.id, targetAmps },
				'startChargingSession failed; leaving event open for next-tick reconcile'
			);
			// CommunicationError is a transient ChargePoint API error. Go to WAITING so the next
			// tick retries cleanly instead of landing in ERROR state and alarming dashboards.
			// Error 25 ("unable to start — try again after unplugging") means the Tesla's
			// onboard charger rejected the start because the car is at its charge limit —
			// treat it as "Car fully charged" so the status is consistent with the DONE path.
			if (err instanceof CommunicationError) {
				this.state = SunkeepState.WAITING;
				let waitReason = 'ChargePoint start error';
				try {
					const payload = JSON.parse(err.message.slice(err.message.indexOf('{'))) as {
						errorId?: number;
						errorMessage?: string;
					};
					if (payload.errorId === 25) {
						waitReason = 'Car fully charged';
						// The start was definitively rejected (car at charge limit), so no
						// charging happened — drop the event row we optimistically created
						// instead of leaving it open for next-tick reconcile to close as a
						// bogus UNKNOWN "session". Set the guard so we stop re-attempting.
						this.carReportedFull = true;
						// No session exists, so this force-start did not take — drop the
						// forced flag to keep the invariant "no active session ⇒ not forced"
						// and avoid poisoning a later automated start.
						this.forced = false;
						await this.prisma.chargingEvent
							.delete({ where: { id: event.id } })
							.catch((delErr: unknown) => {
								log.warn(
									{ err: delErr, eventId: event.id },
									'Failed to delete event row after car-full (error 25) start rejection'
								);
							});
					} else if (payload.errorMessage) {
						waitReason = payload.errorMessage;
					}
				} catch {
					// keep default
				}
				this.waitReason = waitReason;
				return;
			}
			throw err;
		}

		this.activeSession = session;
		this.activeEventId = event.id;
		this.currentAmps = targetAmps;
		this.peakSolarKw = this.lastPwData?.solarKw ?? 0;
		this.sessionStartedAt = startedAt;
		this.state = SunkeepState.CHARGING;
		this.chargerConfirmedCurrentSession = false;
		log.info(
			{ targetAmps, sessionId: session.sessionId, eventId: event.id },
			'Charging session started'
		);
	}

	private async stopActiveSession(reason: StopReason): Promise<void> {
		if (!this.activeEventId) {
			// No session to close, but make sure a stale forced flag can't survive.
			this.forced = false;
			return;
		}

		const session = this.activeSession;
		const eventId = this.activeEventId;
		const endAmps = this.currentAmps;

		try {
			if (session) {
				await session.stop();
			} else {
				// activeEventId set but no session handle (StartVerificationTimeoutError path) —
				// stop by device ID as fallback; expected to 165 if charger already idle (Case 3).
				await this.chargePoint.stopChargingSession(this.config.chargePointDeviceId);
			}
		} catch (err) {
			if (err instanceof NoActiveSessionError) {
				log.info('Session already ended on charger, skipping stop');
			} else {
				log.warn({ err }, 'Error stopping ChargePoint session');
			}
		}

		try {
			await this.prisma.chargingEvent.update({
				where: { id: eventId },
				data: {
					stoppedAt: new Date(),
					stopReason: reason,
					endAmps,
					energyKwh: session?.energyKwh ?? null,
				},
			});
		} catch (err) {
			log.error({ err }, 'Failed to update ChargingEvent on session stop');
		}

		log.info({ reason, sessionId: session?.sessionId ?? null }, 'Charging session stopped');
		this.activeSession = null;
		this.activeEventId = null;
		this.currentAmps = 0;
		this.peakSolarKw = 0;
		this.sessionStartedAt = null;
		this.lockedAmps = null;
		this.chargerConfirmedCurrentSession = false;
		this.forced = false;
	}
}
