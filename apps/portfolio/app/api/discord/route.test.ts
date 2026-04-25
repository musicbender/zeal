// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('discord-interactions', () => ({
	verifyKey: vi.fn(),
}));

vi.mock('@repo/navi', () => ({
	handleTimezone: vi.fn(),
	handleAddMember: vi.fn(),
}));

import { handleAddMember, handleTimezone } from '@repo/navi';
import { verifyKey } from 'discord-interactions';
import { POST } from './route';

const PUBLIC_KEY = 'test-public-key';

function makeRequest(body: unknown, signature = 'valid-sig', timestamp = '12345'): Request {
	return new Request('http://localhost/api/discord', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-signature-ed25519': signature,
			'x-signature-timestamp': timestamp,
		},
		body: JSON.stringify(body),
	});
}

describe('POST /api/discord', () => {
	beforeEach(() => {
		process.env.DISCORD_PUBLIC_KEY = PUBLIC_KEY;
	});

	afterEach(() => {
		delete process.env.DISCORD_PUBLIC_KEY;
		vi.clearAllMocks();
	});

	it('returns 401 when signature verification fails', async () => {
		vi.mocked(verifyKey).mockResolvedValueOnce(false);

		const res = await POST(makeRequest({ type: 1 }));
		expect(res.status).toBe(401);
	});

	it('responds to PING with type 1', async () => {
		vi.mocked(verifyKey).mockResolvedValueOnce(true);

		const res = await POST(makeRequest({ type: 1 }));
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.type).toBe(1);
	});

	it('dispatches timezone command', async () => {
		vi.mocked(verifyKey).mockResolvedValueOnce(true);
		vi.mocked(handleTimezone).mockResolvedValueOnce(
			Response.json({ type: 4, data: { content: 'timezones' } })
		);

		const interaction = { type: 2, data: { name: 'timezone' } };
		const res = await POST(makeRequest(interaction));

		expect(handleTimezone).toHaveBeenCalledWith(interaction);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.type).toBe(4);
	});

	it('dispatches add-member command', async () => {
		vi.mocked(verifyKey).mockResolvedValueOnce(true);
		vi.mocked(handleAddMember).mockResolvedValueOnce(
			Response.json({ type: 4, data: { content: 'added' } })
		);

		const interaction = { type: 2, data: { name: 'add-member' } };
		const res = await POST(makeRequest(interaction));

		expect(handleAddMember).toHaveBeenCalledWith(interaction);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.type).toBe(4);
	});

	it('returns 400 for unknown command', async () => {
		vi.mocked(verifyKey).mockResolvedValueOnce(true);

		const res = await POST(makeRequest({ type: 2, data: { name: 'unknown' } }));
		expect(res.status).toBe(400);
	});

	it('returns 400 for unsupported interaction type', async () => {
		vi.mocked(verifyKey).mockResolvedValueOnce(true);

		const res = await POST(makeRequest({ type: 99 }));
		expect(res.status).toBe(400);
	});
});
