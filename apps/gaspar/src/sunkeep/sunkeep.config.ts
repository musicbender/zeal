import type { SunkeepConfig } from './sunkeep.types.js';

export function readSunkeepConfig(): SunkeepConfig {
	const required = (key: string): string => {
		const val = process.env[key];
		if (!val) throw new Error(`Missing required env var: ${key}`);
		return val;
	};

	return {
		chargePointUsername: required('CHARGEPOINT_USERNAME'),
		chargePointPassword: required('CHARGEPOINT_PASSWORD'),
		chargePointDeviceId: Number(required('CHARGEPOINT_DEVICE_ID')),
		powerwallHost: required('POWERWALL_HOST'),
		powerwallEmail: required('POWERWALL_EMAIL'),
		powerwallPassword: required('POWERWALL_PASSWORD'),
		solarWindowStart: process.env.SOLAR_WINDOW_START ?? '06:00',
		solarWindowEnd: process.env.SOLAR_WINDOW_END ?? '20:00',
		sunkeepEnabled: process.env.SUNKEEP_ENABLED !== 'false',
		powerwallSoeThreshold: Number(process.env.POWERWALL_SOE_THRESHOLD ?? '95'),
	};
}
