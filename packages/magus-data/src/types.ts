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
