export type ServiceStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface ServiceHealth {
	status: ServiceStatus;
	uptime?: number;
	message?: string;
	checkedAt: string;
}

export interface MagusStats {
	cpuPercent: number;
	ramPercent: number;
	tempCelsius: number;
	uptimeSeconds: number;
	diskPercent: number;
}

export interface LogEntry {
	timestamp: string;
	level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
	message: string;
	service: string;
}

export interface ServiceSubPage {
	name: string;
	displayName: string;
}

export interface ServiceConfig {
	name: string;
	displayName: string;
	port?: number;
	systemdUnit: string;
	color: string;
	subPages?: ServiceSubPage[];
}

export type SunkeepState = 'DISABLED' | 'IDLE' | 'WAITING' | 'CHARGING' | 'ERROR';

export type SunkeepStopReason =
	| 'solar_dropped'
	| 'night_safety'
	| 'battery_depleted'
	| 'unplugged'
	| 'manual'
	| 'error';

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
	loadKw: number | null;
	excessKw: number | null;
	batteryPct: number | null;
	batteryKw: number | null;
	lockedAmps: number | null;
	chargerAmps: number | null;
	isPluggedIn: boolean | null;
	gridKw: number | null;
	gridStatus: string | null;
	lastTeslaAt: string | null;
	waitReason: string | null;
	forced: boolean;
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

export interface ChargingEventSummary {
	id: string;
	startedAt: string;
	stoppedAt: string | null;
	stopReason: SunkeepStopReason | null;
	startAmps: number;
	endAmps: number | null;
	peakSolarKw: number | null;
	energyKwh: number | null;
	forced: boolean;
}

export interface ChargingEventsPage {
	events: ChargingEventSummary[];
	total: number;
	page: number;
	limit: number;
}
