import { initLogger } from '@repo/logger/server';
import {
	InvalidSession,
	StartVerificationTimeoutError,
	isWithinChargeScheduleWindow,
	type ChargingSession,
	type HomeChargerConfiguration,
	type HomeChargerStatus,
	type TimeString,
	type UserChargingStatus,
} from 'node-chargepoint';
import type {
	ActiveSessionSummary,
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

interface IChargePointClient {
	getHomeChargerStatus(chargerId: number): Promise<HomeChargerStatus>;
	setAmperageLimit(chargerId: number, amps: number): Promise<void>;
	startChargingSession(deviceId: number): Promise<ChargingSession>;
	stopChargingSession(deviceId: number): Promise<void>;
	getHomeChargerTechnicalInfo(
		chargerId: number
	): Promise<{ softwareVersion: string; deviceIp: string }>;
	getHomeChargerConfig(chargerId: number): Promise<HomeChargerConfiguration>;
	getUserChargingStatus(): Promise<UserChargingStatus | null>;
	getChargingSession(sessionId: number): Promise<ChargingSession>;
}

interface IncompleteChargingEvent {
	id: string;
	startedAt: Date;
	startAmps: number;
	peakSolarKw: number | null;
}

interface IPrismaChargingEvent {
	create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
	update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
	findFirst(args: {
		where: { stoppedAt: null };
		orderBy: { startedAt: 'asc' | 'desc' };
	}): Promise<IncompleteChargingEvent | null>;
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
		if (chargerStatus.chargingStatus === 'CHARGING') {
			await this.reconcileWithCharger(chargerStatus);
			// Cast: TS narrowed state to non-CHARGING after the early return at the
			// top of this method, but reconcile may have mutated it via adoption.
			if ((this.state as SunkeepState) === SunkeepState.CHARGING) return;
		}
		const excessKw = pwData.solarKw - pwData.loadKw;
		const targetAmps = calcTargetAmps(excessKw);
		await this.startSession(targetAmps);
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

		// Reconcile in-memory state with what the charger and database say.
		// Handles process restarts that left a session running on the charger
		// and/or an open ChargingEvent row in the DB.
		await this.reconcileWithCharger(chargerStatus);

		// Adoption failed — charger is delivering current but getUserChargingStatus
		// returned null (session started by a schedule or via the ChargePoint app).
		// Do not attempt to start a competing session; wait for the next tick to
		// retry adoption once the session becomes visible in the API.
		if (chargerStatus.chargingStatus === 'CHARGING' && !this.activeSession) {
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

		const inSolarWindow = isWithinChargeScheduleWindow({
			startTime: this.config.solarWindowStart as TimeString,
			endTime: this.config.solarWindowEnd as TimeString,
		});
		if (!inSolarWindow) {
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
			this.state = SunkeepState.IDLE;
			this.waitReason = null;
			return;
		}

		if (pwData.solarKw === 0) {
			if (this.state === SunkeepState.CHARGING) {
				await this.stopActiveSession(StopReason.NIGHT_SAFETY);
			}
			this.state = SunkeepState.WAITING;
			this.waitReason = 'No solar production';
			return;
		}

		if (pwData.batteryPct < this.config.soeThreshold) {
			if (this.state === SunkeepState.CHARGING) {
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

		if (excessKw < MIN_EXCESS_KW) {
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
		// The session was almost certainly started by a prior process instance —
		// adopt it so the state machine and excessKw calculation behave correctly.
		if (chargerIsCharging && !this.activeSession) {
			await this.adoptOrphanedSession(chargerStatus);
			return;
		}

		// Case 2: Charger is NOT charging but the DB still has an open
		// ChargingEvent (no stoppedAt). The session ended outside our awareness
		// (e.g. crash between session.stop() and the DB update). Close the row
		// so it doesn't linger as a phantom in-progress event.
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
		if (!userStatus) {
			// Charger is delivering current but the session isn't visible via the
			// user API — most likely an auto-start triggered on plug-in. Stop it so
			// sunkeep can establish its own managed session on the next tick.
			log.warn(
				'Charger reports CHARGING but getUserChargingStatus returned null — stopping auto-started session'
			);
			try {
				await this.chargePoint.stopChargingSession(this.config.chargePointDeviceId);
				log.info('Stopped auto-started session; managed session will start next tick');
			} catch (err) {
				log.warn({ err }, 'Failed to stop auto-started session — will retry next tick');
			}
			return;
		}

		let session: ChargingSession;
		try {
			session = await this.chargePoint.getChargingSession(userStatus.sessionId);
		} catch (err) {
			log.warn({ err, sessionId: userStatus.sessionId }, 'getChargingSession failed');
			return;
		}

		const amps = chargerStatus.amperageLimit;
		const incomplete = await this.prisma.chargingEvent
			.findFirst({ where: { stoppedAt: null }, orderBy: { startedAt: 'desc' } })
			.catch((err: unknown) => {
				log.warn({ err }, 'Failed to look up incomplete ChargingEvent during adoption');
				return null;
			});

		const now = new Date();
		const isFresh =
			incomplete !== null &&
			now.getTime() - incomplete.startedAt.getTime() <= MAX_INCOMPLETE_EVENT_AGE_MS;

		let eventId: string;
		let startedAt: Date;
		let peakSolarKw: number;
		if (isFresh && incomplete) {
			eventId = incomplete.id;
			startedAt = incomplete.startedAt;
			peakSolarKw = incomplete.peakSolarKw ?? this.lastPwData?.solarKw ?? 0;
		} else {
			// Either no DB row exists, or the existing one is too old to plausibly
			// belong to the currently-active ChargePoint session. Close the stale
			// row (if any) and start a fresh event keyed to the adoption moment.
			if (incomplete) {
				await this.prisma.chargingEvent
					.update({
						where: { id: incomplete.id },
						data: {
							stoppedAt: now,
							stopReason: StopReason.UNKNOWN,
							endAmps: incomplete.startAmps,
						},
					})
					.catch((err: unknown) => {
						log.warn(
							{ err, eventId: incomplete.id },
							'Failed to close stale ChargingEvent before fresh adoption'
						);
					});
				log.info(
					{ eventId: incomplete.id, ageMs: now.getTime() - incomplete.startedAt.getTime() },
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
		}

		this.activeSession = session;
		this.activeEventId = eventId;
		this.currentAmps = amps;
		this.peakSolarKw = peakSolarKw;
		this.sessionStartedAt = startedAt;
		this.state = SunkeepState.CHARGING;
		this.waitReason = null;
		log.info(
			{
				eventId,
				sessionId: session.sessionId,
				amps,
				recoveredFromDb: isFresh,
			},
			'Adopted in-progress charging session'
		);
	}

	private async closeStaleIncompleteEvent(): Promise<void> {
		const incomplete = await this.prisma.chargingEvent
			.findFirst({ where: { stoppedAt: null }, orderBy: { startedAt: 'desc' } })
			.catch((err: unknown) => {
				log.warn({ err }, 'Failed to look up incomplete ChargingEvent during reconcile');
				return null;
			});
		if (!incomplete) return;

		try {
			await this.prisma.chargingEvent.update({
				where: { id: incomplete.id },
				data: {
					stoppedAt: new Date(),
					stopReason: StopReason.UNKNOWN,
					endAmps: incomplete.startAmps,
				},
			});
			log.info(
				{ eventId: incomplete.id },
				'Closed stale incomplete ChargingEvent (charger no longer charging)'
			);
		} catch (err) {
			log.warn({ err, eventId: incomplete.id }, 'Failed to close stale ChargingEvent');
		}
	}

	private async startSession(targetAmps: number): Promise<void> {
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
				log.warn(
					{ targetAmps, eventId: event.id, pollAttempts: err.pollAttempts },
					'ChargePoint user-status poll timed out but charger reports CHARGING; treating as success'
				);
				return;
			}
			// Either a hard failure or a timeout we can't confirm. Leave the row
			// open so the next tick's reconcile resolves it (adopt if the start
			// did take, close as UNKNOWN if it didn't).
			log.warn(
				{ err, eventId: event.id, targetAmps },
				'startChargingSession failed; leaving event open for next-tick reconcile'
			);
			throw err;
		}

		this.activeSession = session;
		this.activeEventId = event.id;
		this.currentAmps = targetAmps;
		this.peakSolarKw = this.lastPwData?.solarKw ?? 0;
		this.sessionStartedAt = startedAt;
		this.state = SunkeepState.CHARGING;
		log.info(
			{ targetAmps, sessionId: session.sessionId, eventId: event.id },
			'Charging session started'
		);
	}

	private async stopActiveSession(reason: StopReason): Promise<void> {
		if (!this.activeSession || !this.activeEventId) return;

		const session = this.activeSession;
		const eventId = this.activeEventId;
		const endAmps = this.currentAmps;

		try {
			await session.stop();
		} catch (err) {
			log.warn({ err }, 'Error stopping ChargePoint session');
		}

		try {
			await this.prisma.chargingEvent.update({
				where: { id: eventId },
				data: {
					stoppedAt: new Date(),
					stopReason: reason,
					endAmps,
					energyKwh: session.energyKwh,
				},
			});
		} catch (err) {
			log.error({ err }, 'Failed to update ChargingEvent on session stop');
		}

		log.info({ reason, sessionId: session.sessionId }, 'Charging session stopped');
		this.activeSession = null;
		this.activeEventId = null;
		this.currentAmps = 0;
		this.peakSolarKw = 0;
		this.sessionStartedAt = null;
		this.lockedAmps = null;
	}
}
