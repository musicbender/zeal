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

const mockCp = {
	getHomeChargerStatus: vi.fn(),
	setAmperageLimit: vi.fn().mockResolvedValue(undefined),
	startChargingSession: vi.fn().mockResolvedValue(mockSession),
	getHomeChargerTechnicalInfo: vi.fn().mockResolvedValue(mockTechInfo),
	getHomeChargerConfig: vi.fn().mockResolvedValue(mockCpConfig),
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

		it('adds battery discharging power to excess (battery discharging = positive kw)', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus({ isPluggedIn: true }));
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 1.0, loadKw: 0.5, batteryKw: 0.5 }));
			await service.runTick();
			// excess = 1.0 - 0.5 + 0.5 = 1.0
			expect(service.getStatus().excessKw).toBeCloseTo(1.0);
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
