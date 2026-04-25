// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@repo/portfolio-data', () => ({
	updateActivity: vi.fn(),
	deleteActivity: vi.fn(),
}));

import { deleteActivity, updateActivity } from '@repo/portfolio-data';
import { DELETE, PATCH } from './route';

const API_KEY = 'test-key';
const mockActivity = {
	id: 1,
	sampled_on: new Date('2026-04-04T10:00:00Z'),
	step_count: 9000,
	exercise_minutes: 45,
	calories_burned: '500.00',
	minutes_standing: 12,
	created_on: new Date(),
};

function makeRequest(method: string, body?: unknown, authorized = true): Request {
	return new Request('http://localhost/api/activity/1', {
		method,
		headers: {
			'Content-Type': 'application/json',
			...(authorized ? { Authorization: `Bearer ${API_KEY}` } : {}),
		},
		...(body !== undefined ? { body: JSON.stringify(body) } : {}),
	});
}

const ctx = { params: Promise.resolve({ id: '1' }) };

describe('PATCH /api/activity/[id]', () => {
	beforeEach(() => {
		process.env.PORTFOLIO_API_KEY = API_KEY;
	});

	afterEach(() => {
		delete process.env.PORTFOLIO_API_KEY;
		vi.clearAllMocks();
	});

	it('returns 401 when not authorized', async () => {
		const res = await PATCH(makeRequest('PATCH', {}, false), ctx);
		expect(res.status).toBe(401);
	});

	it('returns 404 when activity does not exist', async () => {
		vi.mocked(updateActivity).mockResolvedValueOnce(null);
		const res = await PATCH(makeRequest('PATCH', { step_count: 9000 }), ctx);
		expect(res.status).toBe(404);
	});

	it('returns updated activity on success', async () => {
		vi.mocked(updateActivity).mockResolvedValueOnce(mockActivity);
		const res = await PATCH(makeRequest('PATCH', { step_count: 9000 }), ctx);
		expect(res.status).toBe(200);
		expect(updateActivity).toHaveBeenCalledWith(1, { step_count: 9000 });
	});
});

describe('DELETE /api/activity/[id]', () => {
	beforeEach(() => {
		process.env.PORTFOLIO_API_KEY = API_KEY;
	});

	afterEach(() => {
		delete process.env.PORTFOLIO_API_KEY;
		vi.clearAllMocks();
	});

	it('returns 401 when not authorized', async () => {
		const res = await DELETE(makeRequest('DELETE', undefined, false), ctx);
		expect(res.status).toBe(401);
	});

	it('returns 404 when activity does not exist', async () => {
		vi.mocked(deleteActivity).mockResolvedValueOnce(false);
		const res = await DELETE(makeRequest('DELETE'), ctx);
		expect(res.status).toBe(404);
	});

	it('returns 204 on successful delete', async () => {
		vi.mocked(deleteActivity).mockResolvedValueOnce(true);
		const res = await DELETE(makeRequest('DELETE'), ctx);
		expect(res.status).toBe(204);
	});
});
