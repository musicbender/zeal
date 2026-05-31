import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../__generated__/test-client/index.js';
import { SunkeepService } from '../../sunkeep/sunkeep.service.js';
import { StopReason, SunkeepState } from '../../sunkeep/sunkeep.types.js';
import { MockChargePointAdapter } from './MockChargePointAdapter.js';
import { MockPowerwallAdapter } from './MockPowerwallAdapter.js';
import { TEST_CONFIG, buildTestApp, cleanDb } from './helpers.js';

let prisma: PrismaClient;
let app: FastifyInstance;
let mockCp: MockChargePointAdapter;
let mockPw: MockPowerwallAdapter;
let service: SunkeepService;

beforeAll(async () => {
	prisma = new PrismaClient();
	await prisma.$connect();
});

afterAll(async () => {
	await prisma.$disconnect();
});

beforeEach(async () => {
	await cleanDb(prisma);
	mockCp = new MockChargePointAdapter();
	mockPw = new MockPowerwallAdapter();
	service = new SunkeepService(mockCp as any, mockPw, prisma as any, TEST_CONFIG);
	service.enable();
	app = await buildTestApp(service, prisma);
});

afterEach(async () => {
	await app.close();
});

// Helper: trigger a tick and return the parsed status body.
async function poll() {
	const res = await app.inject({ method: 'POST', url: '/sunkeep/poll' });
	expect(res.statusCode).toBe(200);
	return res.json() as { state: string; activeSession: unknown; [k: string]: unknown };
}

