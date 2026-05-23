export enum SunkeepState {
	DISABLED = 'DISABLED',
	IDLE = 'IDLE',
	WAITING = 'WAITING',
	CHARGING = 'CHARGING',
	ERROR = 'ERROR',
}

export enum StopReason {
	SOLAR_DROPPED = 'solar_dropped',
	NIGHT_SAFETY = 'night_safety',
	BATTERY_DEPLETED = 'battery_depleted',
	CAR_FULL = 'car_full',
	UNPLUGGED = 'unplugged',
	MANUAL = 'manual',
	ERROR = 'error',
	UNKNOWN = 'unknown',
}

export interface PowerwallData {
	batteryPct: number;
	solarKw: number;
	loadKw: number;
	batteryKw?: number | null;
	gridKw?: number | null;
	gridStatus?: string | null;
	lastTeslaAt?: string | null;
}

export interface TeslaSiteInfo {
	siteName: string | null;
	batteryCapacityKwh: number | null;
	backupReservePct: number | null;
	model: string | null;
	firmwareVersion: string | null;
	batteryCount: number | null;
	stormModeEnabled: boolean | null;
}

export interface IPowerwallAdapter {
	getData(): Promise<PowerwallData>;
	getSiteInfo?(): Promise<TeslaSiteInfo>;
	updateRefreshToken?(token: string): void;
}

export interface SunkeepConfig {
	chargePointUsername: string;
	chargePointPassword: string;
	chargePointToken?: string;
	chargePointDeviceId: number;
	teslaClientId: string;
	teslaClientSecret: string;
	teslaRefreshToken: string;
	teslaEnergySiteId: string;
	solarWindowStart: string;
	solarWindowEnd: string;
	sunkeepEnabled: boolean;
	soeThreshold: number;
}

export interface ActiveSessionSummary {
	sessionId: number;
	currentAmps: number;
	startedAt: string | null;
}

export interface SunkeepStatus {
	state: SunkeepState;
	enabled: boolean;
	lastPollAt: string | null;
	activeSession: ActiveSessionSummary | null;
	solarKw: number | null;
	excessKw: number | null;
	loadKw: number | null;
	batteryPct: number | null;
	batteryKw: number | null;
	lockedAmps: number | null;
	chargerAmps: number | null;
	isPluggedIn: boolean | null;
	gridKw: number | null;
	gridStatus: string | null;
	lastTeslaAt: string | null;
	waitReason: string | null;
}

export interface SunkeepMeta {
	chargePointDeviceId: number;
	teslaEnergySiteId: string;
	softwareVersion: string | null;
	deviceIp: string | null;
	cpPowerSourceAmps: number | null;
	cpPowerSourceType: string | null;
	cpLedBrightnessLevel: number | null;
	cpLedBrightnessMax: number | null;
	cpScheduleActive: boolean | null;
	teslaSiteName: string | null;
	teslaBatteryCapacityKwh: number | null;
	teslaBackupReservePct: number | null;
	teslaModel: string | null;
	teslaFirmwareVersion: string | null;
	teslaBatteryCount: number | null;
	teslaStormModeEnabled: boolean | null;
}
