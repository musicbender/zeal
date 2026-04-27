// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { GET } from './route';

const CRON_SECRET = 'test-cron-secret';
const CHANNEL_ID = '798427261971202049';

function makeRequest(secret?: string, force = false): Request {
	const url = `http://localhost/api/cron/video-chat${force ? '?force=true' : ''}`;
	return new Request(url, {
		headers: secret ? { authorization: `Bearer ${secret}` } : {},
	});
}

// 2026-04-26 (Sunday) 22:00 UTC = 15:00 PDT (America/Los_Angeles in summer)
const AT_3PM_PDT = new Date('2026-04-26T22:00:00Z');
// 2026-04-26 (Sunday) 21:00 UTC = 14:00 PDT — one hour before
const AT_2PM_PDT = new Date('2026-04-26T21:00:00Z');

describe('GET /api/cron/video-chat', () => {
	beforeEach(() => {
		process.env.CRON_SECRET = CRON_SECRET;
		process.env.DISCORD_BOT_TOKEN = 'test-bot-token';
		mockFetch.mockResolvedValue(new Response(JSON.stringify({ id: '1' }), { status: 200 }));
		vi.useFakeTimers();
	});

	afterEach(() => {
		delete process.env.CRON_SECRET;
		delete process.env.DISCORD_BOT_TOKEN;
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it('returns 401 when authorization header is missing', async () => {
		vi.setSystemTime(AT_3PM_PDT);
		const res = await GET(makeRequest());
		expect(res.status).toBe(401);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('returns 401 when secret is wrong', async () => {
		vi.setSystemTime(AT_3PM_PDT);
		const res = await GET(makeRequest('wrong-secret'));
		expect(res.status).toBe(401);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('returns 200 no-op when it is not 3 PM LA time', async () => {
		vi.setSystemTime(AT_2PM_PDT);
		const res = await GET(makeRequest(CRON_SECRET));
		const body = await res.json();
		expect(res.status).toBe(200);
		expect(body.skipped).toBe(true);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('posts to Discord when it is 3 PM LA time', async () => {
		vi.setSystemTime(AT_3PM_PDT);
		const res = await GET(makeRequest(CRON_SECRET));
		const body = await res.json();
		expect(res.status).toBe(200);
		expect(body.ok).toBe(true);
		expect(mockFetch).toHaveBeenCalledOnce();

		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toContain(CHANNEL_ID);
		const sent = JSON.parse(init.body as string);
		expect(sent.content).toContain('@everyone');
		expect(sent.embeds).toHaveLength(1);
		expect(sent.embeds[0].description).toContain('https://meet.google.com/rra-mtmz-khi');
	});

	it('posts when force=true regardless of current hour', async () => {
		vi.setSystemTime(AT_2PM_PDT); // wrong time, but force bypasses the check
		const res = await GET(makeRequest(CRON_SECRET, true));
		const body = await res.json();
		expect(res.status).toBe(200);
		expect(body.ok).toBe(true);
		expect(mockFetch).toHaveBeenCalledOnce();
	});

	it('returns 500 with Discord error when API call fails', async () => {
		vi.setSystemTime(AT_3PM_PDT);
		mockFetch.mockResolvedValueOnce(
			new Response('{"code":50013,"message":"Missing Permissions"}', { status: 403 })
		);

		const res = await GET(makeRequest(CRON_SECRET));
		const body = await res.json();
		expect(res.status).toBe(500);
		expect(body.status).toBe(403);
		expect(body.error).toContain('Missing Permissions');
	});

	it('posts with correct Discord auth header', async () => {
		vi.setSystemTime(AT_3PM_PDT);
		await GET(makeRequest(CRON_SECRET));

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		const headers = init.headers as Record<string, string>;
		expect(headers['Authorization']).toBe('Bot test-bot-token');
	});
});