describe('Sunkeep integration tests', () => {
	it('IDLE → CHARGING: writes ChargingEvent row on session start', async () => {
		mockCp.plugIn();
		mockPw.setSufficientSolar();

		const status = await poll();

		expect(status.state).toBe(SunkeepState.CHARGING);
		expect(status.activeSession).not.toBeNull();

		const events = await prisma.chargingEvent.findMany({});
		expect(events).toHaveLength(1);
		expect(events[0]!.startAmps).toBe(12);
		expect(events[0]!.stoppedAt).toBeNull();
		expect(events[0]!.stopReason).toBeNull();
	});

	it('Solar drops: stops session with SOLAR_DROPPED, updates DB row', async () => {
		mockCp.plugIn();
		mockPw.setSufficientSolar();
		await poll(); // → CHARGING at 12A

		// Drop solar so excessKw = 0.5 - 2.5 + (12*240/1000) = 0.88kW < 1.5kW
		mockPw.setSolar(0.5, 2.5);
		const status = await poll();

		expect(status.state).toBe(SunkeepState.WAITING);
		expect(status.activeSession).toBeNull();

		const events = await prisma.chargingEvent.findMany({});
		expect(events).toHaveLength(1);
		expect(events[0]!.stopReason).toBe(StopReason.SOLAR_DROPPED);
		expect(events[0]!.stoppedAt).not.toBeNull();
		expect(events[0]!.endAmps).toBe(12);
	});

	it('Car unplugged: stops session with UNPLUGGED, state → IDLE', async () => {
		mockCp.plugIn();
		mockPw.setSufficientSolar();
		await poll(); // → CHARGING

		mockCp.unplug();
		const status = await poll();

		expect(status.state).toBe(SunkeepState.IDLE);
		expect(status.activeSession).toBeNull();

		const events = await prisma.chargingEvent.findMany({});
		expect(events[0]!.stopReason).toBe(StopReason.UNPLUGGED);
		expect(events[0]!.stoppedAt).not.toBeNull();
	});

	it('Battery below threshold: stays WAITING, no ChargingEvent created', async () => {
		mockCp.plugIn();
		mockPw.setSufficientSolar();
		mockPw.setBatteryPct(80); // below soeThreshold=95

		const status = await poll();

		expect(status.state).toBe(SunkeepState.WAITING);

		const events = await prisma.chargingEvent.findMany({});
		expect(events).toHaveLength(0);
	});

	it('Outside solar window: car plugged, state → WAITING', async () => {
		const narrowWindowService = new SunkeepService(mockCp as any, mockPw, prisma as any, {
			...TEST_CONFIG,
			solarWindowStart: '02:00',
			solarWindowEnd: '02:01',
		});
		narrowWindowService.enable();
		const narrowApp = await buildTestApp(narrowWindowService, prisma);

		mockCp.plugIn();
		mockPw.setSufficientSolar();

		const res = await narrowApp.inject({ method: 'POST', url: '/sunkeep/poll' });
		await narrowApp.close();

		expect(res.statusCode).toBe(200);
		expect(res.json().state).toBe(SunkeepState.WAITING);

		const events = await prisma.chargingEvent.findMany({});
		expect(events).toHaveLength(0);
	});

	it('Manual stop: stops session with MANUAL, state → IDLE', async () => {
		mockCp.plugIn();
		mockPw.setSufficientSolar();
		await poll(); // → CHARGING

		const res = await app.inject({ method: 'POST', url: '/sunkeep/charge/stop' });
		expect(res.statusCode).toBe(200);
		expect(res.json().state).toBe(SunkeepState.IDLE);
		expect(res.json().activeSession).toBeNull();

		const events = await prisma.chargingEvent.findMany({});
		expect(events[0]!.stopReason).toBe(StopReason.MANUAL);
		expect(events[0]!.stoppedAt).not.toBeNull();
	});

	it('Manual start: creates session and DB row without waiting for scheduler', async () => {
		mockCp.plugIn();
		mockPw.setSufficientSolar();

		const res = await app.inject({ method: 'POST', url: '/sunkeep/charge/start' });
		expect(res.statusCode).toBe(200);
		expect(res.json().state).toBe(SunkeepState.CHARGING);
		expect(res.json().activeSession).not.toBeNull();

		const events = await prisma.chargingEvent.findMany({});
		expect(events).toHaveLength(1);
		expect(events[0]!.stoppedAt).toBeNull();
	});

	it('Session recovery: adopts orphaned session from charger on first tick', async () => {
		mockPw.setSufficientSolar();
		// Simulate charger already CHARGING (e.g. after process restart)
		mockCp.setAlreadyCharging(16);

		const status = await poll();

		expect(status.state).toBe(SunkeepState.CHARGING);
		expect(status.activeSession).not.toBeNull();

		// A new ChargingEvent row should have been created during adoption
		const events = await prisma.chargingEvent.findMany({});
		expect(events).toHaveLength(1);
		expect(events[0]!.stoppedAt).toBeNull();
	});

	it('GET /sunkeep/status reflects state correctly', async () => {
		const idleRes = await app.inject({ method: 'GET', url: '/sunkeep/status' });
		expect(idleRes.statusCode).toBe(200);
		expect(idleRes.json().state).toBe(SunkeepState.IDLE);
		expect(idleRes.json().enabled).toBe(true);

		mockCp.plugIn();
		mockPw.setSufficientSolar();
		await poll();

		const chargingRes = await app.inject({ method: 'GET', url: '/sunkeep/status' });
		expect(chargingRes.json().state).toBe(SunkeepState.CHARGING);
		expect(chargingRes.json().activeSession).not.toBeNull();
		expect(chargingRes.json().solarKw).toBe(4.0);
		expect(chargingRes.json().batteryPct).toBe(99);
	});

	it('GET /sunkeep/events returns paginated ChargingEvent records', async () => {
		// Create two complete sessions directly in the DB
		const now = new Date();
		await prisma.chargingEvent.createMany({
			data: [
				{
					startedAt: new Date(now.getTime() - 3600_000),
					stoppedAt: new Date(now.getTime() - 1800_000),
					stopReason: StopReason.SOLAR_DROPPED,
					startAmps: 12,
					endAmps: 10,
					energyKwh: 3.2,
				},
				{
					startedAt: new Date(now.getTime() - 900_000),
					stoppedAt: now,
					stopReason: StopReason.MANUAL,
					startAmps: 16,
					endAmps: 16,
					energyKwh: 1.1,
				},
			],
		});

		const res = await app.inject({ method: 'GET', url: '/sunkeep/events' });
		expect(res.statusCode).toBe(200);

		const body = res.json() as { total: number; events: unknown[] };
		expect(body.total).toBe(2);
		expect(body.events).toHaveLength(2);
	});

	it('peakSolarKw updated in DB on subsequent tick with higher solar', async () => {
		mockCp.plugIn();
		mockPw.setSufficientSolar(); // 4kW solar
		await poll(); // → CHARGING, peakSolarKw=4.0

		// Second tick: higher solar (7kW)
		mockPw.setSolar(7.0, 1.0);
		await poll();

		const events = await prisma.chargingEvent.findMany({});
		expect(events[0]!.peakSolarKw).toBe(7.0);
	});

	it('Auto-started session: stops it and starts managed session in one tick', async () => {
		mockPw.setSufficientSolar();
		// Simulate ChargePoint auto-starting when the car was plugged in (no API session)
		mockCp.setAutoStarted(16);

		const status = await poll();

		expect(status.state).toBe(SunkeepState.CHARGING);
		expect(status.activeSession).not.toBeNull();

		const events = await prisma.chargingEvent.findMany({});
		expect(events).toHaveLength(1);
		expect(events[0]!.stoppedAt).toBeNull();
	});

	it('Car fully charged (DONE): stops session, state → WAITING', async () => {
		mockCp.plugIn();
		mockPw.setSufficientSolar();
		await poll(); // → CHARGING

		mockCp.setDone();
		const status = await poll();

		expect(status.state).toBe(SunkeepState.WAITING);
		expect(status.activeSession).toBeNull();

		const events = await prisma.chargingEvent.findMany({});
		expect(events[0]!.stopReason).toBe(StopReason.CAR_FULL);
		expect(events[0]!.stoppedAt).not.toBeNull();
	});
});
