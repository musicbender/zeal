import type {
	ChargingSession,
	HomeChargerConfiguration,
	HomeChargerStatus,
	UserChargingStatus,
} from 'node-chargepoint';
import type { PrismaClient } from '../../__generated__/test-client/index.js';
import { SunkeepService } from '../../sunkeep/sunkeep.service.js';
import type {
	IChargePointClient,
	IPowerwallAdapter,
	PowerwallData,
	SunkeepConfig,
	TeslaSiteInfo,
} from '../../sunkeep/sunkeep.types.js';
import { SunkeepState } from '../../sunkeep/sunkeep.types.js';
import { TEST_CONFIG } from './helpers.js';

const TICK_MINUTES = 10;
const VOLTAGE = 240;
const SOLAR_START_MIN = 6 * 60; // 6am
const SOLAR_END_MIN = 20 * 60; // 8pm

function computeSolar(minuteOfDay: number, peakKw: number): number {
	if (minuteOfDay <= SOLAR_START_MIN || minuteOfDay >= SOLAR_END_MIN) return 0;
	const fraction = (minuteOfDay - SOLAR_START_MIN) / (SOLAR_END_MIN - SOLAR_START_MIN);
	return +(peakKw * Math.sin(Math.PI * fraction)).toFixed(3);
}

interface SimState {
	minuteOfDay: number;
	batteryPct: number;
	carSocPct: number;
	chargeLimit: number;
	activeAmps: number;
	chargingStatus: 'NOT_CHARGING' | 'CHARGING' | 'DONE';
	isPluggedIn: boolean;
	houseBaseKw: number;
	peakSolarKw: number;
	carCapacityKwh: number;
	batteryCapacityKwh: number;
	backupReservePct: number;
	nextSessionId: number;
	activeSessionId: number | null;
	sessionIsApiStarted: boolean;
	// API call tracking for test assertions
	callsToStartSession: number;
	callsToStopSession: number;
	ampsHistory: number[];
}

export interface SimulatorConfig {
	startHour?: number;
	carSocPct?: number;
	chargeLimit?: number;
	batteryPct?: number;
	peakSolarKw?: number;
	houseBaseKw?: number;
	/** Car battery capacity in kWh. Default 77.4 (Hyundai IONIQ 6). */
	carCapacityKwh?: number;
	batteryCapacityKwh?: number;
	backupReservePct?: number;
	soeThreshold?: number;
	pluggedIn?: boolean;
	/** If true, simulates ChargePoint having auto-started a session before Sunkeep's first tick. */
	autoStartCharging?: boolean;
	autoStartAmps?: number;
}

export interface SimTickResult {
	tickNumber: number;
	minuteOfDay: number;
	solarKw: number;
	batteryPct: number;
	carSocPct: number;
	state: SunkeepState;
	/** Amps currently commanded to the charger (0 when not charging). */
	currentAmps: number;
	waitReason: string | null;
}

class SimChargePointAdapter implements IChargePointClient {
	constructor(private readonly s: SimState) {}

	async getHomeChargerStatus(chargerId: number): Promise<HomeChargerStatus> {
		return {
			chargerId,
			brand: 'ChargePoint',
			model: 'CPH50',
			macAddress: '00:00:00:00:00:00',
			chargingStatus: this.s.chargingStatus,
			isPluggedIn: this.s.isPluggedIn,
			isConnected: true,
			isReminderEnabled: false,
			plugInReminderTime: '',
			amperageLimit: this.s.activeAmps,
			possibleAmperageLimits: [8, 16, 24, 32],
			hasUtilityInfo: false,
			isDuringScheduledTime: false,
		};
	}

	async setAmperageLimit(_chargerId: number, amps: number): Promise<void> {
		this.s.activeAmps = amps;
		this.s.ampsHistory.push(amps);
	}

	async startChargingSession(_deviceId: number): Promise<ChargingSession> {
		this.s.callsToStartSession++;
		this.s.nextSessionId++;
		this.s.activeSessionId = this.s.nextSessionId;
		this.s.sessionIsApiStarted = true;
		this.s.chargingStatus = 'CHARGING';
		const sessionId = this.s.activeSessionId;
		const s = this.s;
		return {
			sessionId,
			energyKwh: 0,
			stop: async () => {
				// Preserve DONE if the car is at its charge limit — ChargePoint holds DONE
				// until unplugged, so a stop() call should not revert to NOT_CHARGING.
				s.chargingStatus = s.carSocPct >= s.chargeLimit ? 'DONE' : 'NOT_CHARGING';
				s.activeAmps = 0;
				s.activeSessionId = null;
				s.sessionIsApiStarted = false;
			},
		} as unknown as ChargingSession;
	}

