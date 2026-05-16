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
		chargePointToken: process.env.CHARGEPOINT_TOKEN,
		chargePointDeviceId: Number(required('CHARGEPOINT_DEVICE_ID')),
		teslaClientId: required('TESLA_CLIENT_ID'),
		teslaClientSecret: required('TESLA_CLIENT_SECRET'),
		teslaRefreshToken: required('TESLA_REFRESH_TOKEN'),
		teslaEnergySiteId: required('TESLA_ENERGY_SITE_ID'),
		solarWindowStart: process.env.SOLAR_WINDOW_START ?? '06:00',
		solarWindowEnd: process.env.SOLAR_WINDOW_END ?? '20:00',
		sunkeepEnabled: process.env.SUNKEEP_ENABLED !== 'false',
		soeThreshold: Number(process.env.SUNKEEP_SOE_THRESHOLD ?? '95'),
	};
}
