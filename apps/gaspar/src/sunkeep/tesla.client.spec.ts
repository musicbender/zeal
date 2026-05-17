import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeslaEnergyClient } from './tesla.client.js';

const mockConfig = {
	clientId: 'client-id',
	clientSecret: 'client-secret',
	refreshToken: 'refresh-token',
	energySiteId: '12345',
};

const TOKEN_RESPONSE = { access_token: 'access-tok', expires_in: 28800 };
const LIVE_STATUS_RESPONSE = {
	response: { percentage_charged: 95.5, solar_power: 3200, load_power: 1800 },
};

function mockFetch(responses: { ok: boolean; body: unknown }[]) {
	let i = 0;
	vi.spyOn(global, 'fetch').mockImplementation(async () => {
		const r = responses[i++]!;
		return {
			ok: r.ok,
			status: r.ok ? 200 : 500,
			json: async () => r.body,
			text: async () => String(r.body),
		} as Response;
	});
}

describe('TeslaEnergyClient', () => {
	let client: TeslaEnergyClient;

	beforeEach(() => {
		vi.clearAllMocks();
		client = new TeslaEnergyClient(mockConfig);
	});

	it('fetches data and caches access token', async () => {
		mockFetch([
			{ ok: true, body: TOKEN_RESPONSE },
			{ ok: true, body: LIVE_STATUS_RESPONSE },
		]);

		const data = await client.getData();

		expect(data.batteryPct).toBe(95.5);
		expect(data.solarKw).toBeCloseTo(3.2);
		expect(data.loadKw).toBeCloseTo(1.8);
		expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
	});

	it('skips token refresh when cached token is fresh', async () => {
		mockFetch([
			{ ok: true, body: TOKEN_RESPONSE },
			{ ok: true, body: LIVE_STATUS_RESPONSE },
			{ ok: true, body: LIVE_STATUS_RESPONSE },
		]);

		await client.getData();
		await client.getData();

		// token fetched once, live_status fetched twice = 3 total
		expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
	});

	it('refreshes token when expired', async () => {
		mockFetch([
			{ ok: true, body: TOKEN_RESPONSE },
			{ ok: true, body: LIVE_STATUS_RESPONSE },
			{ ok: true, body: TOKEN_RESPONSE },
			{ ok: true, body: LIVE_STATUS_RESPONSE },
		]);

		await client.getData();
		// Force expiry
		(client as unknown as { tokenExpiresAt: number }).tokenExpiresAt = Date.now() - 1;
		await client.getData();

		const calls = vi.mocked(fetch).mock.calls;
		const tokenCalls = calls.filter(([url]) => String(url).includes('oauth2'));
		expect(tokenCalls).toHaveLength(2);
	});
});
