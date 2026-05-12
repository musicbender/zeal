import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { TeslaEnergyClient } from '../sunkeep/tesla.client.js';

const clientId = process.env.TESLA_CLIENT_ID;
const clientSecret = process.env.TESLA_CLIENT_SECRET;
const refreshToken = process.env.TESLA_REFRESH_TOKEN;
const energySiteId = process.env.TESLA_ENERGY_SITE_ID;
const configured = Boolean(clientId && clientSecret && refreshToken && energySiteId);

describe.skipIf(!configured)('Tesla Energy integration', () => {
	let client: TeslaEnergyClient;

	it('authenticates and fetches live data', async () => {
		client = new TeslaEnergyClient({
			clientId: clientId!,
			clientSecret: clientSecret!,
			refreshToken: refreshToken!,
			energySiteId: energySiteId!,
		});
		const data = await client.getData();

		expect(typeof data.batteryPct).toBe('number');
		expect(data.batteryPct).toBeGreaterThanOrEqual(0);
		expect(data.batteryPct).toBeLessThanOrEqual(100);

		expect(typeof data.solarKw).toBe('number');
		expect(data.solarKw).toBeGreaterThanOrEqual(0);

		expect(typeof data.loadKw).toBe('number');
		expect(data.loadKw).toBeGreaterThanOrEqual(0);
	});

	it('reuses the cached token on a second call', async () => {
		client = new TeslaEnergyClient({
			clientId: clientId!,
			clientSecret: clientSecret!,
			refreshToken: refreshToken!,
			energySiteId: energySiteId!,
		});
		await client.getData();
		// Second call should not throw — token is cached, no refresh needed
		const data = await client.getData();
		expect(typeof data.batteryPct).toBe('number');
	});
});
