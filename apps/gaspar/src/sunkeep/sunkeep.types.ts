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
	UNPLUGGED = 'unplugged',
	MANUAL = 'manual',
	ERROR = 'error',
}

export interface PowerwallData {
	batteryPct: number;
	solarKw: number;
	loadKw: number;
}

export interface IPowerwallAdapter {
	getData(): Promise<PowerwallData>;
}

export interface SunkeepConfig {
	chargePointUsername: string;
	chargePointPassword: string;
	chargePointDeviceId: number;
	teslaClientId: string;
	teslaClientSecret: string;
	teslaRefreshToken: string;
	teslaEnergySiteId: string;
	solarWindowStart: string;
	solarWindowEnd: string;
	sunkeepEnabled: boolean;
	powerwallSoeThreshold: number;
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
	batteryPct: number | null;
}
