import { initLogger } from '@repo/logger/server';
import {
	ChargerBusyError,
	CommunicationError,
	InvalidSession,
	NoActiveSessionError,
	StartVerificationTimeoutError,
	UnresolvedSessionError,
	VehicleNotReadyError,
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
// The effective "enough solar to charge" threshold is MIN_AMPS * VOLTAGE = 1.92 kW —
// the smallest draw the charger can deliver. There is no separate excess threshold:
// charging starts when the measured surplus can cover MIN_AMPS and stops when it can
// no longer cover the draw the car already has (see resolveTargetAmps).
//
// Number of consecutive ticks the charger must report a non-charging status before we
// treat an owned session as externally stopped. ChargePoint occasionally returns a single
// not-charging poll for a session that is still live (e.g. right after an amperage
// change); closing on the first observation tore the event down and the next tick rebuilt
// it, churning ~10-minute "unknown" rows. Requiring two observations debounces that blip.
const EXTERNAL_STOP_CONFIRM_TICKS = 2;
// Default hysteresis deadband (percentage points) when config.soeHysteresis is unset.
const DEFAULT_SOE_HYSTERESIS = 15;
// Open ChargingEvent rows older than this are assumed to belong to a prior
// session that ended outside our awareness — when adopting, we close them
// and start a fresh row rather than show a misleading multi-day duration.
const MAX_INCOMPLETE_EVENT_AGE_MS = 12 * 60 * 60 * 1000;
// Tesla's live_status lags the hardware by up to a couple of minutes. A load reading
// taken less than this long after the charger was last seen delivering current may
// still include the car, so it is not trusted as a car-free house baseline.
const BASELINE_SETTLE_MS = 2 * 60 * 1000;
// A captured house baseline older than this is discarded — household draw drifts over
// the day (AC, oven, dryer) and a stale baseline would misattribute it to the car.
const MAX_BASELINE_AGE_MS = 6 * 60 * 60 * 1000;
// How much the metered load must rise after an amperage raise for the car to count as
// having responded to it. Below this it is meter noise, not the car.
const RAISE_RESPONSE_EPSILON_KW = 0.2;
// Longest gap between polls we will integrate energy across. The scheduler ticks every
// 10 minutes; anything much longer than that means the process was asleep, and one
// reading says nothing about what the car did in between.
const MAX_ENERGY_ACCRUAL_HOURS = 1;

function clampAmps(amps: number): number {
	return Math.max(MIN_AMPS, Math.min(MAX_AMPS, amps));
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
	// Live energy delivered in the current session (kWh), as last reported by the charger's
	// device-plane status (HomeChargerStatus.energyKwh). This is the only energy reading
	// available for sessions adopted without a driver-plane session handle (the common case
	// for chargers whose auto-started sessions never surface via getUserChargingStatus) —
	// session?.energyKwh is null in that case, so this is the fallback persisted on stop.
	private lastKnownEnergyKwh: number | null = null;
	// Energy integrated from our own power estimate over the current session, in kWh, and
	// the poll it was last accrued at. node-chargepoint only fills HomeChargerStatus.
	// energyKwh when the charger's status payload carries it, and a charger whose device
	// plane omits the session id (the same one whose sessions cannot be stopped over REST)
	// omits this too — leaving both of the readings above null for every session and
	// energyKwh null on every row. Integrating carLoadKw over the session is the only
	// figure available; rows filled this way are flagged energyEstimated.
	private estimatedEnergyKwh = 0;
	private lastEnergyAccrualAt: number | null = null;
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
	// Count of consecutive ticks the charger has reported a non-charging status while we
	// still own a confirmed session. Reset to 0 whenever the charger reports CHARGING or
	// the session is closed. Used to debounce transient not-charging polls before closing
	// an owned session as an external stop (see EXTERNAL_STOP_CONFIRM_TICKS).
	private notChargingStreak = 0;
	// Last Powerwall load reading (kW) taken while the charger was demonstrably not
	// delivering current — i.e. the house's own draw with the car excluded. Subtracting
	// it from a later load reading measures what the car is actually pulling. Null until
	// a trustworthy idle reading has been observed.
	private houseBaselineKw: number | null = null;
	private houseBaselineAt: number | null = null;
	// Local-clock ms of the last poll that saw the charger delivering current. Used to
	// reject load readings that are too fresh to be car-free (see BASELINE_SETTLE_MS).
	private lastChargerChargingAt: number | null = null;
	// Why Sunkeep wanted the current session closed, when the stop command did not take
	// and the charger kept delivering current. The event row stays open until the charger
	// actually stops, and closes with this reason rather than the generic one the later
	// poll would supply. Null when no stop is outstanding.
	private stopPendingReason: StopReason | null = null;
	// Metered load at the moment we last raised the limit. If the following poll shows the
	// car took none of that headroom, raising again would walk the limit up against a car
	// that is not listening (one tapering at its charge limit, or one whose onboard
	// charger caps lower) and hand it a large limit to wake up into. Cleared whenever the
	// limit is lowered or the session ends.
	private loadAtLastRaiseKw: number | null = null;
	// Tesla live_status timestamp of the reading that drove the last amperage adjustment.
	// A tick whose reading carries the same timestamp is looking at pre-adjustment data,
	// so it must not adjust again — back-to-back polls (manual POST /sunkeep/poll, or the
	// client's 30s live_status cache) would otherwise ratchet the amps upward on a single
	// stale measurement. Cleared whenever a session starts or stops.
	private lastAdjustTeslaAt: string | null = null;

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

		const pw = this.lastPwData;
		// One amperage source for every derived figure below. Previously carKw keyed off
		// `state` while excessKw keyed off `activeSession`, so a session adopted without a
		// session handle (the common case — activeSession null, state CHARGING) described
		// the car at two different amperages within the same payload.
		const carKw = pw != null ? this.carLoadKw(pw, this.activeCarAmps()) : null;

		return {
			state: this.state,
			enabled: this.state !== SunkeepState.DISABLED,
			lastPollAt: this.lastPollAt?.toISOString() ?? null,
			activeSession: session,
			solarKw: pw?.solarKw ?? null,
			excessKw: pw != null ? this.computeExcessKw(pw, carKw ?? 0) : null,
			loadKw: pw?.loadKw ?? null,
			carKw,
			houseKw: pw != null ? Math.max(0, pw.loadKw - (carKw ?? 0)) : null,
			batteryPct: pw?.batteryPct ?? null,
			batteryKw: pw?.batteryKw ?? null,
			lockedAmps: this.lockedAmps,
			chargerAmps: this.chargerAmps,
			isPluggedIn: this.isPluggedIn,
			gridKw: pw?.gridKw ?? null,
			gridStatus: pw?.gridStatus ?? null,
			lastTeslaAt: pw?.lastTeslaAt ?? null,
			waitReason: this.state === SunkeepState.WAITING ? this.waitReason : null,
			forced: this.forced,
		};
	}

	// Amperage ceiling currently applied to the car. While we own the session that is what
	// we last commanded; otherwise it is whatever limit the charger reports while it is
	// delivering current. Both getStatus() and the tick's excess maths read this so the
	// two can never disagree about how hard the car is being driven.
	private activeCarAmps(): number {
		if (this.state === SunkeepState.CHARGING) return this.currentAmps;
		if (this.chargerChargingStatus === 'CHARGING' && this.chargerAmps) return this.chargerAmps;
		return 0;
	}

	// Best available estimate of what the car is really drawing, in kW.
	//
	// ChargePoint only exposes an amperage *limit*, never a power measurement. The car
	// draws less than the limit whenever its onboard charger caps lower, whenever it
	// tapers near its charge limit, and for the minutes before the charger applies a new
	// limit. Treating the limit as a measurement is what reported a car load larger than
	// the site's entire load (and, downstream in fiendlord-keep, a negative house load).
	//
	// The Powerwall's load_power *is* a measurement, and it covers everything behind the
	// meter including the car — so subtracting a house baseline captured while the charger
	// was idle measures the car directly. The amperage limit stays on as a ceiling, and
	// the result is clamped into [0, loadKw] so the car can never be reported as drawing
	// more than the whole site.
	private carLoadKw(pw: PowerwallData, amps: number): number {
		if (amps <= 0) return 0;
		const ceilingKw = Math.min((amps * VOLTAGE) / 1000, pw.loadKw);
		const baselineKw = this.freshHouseBaselineKw();
		if (baselineKw === null) return Math.max(0, ceilingKw);
		return Math.max(0, Math.min(ceilingKw, pw.loadKw - baselineKw));
	}

	private freshHouseBaselineKw(): number | null {
		if (this.houseBaselineKw === null || this.houseBaselineAt === null) return null;
		if (Date.now() - this.houseBaselineAt > MAX_BASELINE_AGE_MS) return null;
		return this.houseBaselineKw;
	}

	// Production that nothing is currently consuming, in kW. By the Powerwall's energy
	// identity (solar + battery + grid = load) this equals −gridKw − batteryKw: power
	// flowing out to the grid plus power going into the battery. Negative means the car
	// is already being fed by the grid or the battery.
	private surplusKw(pw: PowerwallData): number {
		return pw.solarKw - pw.loadKw;
	}

	// Amperage the car should be running at, given what the meters say right now.
	//
	// This is closed-loop while a session is live: the car's present draw is already
	// inside loadKw, so the measured surplus is exactly the headroom left to hand it,
	// and correcting the *current* amperage by that surplus needs no estimate of what
	// the car is drawing — the one quantity the hardware will not tell us.
	//
	// The old open-loop form (solar − load + commandedAmps × 240 V, fed to a fresh
	// target) had to guess that draw, and any error compounded: guess high, command
	// higher, guess higher still. Closed-loop cannot compound, because whatever the car
	// actually does with a new limit shows up in the next poll's surplus.
	//
	// Truncating toward zero gives a one-amp (240 W) deadband so meter noise around the
	// settle point does not twitch the charger, and makes the start and stop thresholds
	// exactly complementary: we start when the surplus covers MIN_AMPS, and stop when it
	// can no longer cover the draw the car already has — so stopping frees MIN_AMPS of
	// surplus, which is not enough to immediately restart.
	private resolveTargetAmps(pw: PowerwallData, runningAmps: number): number {
		const surplusAmps = (this.surplusKw(pw) * 1000) / VOLTAGE;
		return runningAmps > 0 ? runningAmps + Math.trunc(surplusAmps) : Math.floor(surplusAmps);
	}

	// Solar power available to the car, in kW: production minus the house's own draw.
	// loadKw already includes the car, so the car's measured draw is added back; battery
	// charging is subtracted because that solar is already spoken for. Because carLoadKw
	// is clamped to the measured load, excess can never exceed solar production — the
	// physical invariant the old commanded-amps arithmetic violated (it reported 6.48 kW
	// of excess against 5.89 kW of production).
	private computeExcessKw(pw: PowerwallData, carKw: number): number {
		return pw.solarKw - pw.loadKw + carKw + Math.min(0, pw.batteryKw ?? 0);
	}

	// Integrate the car's draw across the gap since the previous poll. Called once per
	// poll while we own a session; the clock starts when the session does, so the first
	// interval counts rather than being lost.
	private accrueEnergy(pw: PowerwallData): void {
		const now = Date.now();
		const since = this.lastEnergyAccrualAt;
		this.lastEnergyAccrualAt = now;
		if (since === null) return;
		const hours = (now - since) / 3_600_000;
		// A gap far longer than the poll interval means the process was asleep or the
		// scheduler stalled; we have no idea what the car did in between, so skip it
		// rather than extrapolate one reading across hours.
		if (hours <= 0 || hours > MAX_ENERGY_ACCRUAL_HOURS) return;
		this.estimatedEnergyKwh += this.carLoadKw(pw, this.activeCarAmps()) * hours;
	}

	// Energy to persist when closing a session. ChargePoint's own readings win when it
	// gives us any; otherwise fall back to what we integrated ourselves.
	private resolveSessionEnergy(session: ChargingSession | null): {
		energyKwh: number | null;
		energyEstimated: boolean;
	} {
		const reported = session?.energyKwh ?? this.lastKnownEnergyKwh ?? null;
		if (reported != null) return { energyKwh: reported, energyEstimated: false };
		if (this.estimatedEnergyKwh <= 0) return { energyKwh: null, energyEstimated: false };
		return { energyKwh: +this.estimatedEnergyKwh.toFixed(3), energyEstimated: true };
	}

	// Record what this poll tells us about the house's car-free draw. Only readings taken
	// with nothing plausibly charging qualify — if the baseline absorbs the car's own draw
	// then every later carLoadKw() reads as zero, the excess collapses, and Sunkeep stops
	// the session it just started.
	//
	// "Nothing plausibly charging" is deliberately broad: ChargePoint's reported status
	// lags a start by a poll or two, so an owned session counts even while the charger
	// still says NOT_CHARGING. Call this after the charger fields have been refreshed for
	// the current poll but before reconcile mutates ownership, so the ownership flags
	// describe the period the load reading was actually taken over.
	private observePower(pw: PowerwallData): void {
		const carMayBeDrawing =
			this.chargerChargingStatus === 'CHARGING' ||
			this.state === SunkeepState.CHARGING ||
			this.activeSession !== null ||
			this.activeEventId !== null;
		if (carMayBeDrawing) {
			this.lastChargerChargingAt = Date.now();
			return;
		}
		const readingAt = pw.lastTeslaAt ? Date.parse(pw.lastTeslaAt) : Date.now();
		const readingMs = Number.isNaN(readingAt) ? Date.now() : readingAt;
		if (
			this.lastChargerChargingAt !== null &&
			readingMs - this.lastChargerChargingAt < BASELINE_SETTLE_MS
		) {
			return;
		}
		this.houseBaselineKw = pw.loadKw;
		this.houseBaselineAt = Date.now();
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
			// Any other error (transient Tesla 5xx/429/timeout, ChargePoint comms, network)
			// must not tear down an active session. Tesla's API is flaky enough that closing
			// the session on a single failed poll repeatedly interrupted charging and churned
			// "error" events. Keep the current state and session and retry next tick;
			// management resumes once the upstream recovers.
			log.warn(
				{ err },
				'Sunkeep tick failed — keeping current state and session, will retry next tick'
			);
		}
	}

	async manualStopSession(): Promise<void> {
		if (this.state === SunkeepState.CHARGING) {
			await this.stopActiveSession(StopReason.MANUAL);
			this.state = SunkeepState.IDLE;
			this.waitReason = null;
			return;
		}
		// Sunkeep's own state can already have drifted to WAITING while the charger is
		// still physically delivering current — e.g. an earlier automated stop attempt
		// hit UnresolvedSessionError (session id not visible over REST) and could only
		// clamp amps, not actually stop it. Trust the last-known charger status (updated
		// every tick) over our own FSM state so a force-stop always retries the stop
		// instead of silently no-op'ing.
		if (this.chargerChargingStatus !== 'CHARGING' && !this.activeEventId) return;
		if (this.activeEventId) {
			await this.stopActiveSession(StopReason.MANUAL);
		} else {
			await this.stopExternalCharger('Manual stop');
		}
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
		this.observePower(pwData);
		if (typeof chargerStatus.energyKwh === 'number')
			this.lastKnownEnergyKwh = chargerStatus.energyKwh;
		// An explicit force start overrides a latched "car full". Both signals for it —
		// ChargePoint's DONE status and the carReportedFull guard set by a previous error-25
		// rejection — describe a car that was at its charge limit at some point in the past,
		// and both go stale the moment the limit is raised or the car is woken. Refusing to
		// even attempt the start left the user with a charger that starts fine from the
		// ChargePoint app while Sunkeep insists the car is full. Let ChargePoint be the
		// judge: a car that genuinely will not take current comes back as
		// VehicleNotReadyError, which startSession() surfaces as "Car fully charged" and
		// re-latches the guard.
		this.carReportedFull = false;
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
		// The charger is not delivering current on this path, so the whole measured
		// surplus is available. A forced start ignores the MIN_AMPS floor and takes the
		// charger's minimum when the surplus cannot cover it.
		await this.startSession(clampAmps(this.resolveTargetAmps(pwData, 0)));
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
		this.observePower(pwData);
		if (typeof chargerStatus.energyKwh === 'number')
			this.lastKnownEnergyKwh = chargerStatus.energyKwh;
		if (this.activeEventId) this.accrueEnergy(pwData);
		if (chargerStatus.chargingStatus === 'CHARGING' && (this.activeSession || this.activeEventId)) {
			this.chargerConfirmedCurrentSession = true;
		}
		// The charger is delivering current again, so any prior "car full" rejection is
		// stale — clear the guard so normal management resumes. A CHARGING poll also clears
		// the external-stop debounce streak: whatever made an earlier poll read not-charging
		// was transient.
		if (chargerStatus.chargingStatus === 'CHARGING') {
			this.carReportedFull = false;
			this.notChargingStreak = 0;
		}

		const inSolarWindow = isWithinChargeScheduleWindow({
			startTime: this.config.solarWindowStart as TimeString,
			endTime: this.config.solarWindowEnd as TimeString,
		});

		// The charger is delivering current but Sunkeep does not own this session yet
		// (auto-start on plug-in, ChargePoint app, etc.). If our solar policy says we
		// should not be charging right now, stop the charger WITHOUT adopting it. Adopting
		// here would create a ChargingEvent that the gates below immediately close, which
		// spammed a junk row on every tick while the car kept auto-restarting the session.
		// Forced sessions are always owned (activeEventId set), so they never reach here.
		if (
			chargerStatus.chargingStatus === 'CHARGING' &&
			!this.activeSession &&
			!this.activeEventId &&
			!this.forced
		) {
			// Only reject-without-adopting when there is no open event to reuse. A forced
			// session (or a managed session mid-flight across a restart) always has an open
			// row — defer to reconcile so it reuses that row and restores the forced flag
			// rather than being stopped here. The junk-creation case is precisely "no open
			// row to reuse" (adoption would CREATE one).
			const reject = this.evaluateSolarPolicy(chargerStatus, pwData, inSolarWindow);
			if (reject && !(await this.hasReusableChargingEvent())) {
				await this.stopExternalCharger(reject.waitReason);
				this.state = SunkeepState.WAITING;
				this.waitReason = reject.waitReason;
				return;
			}
		}

		// Debounce a transient not-charging poll for a session we own. ChargePoint sometimes
		// reports a single NOT_CHARGING status for a session that is still live (notably right
		// after an amperage change). Closing on the first observation tore the event down and
		// the next tick rebuilt it, churning "unknown" rows every ~10 minutes. Hold for one
		// tick before letting reconcile close it; a real external stop is confirmed by the
		// next not-charging poll. DONE and unplugged are excluded — they have dedicated
		// handlers below that close with a specific reason.
		const ownsConfirmedSession =
			this.chargerConfirmedCurrentSession &&
			(this.activeSession !== null || this.activeEventId !== null);
		const chargerReportsStopped =
			chargerStatus.chargingStatus !== 'CHARGING' &&
			chargerStatus.chargingStatus !== 'DONE' &&
			chargerStatus.isPluggedIn;
		if (ownsConfirmedSession && chargerReportsStopped) {
			this.notChargingStreak += 1;
			if (this.notChargingStreak < EXTERNAL_STOP_CONFIRM_TICKS) {
				log.info(
					{ streak: this.notChargingStreak, chargingStatus: chargerStatus.chargingStatus },
					'Charger reports not charging for an owned session — holding one tick before closing'
				);
				return;
			}
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

		// A previous start was rejected with error 25 while the charger reports a non-DONE
		// status. Don't re-attempt (which would create a junk ChargingEvent row every
		// tick) — hold in WAITING until the car is unplugged (handled in the !isPluggedIn
		// branch below) or starts charging again (handled at the top of tick). The DONE
		// handler above already claimed the genuine car-full case, so anything reaching
		// here is ChargePoint refusing a start for a car it does not call full.
		if (chargerStatus.isPluggedIn && this.carReportedFull) {
			this.state = SunkeepState.WAITING;
			this.waitReason = 'ChargePoint rejected start';
			return;
		}

		// A forced session charges at any hour — skip the solar-window/night-safety,
		// no-solar, battery-threshold, and insufficient-excess gates below. These gates
		// mirror evaluateSolarPolicy() above but additionally close an owned session and
		// transition state, so a session adopted on a prior tick is stopped here exactly
		// once (one legit event close) before becoming unowned and handled above.
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

		// Hysteresis: start charging at soeThreshold, but once charging don't stop until the
		// battery drops below (soeThreshold - soeHysteresis). Avoids on/off flapping when the
		// battery hovers right at the threshold.
		const batteryFloor = this.batteryFloor(this.state === SunkeepState.CHARGING);
		if (!this.forced && pwData.batteryPct < batteryFloor) {
			if (this.state === SunkeepState.CHARGING) {
				// We adopted a session the charger auto-started (e.g. on plug-in) but the
				// Powerwall has fallen below the floor — stop it. Force-charged sessions skip
				// this gate (this.forced short-circuits above).
				log.info(
					{ batteryPct: pwData.batteryPct, batteryFloor },
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

		const carAmps =
			this.state === SunkeepState.CHARGING
				? this.currentAmps
				: chargerStatus.chargingStatus === 'CHARGING' && chargerStatus.amperageLimit
					? chargerStatus.amperageLimit
					: 0;
		// Below MIN_AMPS means the charger cannot go low enough to stay within the solar
		// we are measuring — for a live session, that the car's present draw is no longer
		// covered even after winding it all the way down.
		const rawTargetAmps = this.resolveTargetAmps(pwData, carAmps);

		if (!this.forced && rawTargetAmps < MIN_AMPS) {
			if (this.state === SunkeepState.CHARGING) {
				await this.stopActiveSession(StopReason.SOLAR_DROPPED);
				this.state = SunkeepState.WAITING;
			} else {
				this.state = SunkeepState.WAITING;
			}
			this.waitReason = 'Insufficient solar excess';
			return;
		}

		const targetAmps = clampAmps(rawTargetAmps);

		if (this.state === SunkeepState.CHARGING) {
			// Policy allows charging again, so any stop we were holding open is moot — the
			// session continues on the same row and will close with whatever ends it.
			this.stopPendingReason = null;
			// Two ticks that read the same Tesla live_status snapshot must not both act on
			// it: the second is looking at a measurement taken before the first one's
			// amperage change, so the car's response is not in the data yet. Bursts of
			// POST /sunkeep/poll hit this constantly — the Tesla client serves a 30-second
			// cache, and Tesla's own telemetry lags further behind that.
			const readingKey = pwData.lastTeslaAt ?? null;
			const alreadyActedOnReading = readingKey !== null && readingKey === this.lastAdjustTeslaAt;
			// The car ignored the last raise, so it will ignore this one too — and every
			// unheeded raise leaves a bigger limit for it to wake up into.
			const raising = targetAmps > this.currentAmps;
			const carIgnoredLastRaise =
				raising &&
				this.loadAtLastRaiseKw !== null &&
				pwData.loadKw <= this.loadAtLastRaiseKw + RAISE_RESPONSE_EPSILON_KW;
			if (this.lockedAmps === null && targetAmps !== this.currentAmps) {
				if (alreadyActedOnReading) {
					log.debug(
						{ targetAmps, currentAmps: this.currentAmps, lastTeslaAt: readingKey },
						'Skipping amp adjustment — Powerwall reading predates the last change'
					);
				} else if (carIgnoredLastRaise) {
					log.info(
						{ targetAmps, currentAmps: this.currentAmps, loadKw: pwData.loadKw },
						'Skipping amp raise — car did not draw the headroom from the last one'
					);
				} else {
					await this.chargePoint.setAmperageLimit(this.config.chargePointDeviceId, targetAmps);
					this.currentAmps = targetAmps;
					this.lastAdjustTeslaAt = readingKey;
					this.loadAtLastRaiseKw = raising ? pwData.loadKw : null;
					log.info({ targetAmps }, 'Adjusted charge amps');
				}
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

	// Effective battery floor for the threshold gate. When a session is already running we
	// apply the hysteresis deadband (soeThreshold - soeHysteresis) so charging isn't stopped
	// the instant the battery dips below the start threshold; when deciding whether to start
	// fresh we require the full soeThreshold.
	private batteryFloor(charging: boolean): number {
		const hysteresis = this.config.soeHysteresis ?? DEFAULT_SOE_HYSTERESIS;
		return charging ? this.config.soeThreshold - hysteresis : this.config.soeThreshold;
	}

	// Returns a reason when Sunkeep's solar policy says we should not be charging right
	// now, or null when charging is allowed. Used to reject an externally-started session
	// before adopting it. The charger is actively charging in this context, so the battery
	// check uses the hysteresis floor (continue-charging threshold) to match the inline
	// gates in tick().
	private evaluateSolarPolicy(
		chargerStatus: HomeChargerStatus,
		pwData: PowerwallData,
		inSolarWindow: boolean
	): { waitReason: string } | null {
		if (!inSolarWindow) return { waitReason: 'Outside solar window' };
		if (pwData.solarKw === 0) return { waitReason: 'No solar production' };
		if (pwData.batteryPct < this.batteryFloor(true))
			return { waitReason: 'Battery below threshold' };
		const carAmps =
			chargerStatus.chargingStatus === 'CHARGING' && chargerStatus.amperageLimit
				? chargerStatus.amperageLimit
				: 0;
		if (this.resolveTargetAmps(pwData, carAmps) < MIN_AMPS)
			return { waitReason: 'Insufficient solar excess' };
		return null;
	}

	// True when an open (unstopped) ChargingEvent exists that is fresh enough to reuse.
	// Used to decide whether an externally-started session should be stopped without
	// adoption (no reusable row) or handed to reconcile to reuse (e.g. a forced session
	// whose flag must be restored after a restart).
	private async hasReusableChargingEvent(): Promise<boolean> {
		const incompletes = await this.prisma.chargingEvent
			.findMany({ where: { stoppedAt: null }, orderBy: { startedAt: 'desc' } })
			.catch((err: unknown) => {
				log.warn(
					{ err },
					'Failed to check for reusable ChargingEvent before external-charge reject'
				);
				return null;
			});
		const freshest = incompletes?.[0];
		if (!freshest) return false;
		return Date.now() - freshest.startedAt.getTime() <= MAX_INCOMPLETE_EVENT_AGE_MS;
	}

	// Stop a charging session that began outside Sunkeep when our policy is not met, without
	// adopting it or writing a ChargingEvent. node-chargepoint's stopChargingSession resolves
	// the live session id itself (driver plane, then device plane) and stops it by its real
	// sessionId/outletNumber. Best-effort: a charger that is already idle
	// (NoActiveSessionError), or whose session id can't be resolved over REST
	// (UnresolvedSessionError — e.g. a CPH50 that only surfaces auto-started sessions over
	// WebSocket), falls through to the MIN_AMPS clamp below.
	private async stopExternalCharger(reason: string): Promise<void> {
		try {
			await this.chargePoint.stopChargingSession(this.config.chargePointDeviceId);
			log.info({ reason }, 'Stopped externally-started charging (Sunkeep policy not met)');
		} catch (err) {
			if (err instanceof NoActiveSessionError) {
				log.info('Externally-started charging already stopped');
			} else if (err instanceof UnresolvedSessionError) {
				log.warn(
					{ reason },
					'Could not resolve an active ChargePoint session to stop (not visible over REST) — relying on minimum-amps clamp'
				);
			} else {
				log.warn({ err }, 'Failed to stop externally-started charging');
			}
		}
		// Belt-and-suspenders: reduce to minimum amps in case the stop command was not heeded
		// by the hardware (ChargePoint API/hardware desync).
		await this.chargePoint
			.setAmperageLimit(this.config.chargePointDeviceId, MIN_AMPS)
			.catch((err: unknown) => {
				log.warn({ err }, 'Failed to set minimum amps after external stop attempt');
			});
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
			// We own this session but it isn't visible via the user-status API. For
			// app/auto-started sessions this is the normal steady state (it never becomes
			// visible), so this fires every tick — keep it at debug to avoid log spam. The
			// session keeps CHARGING and the tick's manage block adjusts amperage.
			log.debug(
				'Owned session not visible via getUserChargingStatus — managing via charger amperage'
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
		this.lastAdjustTeslaAt = null;
		this.loadAtLastRaiseKw = null;
		this.estimatedEnergyKwh = 0;
		this.lastEnergyAccrualAt = Date.now();
		this.stopPendingReason = null;
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
			log.warn({ err }, 'Pre-start session check failed — proceeding anyway');
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
				this.lastAdjustTeslaAt = null;
				this.loadAtLastRaiseKw = null;
				this.estimatedEnergyKwh = 0;
				this.lastEnergyAccrualAt = Date.now();
				this.stopPendingReason = null;
				log.warn(
					{ targetAmps, eventId: event.id, pollAttempts: err.pollAttempts },
					'ChargePoint user-status poll timed out but charger reports CHARGING; treating as success'
				);
				return;
			}
			// VehicleNotReadyError (ChargePoint error 25) — "try again after the vehicle
			// charging has unplugged". A car sitting at its charge limit is one cause, but
			// so is a stale session on ChargePoint's backend that the REST API will not let
			// us clear: the charger then refuses every start until something outside Sunkeep
			// (the ChargePoint app) resets it. Only claim "Car fully charged" when the
			// charger corroborates it with DONE — reporting that for a car that is merely
			// blocked sends the user hunting for a charge limit that is not the problem.
			//
			// The start was definitively rejected either way, so no charging happened — drop
			// the event row we optimistically created instead of leaving it open for
			// next-tick reconcile to close as a bogus UNKNOWN "session". Set the guard so we
			// stop re-attempting (and churning rows) until something changes.
			if (err instanceof VehicleNotReadyError) {
				const carFull = this.chargerChargingStatus === 'DONE';
				log.warn(
					{ err, eventId: event.id, targetAmps, chargerStatus: this.chargerChargingStatus },
					carFull
						? 'startChargingSession rejected: vehicle not ready (car at charge limit) — dropping event row'
						: 'startChargingSession rejected with error 25 but charger is not DONE — ChargePoint is refusing the start, dropping event row'
				);
				this.state = SunkeepState.WAITING;
				this.waitReason = carFull ? 'Car fully charged' : 'ChargePoint rejected start';
				this.carReportedFull = true;
				// No session exists, so this force-start did not take — drop the forced flag
				// to keep the invariant "no active session ⇒ not forced" and avoid poisoning a
				// later automated start.
				this.forced = false;
				await this.prisma.chargingEvent
					.delete({ where: { id: event.id } })
					.catch((delErr: unknown) => {
						log.warn(
							{ err: delErr, eventId: event.id },
							'Failed to delete event row after vehicle-not-ready (error 25) start rejection'
						);
					});
				return;
			}
			// ChargerBusyError (ChargePoint error 89) means the charger refused the start —
			// the connector is in use by another user or needs to be re-seated ("return plug
			// and try again"). The start definitively did not take, so unlike a generic
			// CommunicationError there is no session for next-tick reconcile to adopt; the
			// optimistically-created row would only be closed as a junk ~10-minute UNKNOWN
			// "session". Drop the row and wait. The condition is transient (unlike
			// VehicleNotReadyError's car-full), so we do NOT set carReportedFull and we leave
			// `forced` intact — a forced session retries on the next tick, and an automated
			// one re-evaluates the solar policy and retries when conditions still hold.
			if (err instanceof ChargerBusyError) {
				// ChargePoint's backend genuinely has an active session — very likely because
				// the charger is actually delivering current right now (e.g. auto-started on
				// plug-in, which never shows up in the getUserChargingStatus ghost-session
				// check above). Re-poll the device plane: if it confirms CHARGING, adopt it
				// using the row we just optimistically created instead of treating this as a
				// failed start. Without this, force-start against an already-charging car
				// (invisible to the driver plane) always fails with "Charger busy" and never
				// recovers into a managed session.
				let recheckStatus: HomeChargerStatus | null = null;
				try {
					recheckStatus = await this.chargePoint.getHomeChargerStatus(
						this.config.chargePointDeviceId
					);
				} catch (recheckErr) {
					log.warn({ err: recheckErr }, 'Charger-status recheck after ChargerBusyError failed');
				}
				if (recheckStatus?.chargingStatus === 'CHARGING') {
					log.warn(
						{ eventId: event.id },
						'ChargerBusyError but charger is actually CHARGING — adopting live session instead of failing the start'
					);
					await this.finalizeAdoption(recheckStatus, null);
					return;
				}
				log.warn(
					{ err, eventId: event.id, targetAmps },
					'startChargingSession rejected: charger busy — dropping event row, will retry next tick'
				);
				this.state = SunkeepState.WAITING;
				this.waitReason = 'Charger busy';
				await this.prisma.chargingEvent
					.delete({ where: { id: event.id } })
					.catch((delErr: unknown) => {
						log.warn(
							{ err: delErr, eventId: event.id },
							'Failed to delete event row after charger-busy (error 89) start rejection'
						);
					});
				return;
			}
			// Leave the row open so the next tick's reconcile resolves it (adopt if
			// the start did take, close as UNKNOWN if it didn't).
			log.warn(
				{ err, eventId: event.id, targetAmps },
				'startChargingSession failed; leaving event open for next-tick reconcile'
			);
			// Any other CommunicationError is a transient ChargePoint API error. Go to WAITING
			// so the next tick retries cleanly instead of landing in ERROR state and alarming
			// dashboards. node-chargepoint >=0.11 always surfaces a clean human-readable
			// message here (no JSON parsing needed).
			if (err instanceof CommunicationError) {
				this.state = SunkeepState.WAITING;
				this.waitReason = err.message;
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
		this.lastAdjustTeslaAt = null;
		this.loadAtLastRaiseKw = null;
		this.estimatedEnergyKwh = 0;
		this.lastEnergyAccrualAt = Date.now();
		this.stopPendingReason = null;
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

		// Two independent stop mechanisms: session-handle stop (by session ID) and
		// device-level stop (by device ID). They hit different ChargePoint API endpoints.
		// When we have a handle, try it first; if it reports no active session, the device
		// endpoint may still respond — try that next. This covers the case where the ChargePoint
		// cloud loses track of a session by ID but still knows the device is charging.
		let chargerStopConfirmed = false;

		if (session) {
			try {
				await session.stop();
				chargerStopConfirmed = true;
			} catch (err) {
				if (err instanceof NoActiveSessionError) {
					log.info('Session stop (by ID) returned no-active-session — trying device-level stop');
				} else {
					log.warn({ err }, 'Session stop (by ID) failed — trying device-level stop');
				}
			}
		}

		// Device-level stop: node-chargepoint resolves the live session id itself (driver
		// plane, then device plane) and stops it by its real sessionId/outletNumber. This is
		// the path that matters for sessions adopted without a handle (EV auto-started on
		// plug-in) or a stale handle whose id no longer matches the live session.
		if (!chargerStopConfirmed) {
			try {
				await this.chargePoint.stopChargingSession(this.config.chargePointDeviceId);
				chargerStopConfirmed = true;
			} catch (err) {
				if (err instanceof NoActiveSessionError) {
					log.info(
						'Device-level stop also returned no-active-session — charger may already be idle'
					);
				} else if (err instanceof UnresolvedSessionError) {
					// The session id can't be resolved over REST (e.g. a CPH50 that only
					// surfaces auto-started sessions over WebSocket). Nothing more we can do via
					// the API — the MIN_AMPS clamp below is the remaining mitigation.
					log.warn(
						'Device-level stop could not resolve an active session over REST — relying on minimum-amps clamp'
					);
				} else {
					log.warn({ err }, 'Device-level stop also failed');
				}
			}
		}

		if (!chargerStopConfirmed) {
			// Both mechanisms failed — the ChargePoint API/hardware may be desynced.
			// Set minimum amps so the charger cannot continue at high current.
			log.warn(
				'Both stop mechanisms failed or reported no active session; setting minimum amps as fallback'
			);
		}
		// Belt-and-suspenders: set amps to minimum regardless of stop outcome. The ChargePoint API
		// occasionally reports NoActiveSessionError for a session the hardware is still running.
		await this.chargePoint
			.setAmperageLimit(this.config.chargePointDeviceId, MIN_AMPS)
			.catch((err: unknown) => {
				log.warn({ err }, 'Failed to set minimum amps after session stop');
			});

		// The stop did not take and the charger is still delivering current — all we
		// achieved was the MIN_AMPS clamp. Closing the row here would record a session
		// that never ended, and the next poll would adopt the same continuous charge into
		// a brand new row: one physical session becomes a fresh "session" every time the
		// policy flickers. Keep the row open, remember why we wanted it closed, and let a
		// later poll close it once the charger actually stops. If policy allows charging
		// again before that, reconcile picks the row back up and nothing was lost.
		if (!chargerStopConfirmed && this.chargerChargingStatus === 'CHARGING') {
			this.stopPendingReason = reason;
			this.currentAmps = MIN_AMPS;
			this.lockedAmps = null;
			this.forced = false;
			// The handle just failed to stop its own session, so it is no use to us. Drop
			// it and let reconcile re-adopt the row by device — that path retries the
			// device-level stop on every later poll.
			this.activeSession = null;
			log.warn(
				{ reason, eventId },
				'Charger still delivering after a failed stop — holding the event open at minimum amps rather than recording an end'
			);
			return;
		}

		const { energyKwh, energyEstimated } = this.resolveSessionEnergy(session);
		try {
			await this.prisma.chargingEvent.update({
				where: { id: eventId },
				data: {
					stoppedAt: new Date(),
					stopReason: this.stopPendingReason ?? reason,
					endAmps,
					energyKwh,
					energyEstimated,
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
		this.lastKnownEnergyKwh = null;
		this.sessionStartedAt = null;
		this.lockedAmps = null;
		this.chargerConfirmedCurrentSession = false;
		this.forced = false;
		this.notChargingStreak = 0;
		this.lastAdjustTeslaAt = null;
		this.loadAtLastRaiseKw = null;
		this.estimatedEnergyKwh = 0;
		this.lastEnergyAccrualAt = null;
		this.stopPendingReason = null;
	}
}
