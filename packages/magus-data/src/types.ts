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

export interface ServiceConfig {
	name: string;
	displayName: string;
	port?: number;
	systemdUnit: string;
	color: string;
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
	lockedAmps: number | null;
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
}

export interface ChargingEventsPage {
	events: ChargingEventSummary[];
	total: number;
	page: number;
	limit: number;
}
