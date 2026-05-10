import type { ClientRequest, IncomingMessage } from 'node:http';
import https from 'node:https';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PowerwallClient } from './powerwall.client.js';

vi.mock('node:https');

type HttpsRequestImpl = (
	opts: https.RequestOptions,
	callback?: (res: IncomingMessage) => void
) => ClientRequest;

function mockHttpsRequest(responses: unknown[]) {
	let callIndex = 0;

	(
		vi.mocked(https.request) as unknown as { mockImplementation: (fn: HttpsRequestImpl) => void }
	).mockImplementation((_opts, callback) => {
		const body = JSON.stringify(responses[callIndex++] ?? {});

		const res = {
			on: (event: string, handler: (data?: unknown) => void) => {
				if (event === 'data') handler(body);
				if (event === 'end') handler();
				return res;
			},
			statusCode: 200,
		} as unknown as IncomingMessage;

		if (callback) setImmediate(() => callback(res));

		return {
			write: vi.fn(),
			end: vi.fn(),
			on: vi.fn(),
		} as unknown as ClientRequest;
	});
}

describe('PowerwallClient', () => {
	let client: PowerwallClient;

	beforeEach(() => {
		vi.clearAllMocks();
		client = new PowerwallClient('192.168.1.100', 'user@example.com', 'secret');
	});

	it('returns parsed solar, load, and battery data', async () => {
		mockHttpsRequest([
			{ token: 'test-token' },
			{ percentage: 98.5 },
			{ solar: { instant_power: 4000 }, load: { instant_power: 1500 } },
		]);

		const data = await client.getData();

		expect(data.batteryPct).toBe(98.5);
		expect(data.solarKw).toBeCloseTo(4.0);
		expect(data.loadKw).toBeCloseTo(1.5);
	});

	it('calls login endpoint on first request', async () => {
		mockHttpsRequest([
			{ token: 'test-token' },
			{ percentage: 99 },
			{ solar: { instant_power: 3000 }, load: { instant_power: 1000 } },
		]);

		await client.getData();

		const calls = vi.mocked(https.request).mock.calls;
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const loginCall = calls[0]![0] as https.RequestOptions;
		expect(loginCall.path).toBe('/api/login/Basic');
		expect(loginCall.method).toBe('POST');
	});

	it('reuses token on second getData() call', async () => {
		mockHttpsRequest([
			{ token: 'tok' },
			{ percentage: 97 },
			{ solar: { instant_power: 2000 }, load: { instant_power: 800 } },
			{ percentage: 97 },
			{ solar: { instant_power: 2100 }, load: { instant_power: 850 } },
		]);

		await client.getData();
		await client.getData();

		// First call: login + soe + aggregates = 3 requests
		// Second call: soe + aggregates = 2 requests (no re-login)
		expect(vi.mocked(https.request)).toHaveBeenCalledTimes(5);
	});
});
