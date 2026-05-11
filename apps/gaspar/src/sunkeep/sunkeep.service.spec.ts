import type { HomeChargerStatus } from 'node-chargepoint';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SunkeepService } from './sunkeep.service.js';
import { StopReason, SunkeepState } from './sunkeep.types.js';

// --- Mocks ---

const mockSession = {
	sessionId: 99,
	energyKwh: 5.2,
	stop: vi.fn().mockResolvedValue(undefined),
};

const mockCp = {
	getHomeChargerStatus: vi.fn(),
	setAmperageLimit: vi.fn().mockResolvedValue(undefined),
	startChargingSession: vi.fn().mockResolvedValue(mockSession),
};

const mockPw = {
	getData: vi.fn(),
};

const mockPrisma = {
	chargingEvent: {
		create: vi.fn().mockResolvedValue({ id: 'event-1' }),
		update: vi.fn().mockResolvedValue({}),
	},
};

const testConfig = {
	chargePointUsername: 'u',
	chargePointPassword: 'p',
	chargePointDeviceId: 42,
	powerwallHost: '192.168.1.100',
	powerwallEmail: 'u@example.com',
	powerwallPassword: 'pw',
	solarWindowStart: '06:00',
	solarWindowEnd: '20:00',
	sunkeepEnabled: false,
	powerwallSoeThreshold: 95,
};

function pluggedInStatus(overrides: Partial<HomeChargerStatus> = {}): HomeChargerStatus {
	return {
		chargerId: 42,
		brand: 'ChargePoint',
		model: 'CPH50',
		macAddress: '',
		chargingStatus: 'CHARGING',
		isPluggedIn: true,
		isConnected: true,
		isReminderEnabled: false,
		plugInReminderTime: '',
		amperageLimit: 16,
		possibleAmperageLimits: [8, 16, 24, 32],
		hasUtilityInfo: false,
		isDuringScheduledTime: false,
		...overrides,
	};
}

function goodPwData(overrides = {}) {
	return { batteryPct: 99, solarKw: 4.0, loadKw: 1.0, ...overrides };
}

// Noon on a sunny day — inside the 06:00-20:00 window
const NOON = new Date('2026-05-10T12:00:00');
const NIGHT = new Date('2026-05-10T02:00:00');