	async stopChargingSession(_deviceId: number): Promise<void> {
		this.s.callsToStopSession++;
		this.s.chargingStatus = this.s.carSocPct >= this.s.chargeLimit ? 'DONE' : 'NOT_CHARGING';
		this.s.activeAmps = 0;
		this.s.activeSessionId = null;
		this.s.sessionIsApiStarted = false;
	}

	async getUserChargingStatus(): Promise<UserChargingStatus | null> {
		if (
			this.s.chargingStatus === 'CHARGING' &&
			this.s.sessionIsApiStarted &&
			this.s.activeSessionId !== null
		) {
			return { sessionId: this.s.activeSessionId } as unknown as UserChargingStatus;
		}
		return null;
	}

	async getChargingSession(sessionId: number): Promise<ChargingSession> {
		const s = this.s;
		return {
			sessionId,
			energyKwh: 0,
			stop: async () => {
				s.chargingStatus = s.carSocPct >= s.chargeLimit ? 'DONE' : 'NOT_CHARGING';
				s.activeAmps = 0;
				s.activeSessionId = null;
				s.sessionIsApiStarted = false;
			},
		} as unknown as ChargingSession;
	}

	async getHomeChargerTechnicalInfo(
		_chargerId: number
	): Promise<{ softwareVersion: string; deviceIp: string }> {
		return { softwareVersion: '1.0.0', deviceIp: '192.168.1.50' };
	}

	async getHomeChargerConfig(_chargerId: number): Promise<HomeChargerConfiguration> {
		return {
			powerSource: { amps: 50, type: 'hardwired' },
			ledBrightness: {
				level: 3,
				inProgress: false,
				supportedLevels: [0, 1, 2, 3, 4, 5],
				isEnabled: true,
			},
			serialNumber: '',
			macAddress: '',
			stationNickname: '',
			streetAddress: '',
			hasUtilityInfo: false,
			utility: null,
			indicatorLightEcoMode: false,
			flashlightReset: false,
			worksWithNest: false,
			isPairedWithNest: false,
			isInstalledByInstaller: false,
		};
	}
}

class SimPowerwallAdapter implements IPowerwallAdapter {
	constructor(private readonly s: SimState) {}

	async getData(): Promise<PowerwallData> {
		const solarKw = computeSolar(this.s.minuteOfDay, this.s.peakSolarKw);
		// Tesla load_power includes EV charging — mirrors the assumption in sunkeep.service.ts tick()
		const carKw = this.s.chargingStatus === 'CHARGING' ? (this.s.activeAmps * VOLTAGE) / 1000 : 0;
		const loadKw = +(this.s.houseBaseKw + carKw).toFixed(3);
		const batteryKw = +(solarKw - loadKw).toFixed(3); // positive = battery charging
		return {
			batteryPct: +this.s.batteryPct.toFixed(2),
			solarKw,
			loadKw,
			batteryKw,
			gridKw: 0,
			gridStatus: 'SystemGridConnected',
		};
	}

	async getSiteInfo(): Promise<TeslaSiteInfo> {
		return {
			siteName: 'Sim Site',
			batteryCapacityKwh: this.s.batteryCapacityKwh,
			backupReservePct: this.s.backupReservePct,
			model: 'Powerwall 3',
			firmwareVersion: '26.10.3',
			batteryCount: 2,
			stormModeEnabled: false,
		};
	}

	updateRefreshToken(_token: string): void {}
}

export class SunkeepSimulator {
	readonly simState: SimState;
	private readonly _service: SunkeepService;
	private readonly _prisma: PrismaClient;
	private tickCount = 0;

