import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../__generated__/test-client/index.js';
import { StopReason, SunkeepState } from '../../sunkeep/sunkeep.types.js';
import { cleanDb } from './helpers.js';
import { type SimTickResult, SunkeepSimulator } from './SunkeepSimulator.js';

let prisma: PrismaClient;

beforeAll(async () => {
	prisma = new PrismaClient();
	await prisma.$connect();
});

afterAll(async () => {
	await prisma.$disconnect();
});

beforeEach(async () => {
	await cleanDb(prisma);
});

describe('SunkeepSimulator: multi-tick scenario tests', () => {
	it('full sunny day: car charges from 60% to DONE with solar-driven amp adjustment', async () => {
		// Battery already above threshold so charging starts immediately at 9am.
		// The solar curve rises through noon then falls — amps should vary across ticks.
		const sim = new SunkeepSimulator(prisma, {
			startHour: 9,
			batteryPct: 95,
			carSocPct: 60,
			peakSolarKw: 7.0,
		});

		const results = await sim.runUntil(
			(r) => r.state === SunkeepState.WAITING && r.waitReason === 'Car fully charged',
			{ maxTicks: 150 }
		);

		const finalResult = results[results.length - 1]!;
		const chargingTicks = results.filter((r) => r.state === SunkeepState.CHARGING);
		const uniqueAmps = new Set(chargingTicks.map((r) => r.currentAmps));

		expect(chargingTicks.length).toBeGreaterThan(0);
		// Car reached its charge limit — sim transitions DONE one tick after physics
		expect(finalResult.carSocPct).toBeCloseTo(100, 0);
		expect(finalResult.state).toBe(SunkeepState.WAITING);
		// Solar curve drove different amp levels as the day progressed
		expect(uniqueAmps.size).toBeGreaterThan(1);

		const events = await prisma.chargingEvent.findMany({});
		expect(events).toHaveLength(1);
		expect(events[0]!.stopReason).toBe(StopReason.CAR_FULL);
		expect(events[0]!.stoppedAt).not.toBeNull();
		expect(events[0]!.peakSolarKw).toBeGreaterThan(0);
	});

	it('battery below threshold: waits while battery builds from solar, then starts charging', async () => {
		// Battery starts at 70% — below soeThreshold (95). Morning solar charges the
		// Powerwall until it crosses the threshold, then Sunkeep starts the car session.
		const sim = new SunkeepSimulator(prisma, {
			startHour: 9,
			batteryPct: 70,
			carSocPct: 60,
			peakSolarKw: 7.0,
		});

		const results = await sim.runUntil((r) => r.state === SunkeepState.CHARGING, { maxTicks: 60 });

		const waitingTicks = results.filter(
			(r) => r.state === SunkeepState.WAITING && r.waitReason === 'Battery below threshold'
		);
		const chargingTicks = results.filter((r) => r.state === SunkeepState.CHARGING);

		// Must have waited while battery built up, then transitioned to charging
		expect(waitingTicks.length).toBeGreaterThan(0);
		expect(chargingTicks.length).toBeGreaterThan(0);
		expect(waitingTicks[0]!.tickNumber).toBeLessThan(chargingTicks[0]!.tickNumber);

		// Battery was rising during the waiting period
		const firstWaitBattery = waitingTicks[0]!.batteryPct;
		const lastWaitBattery = waitingTicks[waitingTicks.length - 1]!.batteryPct;
		expect(lastWaitBattery).toBeGreaterThan(firstWaitBattery);

		// No ChargingEvent row until the transition to CHARGING
		const events = await prisma.chargingEvent.findMany({});
		expect(events).toHaveLength(1);
		expect(events[0]!.stoppedAt).toBeNull();
	});

	it('auto-started session: adopted in-place, amps adjusted from solar, never stopped', async () => {
		// Simulates ChargePoint auto-starting at minimum amps when the car plugged in,
		// before Sunkeep's first tick. Starting at 8A guarantees an upward adjustment
		// on tick 1 since solar excess (solarKw - houseBase) at 10am is ~4 kW → 16A.
		const sim = new SunkeepSimulator(prisma, {
			startHour: 10,
			batteryPct: 95,
			carSocPct: 60,
			peakSolarKw: 7.0,
			autoStartCharging: true,
			autoStartAmps: 8,
		});

		const results: SimTickResult[] = [];
		for (let i = 0; i < 5; i++) {
			results.push(await sim.tick());
		}

		// Session was adopted and managed through all ticks
		expect(results.every((r) => r.state === SunkeepState.CHARGING)).toBe(true);
		// Amps were raised above the auto-start value on the first tick
		expect(results[0]!.currentAmps).toBeGreaterThan(8);
		// Charger was never stopped or restarted (adopted in-place per PR #86)
		expect(sim.simState.callsToStopSession).toBe(0);
		expect(sim.simState.callsToStartSession).toBe(0);
		// Single ChargingEvent, no duplicates across ticks
		const events = await prisma.chargingEvent.findMany({});
		expect(events).toHaveLength(1);
		expect(events[0]!.stoppedAt).toBeNull();
	});

	it('cloud cover causes SOLAR_DROPPED, then session resumes when sun returns', async () => {
		// High battery (99%) ensures the brief low-solar period does not drop below
		// soeThreshold and block the resumed session.
		const sim = new SunkeepSimulator(prisma, {
			startHour: 11,
			batteryPct: 99,
			carSocPct: 60,
			peakSolarKw: 7.0,
		});

		// Run until charging starts under full solar
		await sim.runUntil((r) => r.state === SunkeepState.CHARGING, { maxTicks: 10 });

		// Inject cloud cover — solar drops below what MIN_EXCESS_KW requires
		sim.setPeakSolar(0.3);
		await sim.runUntil((r) => r.state === SunkeepState.WAITING, { maxTicks: 5 });

		const eventsAfterDrop = await prisma.chargingEvent.findMany({});
		expect(eventsAfterDrop).toHaveLength(1);
		expect(eventsAfterDrop[0]!.stopReason).toBe(StopReason.SOLAR_DROPPED);
		expect(eventsAfterDrop[0]!.stoppedAt).not.toBeNull();

		// Sun returns — session should resume and open a new ChargingEvent
		sim.setPeakSolar(7.0);
		await sim.runUntil((r) => r.state === SunkeepState.CHARGING, { maxTicks: 10 });

		const eventsAfterResume = await prisma.chargingEvent.findMany({
			orderBy: { startedAt: 'asc' },
		});
		expect(eventsAfterResume).toHaveLength(2);
		expect(eventsAfterResume[0]!.stopReason).toBe(StopReason.SOLAR_DROPPED);
		expect(eventsAfterResume[1]!.stoppedAt).toBeNull();
	});
});
