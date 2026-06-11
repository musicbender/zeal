import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeslaAuthError, TeslaEnergyClient } from './tesla.client.js';

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

function mockFetch(responses: { ok: boolean; status?: number; body: unknown }[]) {
	let i = 0;
	vi.spyOn(global, 'fetch').mockImplementation(async () => {
		const r = responses[i++]!;
		const status = r.status ?? (r.ok ? 200 : 500);
		return {
			ok: r.ok,
			status,
			json: async () => r.body,
			text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)),
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
		// Bust the short-lived live_status cache so the second call re-fetches data.
		(client as unknown as { liveStatusCache: unknown }).liveStatusCache = null;
		await client.getData();

		// token fetched once, live_status fetched twice = 3 total
		expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
	});

	it('serves cached live_status within the TTL instead of re-fetching', async () => {
		mockFetch([
			{ ok: true, body: TOKEN_RESPONSE },
			{ ok: true, body: LIVE_STATUS_RESPONSE },
		]);

		const a = await client.getData();
		const b = await client.getData(); // within TTL → cached, no second live_status fetch

		expect(b).toEqual(a);
		// 1 token + 1 live_status only
		expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
	});

	it('throws TeslaAuthError on login_required and circuit-breaks subsequent calls', async () => {
		mockFetch([
			{
				ok: false,
				status: 401,
				body: { error: 'login_required', error_description: 'The refresh_token is invalid' },
			},
		]);

		await expect(client.getData()).rejects.toBeInstanceOf(TeslaAuthError);

		// Second call must not make any network request
		await expect(client.getData()).rejects.toBeInstanceOf(TeslaAuthError);
		expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
	});

	it('deduplicates concurrent refresh calls — only one token exchange in flight', async () => {
		const onTokenRotated = vi.fn().mockResolvedValue(undefined);
		const clientWithCallback = new TeslaEnergyClient({ ...mockConfig, onTokenRotated });

		mockFetch([
			{ ok: true, body: TOKEN_RESPONSE },
			{ ok: true, body: LIVE_STATUS_RESPONSE },
			{ ok: true, body: LIVE_STATUS_RESPONSE },
		]);

		// Fire two getData() calls simultaneously before either has refreshed
		const [a, b] = await Promise.all([clientWithCallback.getData(), clientWithCallback.getData()]);

		expect(a.solarKw).toBeCloseTo(3.2);
		expect(b.solarKw).toBeCloseTo(3.2);
		const tokenCalls = vi
			.mocked(fetch)
			.mock.calls.filter(([url]) => String(url).includes('oauth2'));
		expect(tokenCalls).toHaveLength(1);
	});

	it('succeeds even when onTokenRotated DB persist fails', async () => {
		const onTokenRotated = vi.fn().mockRejectedValue(new Error('DB unavailable'));
		const clientWithCallback = new TeslaEnergyClient({ ...mockConfig, onTokenRotated });

		mockFetch([
			{ ok: true, body: { ...TOKEN_RESPONSE, refresh_token: 'new-refresh-tok' } },
			{ ok: true, body: LIVE_STATUS_RESPONSE },
		]);

		// DB failure must not bubble up — access token was obtained successfully
		const data = await clientWithCallback.getData();
		expect(data.solarKw).toBeCloseTo(3.2);
		expect(onTokenRotated).toHaveBeenCalledWith('new-refresh-tok');
	});

	it('refreshes token when expired', async () => {
		mockFetch([
			{ ok: true, body: TOKEN_RESPONSE },
			{ ok: true, body: LIVE_STATUS_RESPONSE },
			{ ok: true, body: TOKEN_RESPONSE },
			{ ok: true, body: LIVE_STATUS_RESPONSE },
		]);

		await client.getData();
		// Force token expiry and bust the live_status cache so the next call re-fetches both.
		(client as unknown as { tokenExpiresAt: number }).tokenExpiresAt = Date.now() - 1;
		(client as unknown as { liveStatusCache: unknown }).liveStatusCache = null;
		await client.getData();

		const calls = vi.mocked(fetch).mock.calls;
		const tokenCalls = calls.filter(([url]) => String(url).includes('oauth2'));
		expect(tokenCalls).toHaveLength(2);
	});
});