	constructor(prisma: PrismaClient, config: SimulatorConfig = {}) {
		const {
			startHour = 9,
			carSocPct = 60,
			chargeLimit = 100,
			batteryPct = 60,
			peakSolarKw = 7.0,
			houseBaseKw = 1.5,
			carCapacityKwh = 77.4,
			batteryCapacityKwh = 27,
			backupReservePct = 20,
			soeThreshold = 95,
			pluggedIn = true,
			autoStartCharging = false,
			autoStartAmps = 16,
		} = config;

		this.simState = {
			minuteOfDay: startHour * 60,
			batteryPct,
			carSocPct,
			chargeLimit,
			activeAmps: autoStartCharging ? autoStartAmps : 0,
			chargingStatus: autoStartCharging ? 'CHARGING' : 'NOT_CHARGING',
			isPluggedIn: pluggedIn,
			houseBaseKw,
			peakSolarKw,
			carCapacityKwh,
			batteryCapacityKwh,
			backupReservePct,
			nextSessionId: 100,
			activeSessionId: null,
			sessionIsApiStarted: false,
			callsToStartSession: 0,
			callsToStopSession: 0,
			ampsHistory: [],
		};

		this._prisma = prisma;
		const cp = new SimChargePointAdapter(this.simState);
		const pw = new SimPowerwallAdapter(this.simState);

		const serviceConfig: SunkeepConfig = {
			...TEST_CONFIG,
			// Keep solar window unrestricted — the physics model handles the diurnal solar
			// curve; the service's window check would add real-clock dependency to the sim.
			solarWindowStart: '00:00',
			solarWindowEnd: '23:59',
			soeThreshold,
		};

		this._service = new SunkeepService(cp as any, pw, prisma as any, serviceConfig);
		this._service.enable();
	}

	get prisma(): PrismaClient {
		return this._prisma;
	}

	get service(): SunkeepService {
		return this._service;
	}

	setPeakSolar(kw: number): void {
		this.simState.peakSolarKw = kw;
	}

	private advancePhysics(): void {
		const solarKw = computeSolar(this.simState.minuteOfDay, this.simState.peakSolarKw);
		const carKw =
			this.simState.chargingStatus === 'CHARGING' ? (this.simState.activeAmps * VOLTAGE) / 1000 : 0;
		const loadKw = this.simState.houseBaseKw + carKw;
		const netKw = solarKw - loadKw;

		// Battery SoC integration over one 10-minute tick
		const batteryDeltaPct = ((netKw * TICK_MINUTES) / 60 / this.simState.batteryCapacityKwh) * 100;
		this.simState.batteryPct = Math.min(
			100,
			Math.max(this.simState.backupReservePct, this.simState.batteryPct + batteryDeltaPct)
		);

		// Car SoC integration — only when a session is actively delivering current
		if (this.simState.chargingStatus === 'CHARGING' && carKw > 0) {
			const carDeltaPct = ((carKw * TICK_MINUTES) / 60 / this.simState.carCapacityKwh) * 100;
			this.simState.carSocPct = Math.min(
				this.simState.chargeLimit,
				this.simState.carSocPct + carDeltaPct
			);
			// ChargePoint detects when the car stops accepting current and marks DONE.
			// We model the transition here so the next tick sees the correct status.
			if (this.simState.carSocPct >= this.simState.chargeLimit) {
				this.simState.chargingStatus = 'DONE';
				this.simState.activeAmps = 0;
			}
		}

		this.simState.minuteOfDay = (this.simState.minuteOfDay + TICK_MINUTES) % (24 * 60);
	}

	async tick(): Promise<SimTickResult> {
		this.tickCount++;
		await this._service.runTick();
		const status = this._service.getStatus();
		const solarKw = computeSolar(this.simState.minuteOfDay, this.simState.peakSolarKw);
		const result: SimTickResult = {
			tickNumber: this.tickCount,
			minuteOfDay: this.simState.minuteOfDay,
			solarKw,
			batteryPct: this.simState.batteryPct,
			carSocPct: this.simState.carSocPct,
			state: status.state,
			// simState.activeAmps reflects setAmperageLimit calls made within this tick
			currentAmps: this.simState.activeAmps,
			waitReason: status.waitReason,
		};
		this.advancePhysics();
		return result;
	}

	async runUntil(
		predicate: (r: SimTickResult) => boolean,
		opts: { maxTicks?: number } = {}
	): Promise<SimTickResult[]> {
		const maxTicks = opts.maxTicks ?? 200;
		const results: SimTickResult[] = [];
		for (let i = 0; i < maxTicks; i++) {
			const result = await this.tick();
			results.push(result);
			if (predicate(result)) break;
		}
		return results;
	}
}