describe('SunkeepService', () => {
	let service: SunkeepService;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		service = new SunkeepService(mockCp as any, mockPw as any, mockPrisma as any, testConfig);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// --- Initial state ---

	it('starts in DISABLED state', () => {
		expect(service.getStatus().state).toBe(SunkeepState.DISABLED);
	});

	it('transitions to IDLE after enable()', () => {
		service.enable();
		expect(service.getStatus().state).toBe(SunkeepState.IDLE);
	});

	it('transitions back to DISABLED after disable()', () => {
		service.enable();
		service.disable();
		expect(service.getStatus().state).toBe(SunkeepState.DISABLED);
	});

	// --- Solar window ---

	it('skips all API calls outside solar window', async () => {
		service.enable();
		vi.setSystemTime(NIGHT);
		await service.runTick();
		expect(mockCp.getHomeChargerStatus).not.toHaveBeenCalled();
		expect(mockPw.getData).not.toHaveBeenCalled();
	});

	it('proceeds with API calls inside solar window', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus({ isPluggedIn: false }));
		await service.runTick();
		expect(mockCp.getHomeChargerStatus).toHaveBeenCalledOnce();
	});

	// --- IDLE transitions ---

	it('stays IDLE when car is not plugged in', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus({ isPluggedIn: false }));
		await service.runTick();
		expect(service.getStatus().state).toBe(SunkeepState.IDLE);
		expect(mockPw.getData).not.toHaveBeenCalled();
	});

	// --- WAITING transitions ---

	it('transitions to WAITING when car is plugged in but battery < threshold', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ batteryPct: 80 }));
		await service.runTick();
		expect(service.getStatus().state).toBe(SunkeepState.WAITING);
	});

	it('transitions to WAITING when excess solar < 1.5 kW', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 1.8, loadKw: 1.5 })); // 0.3 kW excess
		await service.runTick();
		expect(service.getStatus().state).toBe(SunkeepState.WAITING);
	});

	it('transitions to IDLE when solar_kw is 0', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 0 }));
		await service.runTick();
		expect(service.getStatus().state).toBe(SunkeepState.IDLE);
	});

	// --- CHARGING start ---

	it('starts a charging session when all conditions met', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 })); // 3 kW excess → 12A
		await service.runTick();

		expect(mockCp.setAmperageLimit).toHaveBeenCalledWith(42, 12);
		expect(mockCp.startChargingSession).toHaveBeenCalledWith(42);
		expect(mockPrisma.chargingEvent.create).toHaveBeenCalledOnce();
		expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
	});

	it('calculates correct amps: clamps to 8 at 1.5 kW excess', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 2.5, loadKw: 1.0 })); // 1.5 kW exact → floor(6.25) = 6, clamped to 8
		await service.runTick();
		expect(mockCp.setAmperageLimit).toHaveBeenCalledWith(42, 8);
	});

	it('calculates correct amps: clamps to 32 at excess > 7.68 kW', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 12.0, loadKw: 1.0 })); // 11 kW → 45A, clamped to 32
		await service.runTick();
		expect(mockCp.setAmperageLimit).toHaveBeenCalledWith(42, 32);
	});

	// --- CHARGING adjustments ---

	it('adjusts amps if excess changes while CHARGING', async () => {
		// First tick: start session at 12A
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));
		await service.runTick(); // starts at 12A

		// Second tick: solar drops, should adjust to 8A
		mockCp.setAmperageLimit.mockClear();
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 2.5, loadKw: 1.0 })); // 1.5 kW → 8A
		await service.runTick();
		expect(mockCp.setAmperageLimit).toHaveBeenCalledWith(42, 8);
	});

	it('does not call setAmperageLimit if amps unchanged', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));
		await service.runTick(); // start at 12A
		mockCp.setAmperageLimit.mockClear();
		await service.runTick(); // same data → no call
		expect(mockCp.setAmperageLimit).not.toHaveBeenCalled();
	});

	// --- CHARGING stop reasons ---

	it('stops session with solar_dropped when excess < 1.5 kW', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));
		await service.runTick(); // start CHARGING

		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 1.5, loadKw: 1.4 })); // 0.1 kW — below threshold
		await service.runTick();

		expect(mockSession.stop).toHaveBeenCalled();
		expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ stopReason: StopReason.SOLAR_DROPPED }),
			})
		);
		expect(service.getStatus().state).toBe(SunkeepState.WAITING);
	});

	it('stops session with night_safety when solar_kw is 0', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData());
		await service.runTick(); // start CHARGING

		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 0 }));
		await service.runTick();

		expect(mockSession.stop).toHaveBeenCalled();
		expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ stopReason: StopReason.NIGHT_SAFETY }),
			})
		);
		expect(service.getStatus().state).toBe(SunkeepState.IDLE);
	});

	it('stops session with battery_depleted when battery drops below threshold', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData());
		await service.runTick(); // start CHARGING

		mockPw.getData.mockResolvedValue(goodPwData({ batteryPct: 80 }));
		await service.runTick();

		expect(mockSession.stop).toHaveBeenCalled();
		expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ stopReason: StopReason.BATTERY_DEPLETED }),
			})
		);
		expect(service.getStatus().state).toBe(SunkeepState.WAITING);
	});

	it('stops session with unplugged when car is unplugged', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData());
		await service.runTick(); // start CHARGING

		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus({ isPluggedIn: false }));
		await service.runTick();

		expect(mockSession.stop).toHaveBeenCalled();
		expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ stopReason: StopReason.UNPLUGGED }),
			})
		);
		expect(service.getStatus().state).toBe(SunkeepState.IDLE);
	});

	// --- Manual stop ---

	it('manualStopSession() stops active session with manual reason', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData());
		await service.runTick();

		await service.manualStopSession();

		expect(mockSession.stop).toHaveBeenCalled();
		expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ stopReason: StopReason.MANUAL }),
			})
		);
		expect(service.getStatus().state).toBe(SunkeepState.IDLE);
	});

	it('manualStopSession() is a no-op when not CHARGING', async () => {
		service.enable();
		await service.manualStopSession();
		expect(mockSession.stop).not.toHaveBeenCalled();
	});

	// --- Manual start ---

	it('manualStartSession() starts a session with amps based on current solar', async () => {
		service.enable();
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 })); // 3 kW → 12A
		await service.manualStartSession();

		expect(mockCp.setAmperageLimit).toHaveBeenCalledWith(42, 12);
		expect(mockCp.startChargingSession).toHaveBeenCalledWith(42);
		expect(mockPrisma.chargingEvent.create).toHaveBeenCalledOnce();
		expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
	});

	it('manualStartSession() uses minimum 8A when excess is very low', async () => {
		service.enable();
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 1.0, loadKw: 0.5 })); // 0.5 kW → 2A → clamped to 8A
		await service.manualStartSession();
		expect(mockCp.setAmperageLimit).toHaveBeenCalledWith(42, 8);
	});

	it('manualStartSession() is a no-op when already CHARGING', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData());
		await service.runTick(); // get into CHARGING state

		mockCp.startChargingSession.mockClear();
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 2.0, loadKw: 0.5 }));
		await service.manualStartSession(); // should be no-op

		expect(mockCp.startChargingSession).not.toHaveBeenCalled();
		expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
	});
});
