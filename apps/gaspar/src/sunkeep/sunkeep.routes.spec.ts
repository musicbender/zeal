import fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerSunkeepRoutes } from './sunkeep.routes.js';
import { SunkeepState } from './sunkeep.types.js';

const mockStatus = {
	state: SunkeepState.IDLE,
	enabled: true,
	lastPollAt: null,
	activeSession: null,
	solarKw: null,
	excessKw: null,
	batteryPct: null,
};

const mockService = {
	getStatus: vi.fn().mockReturnValue(mockStatus),
	enable: vi.fn(),
	disable: vi.fn(),
	manualStartSession: vi.fn().mockResolvedValue(undefined),
	manualStopSession: vi.fn().mockResolvedValue(undefined),
	lockAmps: vi.fn().mockResolvedValue(undefined),
	unlockAmps: vi.fn(),
};

const mockPrisma = {
	chargingEvent: {
		findMany: vi.fn().mockResolvedValue([]),
		findUnique: vi.fn().mockResolvedValue(null),
		count: vi.fn().mockResolvedValue(0),
	},
};

describe('Sunkeep routes', () => {
	let app: ReturnType<typeof fastify>;

	beforeEach(async () => {
		vi.clearAllMocks();
		app = fastify();
		await registerSunkeepRoutes(app, mockService as any, mockPrisma as any);
	});

	it('GET /sunkeep/status returns current status', async () => {
		const res = await app.inject({ method: 'GET', url: '/sunkeep/status' });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toMatchObject({ state: SunkeepState.IDLE, enabled: true });
	});

	it('POST /sunkeep/enable calls service.enable()', async () => {
		const res = await app.inject({ method: 'POST', url: '/sunkeep/enable' });
		expect(res.statusCode).toBe(200);
		expect(mockService.enable).toHaveBeenCalledOnce();
	});

	it('POST /sunkeep/disable calls service.disable()', async () => {
		const res = await app.inject({ method: 'POST', url: '/sunkeep/disable' });
		expect(res.statusCode).toBe(200);
		expect(mockService.disable).toHaveBeenCalledOnce();
	});

	it('POST /sunkeep/charge/start calls service.manualStartSession()', async () => {
		const res = await app.inject({ method: 'POST', url: '/sunkeep/charge/start' });
		expect(res.statusCode).toBe(200);
		expect(mockService.manualStartSession).toHaveBeenCalledOnce();
	});

	it('POST /sunkeep/charge/stop calls service.manualStopSession()', async () => {
		const res = await app.inject({ method: 'POST', url: '/sunkeep/charge/stop' });
		expect(res.statusCode).toBe(200);
		expect(mockService.manualStopSession).toHaveBeenCalledOnce();
	});

	it('GET /sunkeep/events returns list with pagination', async () => {
		mockPrisma.chargingEvent.findMany.mockResolvedValue([{ id: 'e1', startAmps: 16 }]);
		mockPrisma.chargingEvent.count.mockResolvedValue(1);
		const res = await app.inject({ method: 'GET', url: '/sunkeep/events?page=1&limit=10' });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toMatchObject({ total: 1, events: [{ id: 'e1' }] });
	});

	it('GET /sunkeep/events/:id returns single event', async () => {
		mockPrisma.chargingEvent.findUnique.mockResolvedValue({ id: 'e1', startAmps: 16 });
		const res = await app.inject({ method: 'GET', url: '/sunkeep/events/e1' });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toMatchObject({ id: 'e1' });
	});

	it('GET /sunkeep/events/:id returns 404 for unknown id', async () => {
		mockPrisma.chargingEvent.findUnique.mockResolvedValue(null);
		const res = await app.inject({ method: 'GET', url: '/sunkeep/events/unknown' });
		expect(res.statusCode).toBe(404);
	});

	it('POST /sunkeep/charge/amps with valid body calls lockAmps and returns status', async () => {
		const res = await app.inject({
			method: 'POST',
			url: '/sunkeep/charge/amps',
			payload: { amps: 16 },
		});
		expect(res.statusCode).toBe(200);
		expect(mockService.lockAmps).toHaveBeenCalledWith(16);
		expect(res.json()).toMatchObject({ state: SunkeepState.IDLE });
	});

	it('POST /sunkeep/charge/amps with out-of-range amps returns 400', async () => {
		const res = await app.inject({
			method: 'POST',
			url: '/sunkeep/charge/amps',
			payload: { amps: 5 },
		});
		expect(res.statusCode).toBe(400);
		expect(mockService.lockAmps).not.toHaveBeenCalled();
	});

	it('POST /sunkeep/charge/amps with non-number amps returns 400', async () => {
		const res = await app.inject({
			method: 'POST',
			url: '/sunkeep/charge/amps',
			payload: { amps: 'fast' },
		});
		expect(res.statusCode).toBe(400);
		expect(mockService.lockAmps).not.toHaveBeenCalled();
	});

	it('DELETE /sunkeep/charge/amps calls unlockAmps and returns status', async () => {
		const res = await app.inject({ method: 'DELETE', url: '/sunkeep/charge/amps' });
		expect(res.statusCode).toBe(200);
		expect(mockService.unlockAmps).toHaveBeenCalledOnce();
		expect(res.json()).toMatchObject({ state: SunkeepState.IDLE });
	});
});
