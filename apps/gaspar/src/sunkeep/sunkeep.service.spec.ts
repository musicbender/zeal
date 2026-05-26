import {
	StartVerificationTimeoutError,
	type HomeChargerSchedule,
	type HomeChargerStatus,
} from 'node-chargepoint';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SunkeepService } from './sunkeep.service.js';
import { StopReason, SunkeepState } from './sunkeep.types.js';

// --- Mocks ---

const mockSession = {
	sessionId: 99,
	energyKwh: 5.2,
	stop: vi.fn().mockResolvedValue(undefined),
};

const mockTechInfo = { softwareVersion: '1.2.3', deviceIp: '192.168.1.100' };

const mockCpConfig = {
	powerSource: { amps: 50, type: 'hardwired' },
	ledBrightness: {
		level: 3,
		inProgress: false,
		supportedLevels: [0, 1, 2, 3, 4, 5],
		isEnabled: true,
	},
	serialNumber: '',
	macAddress: '',
	stationNickname: '',
	streetAddress: '',
	hasUtilityInfo: false,
	utility: null,
	indicatorLightEcoMode: false,
	flashlightReset: false,
	worksWithNest: false,
	isPairedWithNest: false,
	isInstalledByInstaller: false,
};

const mockDisabledSchedule: HomeChargerSchedule = {
	hasTouPricing: false,
	scheduleEnabled: false,
	hasUtilityInfo: false,
	basedOnUtility: null,
	defaultSchedule: {
		weekdays: { startTime: '0:0', endTime: '0:0' },
		weekends: { startTime: '0:0', endTime: '0:0' },
	},
};

const mockCp = {
	getHomeChargerStatus: vi.fn(),
	getHomeChargerSchedule: vi.fn().mockResolvedValue(mockDisabledSchedule),
	setAmperageLimit: vi.fn().mockResolvedValue(undefined),
	startChargingSession: vi.fn().mockResolvedValue(mockSession),
	getHomeChargerTechnicalInfo: vi.fn().mockResolvedValue(mockTechInfo),
	getHomeChargerConfig: vi.fn().mockResolvedValue(mockCpConfig),
	getUserChargingStatus: vi.fn().mockResolvedValue(null),
	getChargingSession: vi.fn().mockResolvedValue(mockSession),
};

const mockSiteInfo = {
	siteName: 'My Home',
	batteryCapacityKwh: 27,
	backupReservePct: 20,
	model: 'Powerwall 3',
	firmwareVersion: '26.10.3',
	batteryCount: 2,
	stormModeEnabled: true,
};

const mockPw = {
	getData: vi.fn(),
	getSiteInfo: vi.fn().mockResolvedValue(mockSiteInfo),
};

const mockPrisma = {
	chargingEvent: {
		create: vi.fn().mockResolvedValue({ id: 'event-1' }),
		update: vi.fn().mockResolvedValue({}),
		findFirst: vi.fn().mockResolvedValue(null),
	},
};

const testConfig = {
	chargePointUsername: 'u',
	chargePointPassword: 'p',
	chargePointDeviceId: 42,
	teslaClientId: 'client-id',
	teslaClientSecret: 'client-secret',
	teslaRefreshToken: 'refresh-token',
	teslaEnergySiteId: '12345',
	solarWindowStart: '06:00',
	solarWindowEnd: '20:00',
	sunkeepEnabled: false,
	soeThreshold: 95,
};

function pluggedInStatus(overrides: Partial<HomeChargerStatus> = {}): HomeChargerStatus {
	return {
		chargerId: 42,
		brand: 'ChargePoint',
		model: 'CPH50',
		macAddress: '',
		// Default to NOT_CHARGING so tests that expect a fresh start don't trip
		// the orphaned-session adoption path. Override to 'CHARGING' to test
		// recovery from a session left running by a prior process.
		chargingStatus: 'NOT_CHARGING' as HomeChargerStatus['chargingStatus'],
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

	// --- getStatus() derived fields ---

	describe('getStatus() excessKw', () => {
		it('subtracts battery charging power from excess (battery charging = negative kw)', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus({ isPluggedIn: true }));
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 2.0, loadKw: 0.7, batteryKw: -1.0 }));
			await service.runTick();
			// excess = 2.0 - 0.7 + (-1.0) = 0.3
			expect(service.getStatus().excessKw).toBeCloseTo(0.3);
		});

		it('does not add battery discharging power to excess (discharge is not solar)', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus({ isPluggedIn: true }));
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 1.0, loadKw: 0.5, batteryKw: 0.5 }));
			await service.runTick();
			// excess = 1.0 - 0.5 + min(0, 0.5) = 0.5 — battery discharge is not solar excess
			expect(service.getStatus().excessKw).toBeCloseTo(0.5);
		});

		it('returns null when no powerwall data', () => {
			service.enable();
			expect(service.getStatus().excessKw).toBeNull();
		});
	});

	// --- Initial state ---

	it('starts in DISABLED state', () => {
		expect(service.getStatus().state).toBe(SunkeepState.DISABLED);
	});

	it('transitions to IDLE after enable()', () => {
		service.enable();
		expect(service.getStatus().state).toBe(SunkeepState.IDLE);
	});

	it('transitions back to DISABLED after disable()', async () => {
		service.enable();
		await service.disable();
		expect(service.getStatus().state).toBe(SunkeepState.DISABLED);
	});

	it('transitions to DISABLED and stops active session when disable() called while CHARGING', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData());
		await service.runTick(); // start CHARGING

		await service.disable();

		expect(mockSession.stop).toHaveBeenCalled();
		expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ stopReason: StopReason.MANUAL }),
			})
		);
		expect(service.getStatus().state).toBe(SunkeepState.DISABLED);
	});

	// --- Solar window ---

	it('always fetches data outside solar window (but skips charging logic)', async () => {
		service.enable();
		vi.setSystemTime(NIGHT);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus({ isPluggedIn: false }));
		mockPw.getData.mockResolvedValue(goodPwData());
		await service.runTick();
		expect(mockCp.getHomeChargerStatus).toHaveBeenCalledOnce();
		expect(mockPw.getData).toHaveBeenCalledOnce();
		expect(service.getStatus().solarKw).not.toBeNull();
	});

	it('sets IDLE outside solar window when car not plugged in', async () => {
		service.enable();
		vi.setSystemTime(NIGHT);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus({ isPluggedIn: false }));
		mockPw.getData.mockResolvedValue(goodPwData());
		await service.runTick();
		expect(service.getStatus().state).toBe(SunkeepState.IDLE);
	});

	it('sets WAITING outside solar window when car is plugged in', async () => {
		service.enable();
		vi.setSystemTime(NIGHT);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus({ isPluggedIn: true }));
		mockPw.getData.mockResolvedValue(goodPwData());
		await service.runTick();
		expect(service.getStatus().state).toBe(SunkeepState.WAITING);
	});

	it('proceeds with charging logic inside solar window', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus({ isPluggedIn: false }));
		mockPw.getData.mockResolvedValue(goodPwData());
		await service.runTick();
		expect(mockCp.getHomeChargerStatus).toHaveBeenCalledOnce();
		expect(mockPw.getData).toHaveBeenCalledOnce();
	});

	// --- IDLE transitions ---

	it('stays IDLE when car is not plugged in', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus({ isPluggedIn: false }));
		mockPw.getData.mockResolvedValue(goodPwData());
		await service.runTick();
		expect(service.getStatus().state).toBe(SunkeepState.IDLE);
		expect(mockPw.getData).toHaveBeenCalledOnce();
	});

	// --- Car fully charged ---

	it('sets WAITING with "Car fully charged" when charger reports DONE (within solar window)', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(
			pluggedInStatus({ chargingStatus: 'DONE' as HomeChargerStatus['chargingStatus'] })
		);
		mockPw.getData.mockResolvedValue(goodPwData());
		await service.runTick();

		expect(service.getStatus().state).toBe(SunkeepState.WAITING);
		expect(service.getStatus().waitReason).toBe('Car fully charged');
		expect(mockCp.startChargingSession).not.toHaveBeenCalled();
	});

	it('sets WAITING with "Car fully charged" when charger reports DONE (outside solar window)', async () => {
		service.enable();
		vi.setSystemTime(NIGHT);
		mockCp.getHomeChargerStatus.mockResolvedValue(
			pluggedInStatus({ chargingStatus: 'DONE' as HomeChargerStatus['chargingStatus'] })
		);
		mockPw.getData.mockResolvedValue(goodPwData());
		await service.runTick();

		expect(service.getStatus().state).toBe(SunkeepState.WAITING);
		expect(service.getStatus().waitReason).toBe('Car fully charged');
	});

	it('stops active session with CAR_FULL reason when car becomes fully charged during session', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		// First tick: start a session
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData());
		await service.runTick();
		expect(service.getStatus().state).toBe(SunkeepState.CHARGING);

		// Second tick: car reports DONE
		mockCp.getHomeChargerStatus.mockResolvedValue(
			pluggedInStatus({ chargingStatus: 'DONE' as HomeChargerStatus['chargingStatus'] })
		);
		await service.runTick();

		expect(mockSession.stop).toHaveBeenCalled();
		expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ stopReason: StopReason.CAR_FULL }),
			})
		);
		expect(service.getStatus().state).toBe(SunkeepState.WAITING);
		expect(service.getStatus().waitReason).toBe('Car fully charged');
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

	it('transitions to WAITING when car is plugged in but solar_kw is 0', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 0 }));
		await service.runTick();
		expect(service.getStatus().state).toBe(SunkeepState.WAITING);
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

	it('persists event and enters CHARGING when start verification times out but charger confirms charging', async () => {
		// Simulates the ChargePoint user-status endpoint being slow to reflect a
		// newly-started session, while getHomeChargerStatus already shows the
		// charger drawing power. Pre-fix this caused the exception to bubble up
		// before the DB row was written, leaving the car charging unmonitored.
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));
		mockCp.startChargingSession.mockRejectedValueOnce(
			new StartVerificationTimeoutError(42, 15000, 8, true)
		);

		await service.runTick();

		expect(mockPrisma.chargingEvent.create).toHaveBeenCalledOnce();
		expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
	});

	it('persists event but rethrows when start verification times out and charger does NOT confirm', async () => {
		// Verification timed out and the charger doesn't show CHARGING either —
		// we can't tell if the start took. Row stays open so the next tick's
		// reconcile (adopt-if-charging / close-as-UNKNOWN otherwise) resolves it.
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));
		mockCp.startChargingSession.mockRejectedValueOnce(
			new StartVerificationTimeoutError(42, 15000, 8, false)
		);

		await service.runTick(); // swallowed by runTick's top-level catch

		expect(mockPrisma.chargingEvent.create).toHaveBeenCalledOnce();
		// State did not advance to CHARGING — we have no confirmation.
		expect(service.getStatus().state).not.toBe(SunkeepState.CHARGING);
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

		// Second tick: solar drops. Tesla loadKw includes car at 12A (2.88 kW), so
		// net excess = 2.5 - (1.0 + 2.88) + 2.88 = 1.5 kW → adjusts to 8A
		mockCp.setAmperageLimit.mockClear();
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 2.5, loadKw: 1.0 + (12 * 240) / 1000 }));
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
		// Tesla now reports total load including car at 12A (2.88 kW): net excess = 4.0 - 3.88 + 2.88 = 3.0 → 12A unchanged
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 + (12 * 240) / 1000 }));
		await service.runTick();
		expect(mockCp.setAmperageLimit).not.toHaveBeenCalled();
	});

	// --- CHARGING stop reasons ---

	it('stops session with solar_dropped when excess < 1.5 kW', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));
		await service.runTick(); // start CHARGING

		// Tesla loadKw includes car at 12A (2.88 kW): net excess = 1.5 - (1.4 + 2.88) + 2.88 = 0.1 kW — below threshold
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 1.5, loadKw: 1.4 + (12 * 240) / 1000 }));
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
		expect(service.getStatus().state).toBe(SunkeepState.WAITING);
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
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 })); // 3 kW → 12A
		await service.manualStartSession();

		expect(mockCp.setAmperageLimit).toHaveBeenCalledWith(42, 12);
		expect(mockCp.startChargingSession).toHaveBeenCalledWith(42);
		expect(mockPrisma.chargingEvent.create).toHaveBeenCalledOnce();
		expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
	});

	it('manualStartSession() uses minimum 8A when excess is very low', async () => {
		service.enable();
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
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

	// --- Amp locking ---

	describe('amp locking', () => {
		it('lockAmps() sets lockedAmps in status when not charging (no charger call)', async () => {
			service.enable();
			await service.lockAmps(20);
			expect(service.getStatus().lockedAmps).toBe(20);
			expect(mockCp.setAmperageLimit).not.toHaveBeenCalled();
		});

		it('lockAmps() when CHARGING: updates lockedAmps in status AND calls setAmperageLimit', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
			mockPw.getData.mockResolvedValue(goodPwData());
			await service.runTick(); // enter CHARGING state

			mockCp.setAmperageLimit.mockClear();
			await service.lockAmps(24);

			expect(service.getStatus().lockedAmps).toBe(24);
			expect(mockCp.setAmperageLimit).toHaveBeenCalledWith(42, 24);
		});

		it('lockAmps() throws RangeError for out-of-range values', async () => {
			await expect(service.lockAmps(7)).rejects.toThrow(RangeError);
			await expect(service.lockAmps(33)).rejects.toThrow(RangeError);
			await expect(service.lockAmps(7.5)).rejects.toThrow(RangeError);
		});

		it('unlockAmps() clears lockedAmps in status', async () => {
			await service.lockAmps(16);
			expect(service.getStatus().lockedAmps).toBe(16);
			service.unlockAmps();
			expect(service.getStatus().lockedAmps).toBeNull();
		});

		it('runTick() does NOT call setAmperageLimit for amp changes when locked', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 })); // 12A
			await service.runTick(); // start CHARGING at 12A

			await service.lockAmps(20);
			mockCp.setAmperageLimit.mockClear();

			// Solar changes — without a lock, this would trigger a setAmperageLimit call
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 6.0, loadKw: 1.0 })); // 20A natural
			await service.runTick();

			expect(mockCp.setAmperageLimit).not.toHaveBeenCalled();
		});

		it('stopActiveSession() via manualStopSession() clears the lock', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
			mockPw.getData.mockResolvedValue(goodPwData());
			await service.runTick(); // enter CHARGING

			await service.lockAmps(16);
			expect(service.getStatus().lockedAmps).toBe(16);

			await service.manualStopSession();
			expect(service.getStatus().lockedAmps).toBeNull();
		});
	});

	// --- Metadata ---

	describe('getMeta()', () => {
		it('returns all ChargePoint and Tesla meta fields', async () => {
			const meta = await service.getMeta();
			expect(meta.chargePointDeviceId).toBe(42);
			expect(meta.teslaEnergySiteId).toBe('12345');
			expect(meta.softwareVersion).toBe('1.2.3');
			expect(meta.deviceIp).toBe('192.168.1.100');
			expect(meta.cpPowerSourceAmps).toBe(50);
			expect(meta.cpPowerSourceType).toBe('hardwired');
			expect(meta.cpLedBrightnessLevel).toBe(3);
			expect(meta.cpLedBrightnessMax).toBe(5);
			expect(meta.teslaSiteName).toBe('My Home');
			expect(meta.teslaBatteryCapacityKwh).toBe(27);
			expect(meta.teslaBackupReservePct).toBe(20);
			expect(meta.teslaModel).toBe('Powerwall 3');
			expect(meta.teslaFirmwareVersion).toBe('26.10.3');
			expect(meta.teslaBatteryCount).toBe(2);
			expect(meta.teslaStormModeEnabled).toBe(true);
		});

		it('returns cpScheduleActive from cached isDuringScheduledTime', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({ isDuringScheduledTime: true })
			);
			await service.runTick();
			const meta = await service.getMeta();
			expect(meta.cpScheduleActive).toBe(true);
		});

		it('returns null ChargePoint fields when tech info fetch fails', async () => {
			mockCp.getHomeChargerTechnicalInfo.mockRejectedValueOnce(new Error('network'));
			const meta = await service.getMeta();
			expect(meta.softwareVersion).toBeNull();
			expect(meta.deviceIp).toBeNull();
		});

		it('returns null CP config fields when config fetch fails', async () => {
			mockCp.getHomeChargerConfig.mockRejectedValueOnce(new Error('network'));
			const meta = await service.getMeta();
			expect(meta.cpPowerSourceAmps).toBeNull();
			expect(meta.cpLedBrightnessLevel).toBeNull();
		});

		it('returns null Tesla fields when getSiteInfo fails', async () => {
			mockPw.getSiteInfo.mockRejectedValueOnce(new Error('tesla down'));
			const meta = await service.getMeta();
			expect(meta.teslaSiteName).toBeNull();
			expect(meta.teslaBatteryCapacityKwh).toBeNull();
			expect(meta.teslaBackupReservePct).toBeNull();
		});
	});

	// --- waitReason ---

	describe('waitReason', () => {
		it('is "Outside solar window" when outside window and plugged in', async () => {
			service.enable();
			vi.setSystemTime(NIGHT);
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus({ isPluggedIn: true }));
			mockPw.getData.mockResolvedValue(goodPwData());
			await service.runTick();
			expect(service.getStatus().waitReason).toBe('Outside solar window');
		});

		it('is null when outside window and not plugged in (IDLE)', async () => {
			service.enable();
			vi.setSystemTime(NIGHT);
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus({ isPluggedIn: false }));
			mockPw.getData.mockResolvedValue(goodPwData());
			await service.runTick();
			expect(service.getStatus().state).toBe(SunkeepState.IDLE);
			expect(service.getStatus().waitReason).toBeNull();
		});

		it('is "No solar production" when solarKw is 0', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 0 }));
			await service.runTick();
			expect(service.getStatus().waitReason).toBe('No solar production');
		});

		it('is "Battery below threshold" when battery < threshold', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
			mockPw.getData.mockResolvedValue(goodPwData({ batteryPct: 80 }));
			await service.runTick();
			expect(service.getStatus().waitReason).toBe('Battery below threshold');
		});

		it('is "Insufficient solar excess" when excessKw < MIN_EXCESS_KW', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 1.8, loadKw: 1.5 }));
			await service.runTick();
			expect(service.getStatus().waitReason).toBe('Insufficient solar excess');
		});

		it('is null when CHARGING', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
			mockPw.getData.mockResolvedValue(goodPwData());
			await service.runTick();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
			expect(service.getStatus().waitReason).toBeNull();
		});

		it('is null when IDLE (car not plugged in)', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus({ isPluggedIn: false }));
			mockPw.getData.mockResolvedValue(goodPwData());
			await service.runTick();
			expect(service.getStatus().state).toBe(SunkeepState.IDLE);
			expect(service.getStatus().waitReason).toBeNull();
		});
	});

	// --- Recovery from orphaned sessions ---

	describe('session recovery', () => {
		const orphanedSession = {
			sessionId: 7777,
			energyKwh: 1.1,
			stop: vi.fn().mockResolvedValue(undefined),
		};

		beforeEach(() => {
			orphanedSession.stop.mockClear();
			mockCp.getChargingSession.mockResolvedValue(orphanedSession);
		});

		it('adopts an orphaned session using the incomplete DB event when the process restarts mid-charge', async () => {
			const startedAt = new Date('2026-05-23T10:00:00Z');
			mockPrisma.chargingEvent.findFirst.mockResolvedValueOnce({
				id: 'event-orphan',
				startedAt,
				startAmps: 21,
				peakSolarKw: 7.2,
			});
			mockCp.getUserChargingStatus.mockResolvedValueOnce({ sessionId: 7777 });

			service.enable(); // fresh process: state = IDLE, activeSession = null
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 21,
				})
			);
			// Tesla loadKw already includes car @ 21A (5.04 kW). Use load slightly
			// below solar so that after the car draw is added back the target stays
			// at 21A (avoids adjustment side-effects in this assertion).
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 5.5, loadKw: 5.4 }));

			await service.runTick();

			const status = service.getStatus();
			expect(status.state).toBe(SunkeepState.CHARGING);
			expect(status.activeSession).not.toBeNull();
			expect(status.activeSession?.sessionId).toBe(7777);
			expect(status.activeSession?.currentAmps).toBe(21);
			expect(status.activeSession?.startedAt).toBe(startedAt.toISOString());
			// excess = solar - load + carKw = 5.5 - 5.4 + 5.04 = 5.14
			expect(status.excessKw).toBeCloseTo(5.14);
			// Should NOT have created a new event — reused the incomplete one.
			expect(mockPrisma.chargingEvent.create).not.toHaveBeenCalled();
			// No adjustment expected: target amps = floor(5140 / 240) = 21
			expect(mockCp.setAmperageLimit).not.toHaveBeenCalled();
		});

		it('resumes amp adjustment after adopting an orphaned session (regression: previous bug left amps stuck)', async () => {
			mockPrisma.chargingEvent.findFirst.mockResolvedValueOnce({
				id: 'event-orphan',
				startedAt: new Date('2026-05-23T10:00:00Z'),
				startAmps: 21,
				peakSolarKw: 7.2,
			});
			mockCp.getUserChargingStatus.mockResolvedValueOnce({ sessionId: 7777 });

			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 21,
				})
			);
			// Solar 6.01, load 5.50 — the exact scenario from the bug report.
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 6.01, loadKw: 5.5 }));

			await service.runTick();

			// excess after adoption = 6.01 - 5.5 + 5.04 = 5.55 → target = floor(5550/240) = 23
			expect(mockCp.setAmperageLimit).toHaveBeenCalledWith(42, 23);
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
			expect(service.getStatus().activeSession?.currentAmps).toBe(23);
		});

		it('closes a stale (>12h old) incomplete event and creates a fresh one when adopting', async () => {
			// Simulate a session row left over from days ago. The charger has since
			// started a new session, but we should NOT inherit the ancient startedAt.
			const ancientStartedAt = new Date(NOON.getTime() - 72 * 60 * 60 * 1000); // 3 days before NOON
			mockPrisma.chargingEvent.findFirst.mockResolvedValueOnce({
				id: 'event-ancient',
				startedAt: ancientStartedAt,
				startAmps: 16,
				peakSolarKw: 4.0,
			});
			mockCp.getUserChargingStatus.mockResolvedValueOnce({ sessionId: 7777 });

			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 21,
				})
			);
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 5.5, loadKw: 5.4 }));

			await service.runTick();

			// Old row should be closed with UNKNOWN
			expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'event-ancient' },
					data: expect.objectContaining({ stopReason: StopReason.UNKNOWN }),
				})
			);
			// And a fresh event should be created for the live session
			expect(mockPrisma.chargingEvent.create).toHaveBeenCalledOnce();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
			// The session's startedAt should be ~now (not 3 days ago)
			const sessionStart = service.getStatus().activeSession?.startedAt;
			expect(sessionStart).not.toBe(ancientStartedAt.toISOString());
			expect(new Date(sessionStart!).getTime()).toBeCloseTo(NOON.getTime(), -3); // within ~1s
		});

		it('reuses an open event that is just under the 12h threshold (preserves startedAt)', async () => {
			const recentStartedAt = new Date(NOON.getTime() - 11 * 60 * 60 * 1000); // 11h before NOON
			mockPrisma.chargingEvent.findFirst.mockResolvedValueOnce({
				id: 'event-recent',
				startedAt: recentStartedAt,
				startAmps: 21,
				peakSolarKw: 7.0,
			});
			mockCp.getUserChargingStatus.mockResolvedValueOnce({ sessionId: 7777 });

			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 21,
				})
			);
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 5.5, loadKw: 5.4 }));

			await service.runTick();

			// Should NOT create a new row, should NOT close the existing one.
			expect(mockPrisma.chargingEvent.create).not.toHaveBeenCalled();
			expect(mockPrisma.chargingEvent.update).not.toHaveBeenCalled();
			expect(service.getStatus().activeSession?.startedAt).toBe(recentStartedAt.toISOString());
		});

		it('creates a new ChargingEvent when charger is charging but DB has no incomplete event', async () => {
			mockPrisma.chargingEvent.findFirst.mockResolvedValueOnce(null);
			mockCp.getUserChargingStatus.mockResolvedValueOnce({ sessionId: 7777 });

			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 16,
				})
			);
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 5.0, loadKw: 4.5 }));

			await service.runTick();

			expect(mockPrisma.chargingEvent.create).toHaveBeenCalledOnce();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
			expect(service.getStatus().activeSession?.sessionId).toBe(7777);
		});

		it('closes a stale incomplete ChargingEvent when charger is not charging', async () => {
			mockPrisma.chargingEvent.findFirst.mockResolvedValueOnce({
				id: 'event-stale',
				startedAt: new Date('2026-05-23T09:00:00Z'),
				startAmps: 16,
				peakSolarKw: 5.0,
			});

			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'NOT_CHARGING' as HomeChargerStatus['chargingStatus'],
				})
			);
			mockPw.getData.mockResolvedValue(goodPwData());

			await service.runTick();

			expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'event-stale' },
					data: expect.objectContaining({ stopReason: StopReason.UNKNOWN }),
				})
			);
		});

		it('does not adopt when getUserChargingStatus returns null', async () => {
			mockCp.getUserChargingStatus.mockResolvedValueOnce(null);
			mockPrisma.chargingEvent.findFirst.mockResolvedValue(null);

			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
				})
			);
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 6.0, loadKw: 5.5 }));

			await service.runTick();

			expect(service.getStatus().activeSession).toBeNull();
			expect(mockPrisma.chargingEvent.create).not.toHaveBeenCalled();
		});

		it('manualStartSession adopts an orphaned session instead of starting a new one', async () => {
			const startedAt = new Date('2026-05-23T10:00:00Z');
			mockPrisma.chargingEvent.findFirst.mockResolvedValueOnce({
				id: 'event-orphan',
				startedAt,
				startAmps: 24,
				peakSolarKw: 8.0,
			});
			mockCp.getUserChargingStatus.mockResolvedValueOnce({ sessionId: 7777 });

			service.enable();
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 24,
				})
			);
			mockPw.getData.mockResolvedValue(goodPwData());

			await service.manualStartSession();

			expect(mockCp.startChargingSession).not.toHaveBeenCalled();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
			expect(service.getStatus().activeSession?.sessionId).toBe(7777);
		});
	});

	// --- isPluggedIn tracking ---

	it('tracks isPluggedIn in status after tick', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus({ isPluggedIn: true }));
		await service.runTick();
		expect(service.getStatus().isPluggedIn).toBe(true);

		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus({ isPluggedIn: false }));
		await service.runTick();
		expect(service.getStatus().isPluggedIn).toBe(false);
	});
});
