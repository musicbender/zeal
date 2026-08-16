import {
	ChargerBusyError,
	CommunicationError,
	StartVerificationTimeoutError,
	UnresolvedSessionError,
	VehicleNotReadyError,
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

const mockCp = {
	getHomeChargerStatus: vi.fn(),
	setAmperageLimit: vi.fn().mockResolvedValue(undefined),
	startChargingSession: vi.fn().mockResolvedValue(mockSession),
	stopChargingSession: vi.fn().mockResolvedValue(undefined),
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
		delete: vi.fn().mockResolvedValue({}),
		findMany: vi.fn().mockResolvedValue([]),
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

// The data payload of the chargingEvent.update call that closed a session, if any.
function closingUpdate(): Record<string, unknown> | undefined {
	return mockPrisma.chargingEvent.update.mock.calls
		.map((c) => (c[0] as { data: Record<string, unknown> }).data)
		.find((d) => d.stoppedAt !== undefined);
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
		// clearAllMocks resets recorded calls but keeps implementations, so a test that
		// overrides a shared mock would leak into every test after it.
		mockCp.stopChargingSession.mockResolvedValue(undefined);
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

		it('adds car load when charger reports CHARGING but no active session (e.g. adoption failed)', async () => {
			// The Tesla total load includes the car draw; when sunkeep has no adopted
			// session it must still add back chargerAmps * 240V so the displayed excess
			// reflects available solar, not (solar - total load including car).
			// Simulate a transient getUserChargingStatus failure so adoption fails and
			// the service enters WAITING with the charger still reporting CHARGING.
			mockCp.getUserChargingStatus.mockRejectedValueOnce(new Error('transient API error'));
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 15,
				})
			);
			// Tesla load includes car at 15A (3.6 kW) + home (1.0 kW) = 4.6 kW
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 6.0, loadKw: 4.6 }));
			await service.runTick();
			// excess = 6.0 - 4.6 + min(0, 0) + (15 * 240 / 1000) = 1.4 + 3.6 = 5.0
			expect(service.getStatus().excessKw).toBeCloseTo(5.0);
		});
	});

	// --- Load accounting: splitting the metered load between car and house ---

	describe('load accounting', () => {
		// The reported fiendlord-keep payload. ChargePoint's amperage limit implied 6.24 kW
		// of car draw against a metered site total of 4.45 kW, so the dashboard subtracted
		// its way to a negative house load and Sunkeep believed it had more excess (6.48 kW)
		// than the array was producing (5.89 kW).
		const reportedPw = {
			batteryPct: 97.22504856165017,
			solarKw: 5.892,
			loadKw: 4.452199951171875,
			batteryKw: 0,
			gridKw: -1.439800048828125,
		};

		it('never reports the car drawing more than the whole site, nor a negative house load', async () => {
			mockCp.getUserChargingStatus.mockResolvedValue(null);
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 26,
				})
			);
			mockPw.getData.mockResolvedValue(reportedPw);

			await service.runTick();

			const status = service.getStatus();
			expect(status.carKw!).toBeLessThanOrEqual(status.loadKw!);
			expect(status.houseKw!).toBeGreaterThanOrEqual(0);
			// Excess is solar that is not being consumed — it cannot exceed production.
			expect(status.excessKw!).toBeLessThanOrEqual(status.solarKw!);
		});

		it('keeps carKw and excessKw consistent for a session adopted without a handle', async () => {
			// activeSession is null for app/auto-started sessions while state is CHARGING.
			// carKw used to read currentAmps and excessKw chargerAmps, so one payload
			// described the car at two different amperages (6.24 kW and 5.04 kW).
			mockCp.getUserChargingStatus.mockResolvedValue(null);
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 21,
				})
			);
			mockPw.getData.mockResolvedValue(reportedPw);

			await service.runTick();

			const status = service.getStatus();
			expect(status.activeSession).toBeNull();
			expect(status.state).toBe(SunkeepState.CHARGING);
			expect(status.excessKw!).toBeCloseTo(
				status.solarKw! - status.loadKw! + status.carKw! + Math.min(0, status.batteryKw!)
			);
			expect(status.houseKw!).toBeCloseTo(status.loadKw! - status.carKw!);
		});

		it('measures the car against a house baseline captured while the charger was idle', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			// Idle poll — the whole 0.61 kW of metered load is the house.
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 5.892, loadKw: 0.61 }));
			await service.runTick();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);

			// Car is now charging and the metered load has risen to include it.
			mockPw.getData.mockResolvedValue(reportedPw);
			await service.runTick();

			const status = service.getStatus();
			// 4.4522 measured total − 0.61 house baseline = what the car is really pulling,
			// well under the 5.28 kW the 22A limit would imply.
			expect(status.carKw!).toBeCloseTo(3.842, 2);
			expect(status.houseKw!).toBeCloseTo(0.61, 2);
			// Excess is production minus the house's own draw, independent of the amperage
			// we happen to have commanded.
			expect(status.excessKw!).toBeCloseTo(5.282, 2);
		});

		it('ignores an idle load reading taken before the car stopped drawing', async () => {
			// Tesla's telemetry lags the charger. A load reading timestamped while the car
			// was still pulling must not be adopted as the house baseline — doing so would
			// zero out every later carKw and collapse the excess.
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({ chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'] })
			);
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 6.0, loadKw: 4.6 }));
			await service.runTick();

			// Charger goes idle, but this poll's Tesla reading is stamped in the past.
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus({ isPluggedIn: false }));
			mockPw.getData.mockResolvedValue(
				goodPwData({ solarKw: 6.0, loadKw: 4.6, lastTeslaAt: new Date().toISOString() })
			);
			await service.runTick();

			// A stale baseline of 4.6 kW would have made the car read as 0 kW here.
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 15,
				})
			);
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 6.0, loadKw: 4.6 }));
			await service.runTick();

			// A stale 4.6 kW baseline would have put the car at 0 kW, which collapses the
			// excess to 1.4 kW and stops the session Sunkeep just adopted.
			expect(service.getStatus().carKw!).toBeGreaterThan(0);
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
		});
	});

	// --- Amperage ratchet ---

	it('does not raise amps twice off a single Powerwall reading', async () => {
		// The reported 16A → 21A → 26A climb inside twelve seconds: each poll added the
		// amperage it had just commanded back into the excess, then commanded more, while
		// the Tesla client served the same cached live_status snapshot throughout.
		const teslaAt = '2026-07-27T15:12:37-07:00';
		mockCp.getUserChargingStatus.mockResolvedValue(null);
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(
			pluggedInStatus({
				chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
				amperageLimit: 16,
			})
		);
		mockPw.getData.mockResolvedValue({
			batteryPct: 97.2,
			solarKw: 5.892,
			loadKw: 4.4522,
			batteryKw: 0,
			lastTeslaAt: teslaAt,
		});

		await service.runTick();
		const firstTarget = mockCp.setAmperageLimit.mock.calls.at(-1)?.[1];
		expect(firstTarget).toBeGreaterThan(16);

		// Two more polls against the same live_status snapshot must change nothing.
		mockCp.setAmperageLimit.mockClear();
		await service.runTick();
		await service.runTick();
		expect(mockCp.setAmperageLimit).not.toHaveBeenCalled();

		// A fresh reading — the car is now drawing what we asked for on top of a 0.61 kW
		// house — resumes management and settles instead of climbing to the 32A ceiling.
		mockPw.getData.mockResolvedValue({
			batteryPct: 97.2,
			solarKw: 5.892,
			loadKw: 0.61 + (firstTarget! * 240) / 1000,
			batteryKw: 0,
			lastTeslaAt: '2026-07-27T15:22:37-07:00',
		});
		await service.runTick();
		const settled = mockCp.setAmperageLimit.mock.calls.at(-1)?.[1] ?? firstTarget;
		expect(settled).toBeLessThan(32);
	});

	// --- Sessions that cannot be stopped over REST ---

	describe('a charger whose sessions cannot be stopped over REST', () => {
		// Reproduces the production log: every stop answers UnresolvedSessionError, the
		// charger keeps delivering current at the MIN_AMPS clamp, and the next poll used
		// to adopt that same continuous charge into a brand new row — eight "sessions" in
		// three hours for one physical charge.
		function charging(amps: number): HomeChargerStatus {
			return pluggedInStatus({
				chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
				amperageLimit: amps,
			});
		}

		beforeEach(() => {
			mockCp.getUserChargingStatus.mockResolvedValue(null);
			mockCp.stopChargingSession.mockRejectedValue(new UnresolvedSessionError(42));
		});

		it('does not open a new event row each time policy flickers', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(charging(8));
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 5.1, loadKw: 2.52 }));
			await service.runTick();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
			expect(mockPrisma.chargingEvent.create).toHaveBeenCalledOnce();

			// Solar collapses — Sunkeep wants to stop but the charger will not let it.
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 0.5, loadKw: 4.5 }));
			await service.runTick();
			expect(service.getStatus().state).toBe(SunkeepState.WAITING);
			// The charge did not end, so nothing may be recorded as ended.
			expect(mockPrisma.chargingEvent.update).not.toHaveBeenCalledWith(
				expect.objectContaining({ data: expect.objectContaining({ stoppedAt: expect.anything() }) })
			);

			// Two more polls with the charger still delivering: still one row.
			await service.runTick();
			await service.runTick();
			expect(mockPrisma.chargingEvent.create).toHaveBeenCalledOnce();

			// Solar returns; the same row carries on rather than a fresh one being opened.
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 5.1, loadKw: 2.52 }));
			await service.runTick();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
			expect(mockPrisma.chargingEvent.create).toHaveBeenCalledOnce();
		});

		it('closes the row with the reason it wanted, once the charger really stops', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(charging(8));
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 5.1, loadKw: 2.52 }));
			await service.runTick();

			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 0.5, loadKw: 4.5 }));
			await service.runTick(); // wants to stop, cannot

			// The car finishes and the charger finally reports idle.
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
			await service.runTick();
			await service.runTick(); // second observation clears the external-stop debounce

			expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ stopReason: StopReason.SOLAR_DROPPED }),
				})
			);
		});
	});

	// --- Session energy ---

	describe('session energyKwh', () => {
		// The real-world shape: no driver-plane session handle, so session?.energyKwh is
		// never available and everything rests on what the device plane reports.
		beforeEach(() => {
			mockCp.getUserChargingStatus.mockResolvedValue(null);
		});

		it('integrates the car draw when ChargePoint reports no energy at all', async () => {
			// node-chargepoint only fills HomeChargerStatus.energyKwh when the charger's
			// status payload carries it, and this charger's does not — so both readings are
			// absent and every row landed null.
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 16,
				})
			);
			// House 1.0 kW plus the car at 16A (3.84 kW).
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 6.0, loadKw: 4.84 }));
			await service.runTick();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);

			// Half an hour later, still charging.
			vi.setSystemTime(new Date(NOON.getTime() + 30 * 60 * 1000));
			await service.runTick();

			// Car unplugged — the session closes.
			vi.setSystemTime(new Date(NOON.getTime() + 35 * 60 * 1000));
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus({ isPluggedIn: false }));
			await service.runTick();

			const closing = closingUpdate();
			expect(closing).toBeDefined();
			// ~0.5h at roughly 3.8 kW.
			expect(closing!.energyKwh).toBeGreaterThan(1);
			expect(closing!.energyEstimated).toBe(true);
		});

		it('prefers the charger reading and does not flag it as estimated', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 16,
					energyKwh: 7.5,
				})
			);
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 6.0, loadKw: 4.84 }));
			await service.runTick();

			vi.setSystemTime(new Date(NOON.getTime() + 30 * 60 * 1000));
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({ isPluggedIn: false, energyKwh: 7.5 })
			);
			await service.runTick();

			const closing = closingUpdate();
			expect(closing!.energyKwh).toBe(7.5);
			expect(closing!.energyEstimated).toBe(false);
		});
	});

	describe('closed-loop amperage control', () => {
		// A house that draws 0.6 kW and a car that takes exactly the limit it is given.
		function lastCommandedAmps(): number {
			return mockCp.setAmperageLimit.mock.calls.at(-1)![1] as number;
		}

		function siteAt(solarKw: number, amps: number, lastTeslaAt: string) {
			return {
				batteryPct: 97,
				solarKw,
				loadKw: 0.6 + (amps * 240) / 1000,
				batteryKw: 0,
				lastTeslaAt,
			};
		}

		it('settles at the amperage the surplus supports instead of climbing', async () => {
			// From the log: adopt at the 8A the previous stop clamped to, then ramp. The
			// ramp must land where solar actually covers it and stay there — the open-loop
			// form re-added the amperage it had just commanded, so each tick found "more"
			// excess than the one before.
			mockCp.getUserChargingStatus.mockResolvedValue(null);
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 8,
				})
			);
			mockPw.getData.mockResolvedValue(siteAt(5.1, 8, 'T1'));
			await service.runTick();

			// surplus = 5.1 - 2.52 = 2.58 kW = 10.75A -> 8 + 10 = 18A
			let amps = lastCommandedAmps();
			expect(amps).toBe(18);

			// The car takes it; the surplus it consumed is gone, so nothing more to give.
			mockPw.getData.mockResolvedValue(siteAt(5.1, amps, 'T2'));
			mockCp.setAmperageLimit.mockClear();
			await service.runTick();
			expect(mockCp.setAmperageLimit).not.toHaveBeenCalled();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);

			// Solar falls by 2 kW — wind back down to match, do not stop. The site is
			// importing 1.82 kW at 18A, which is 7 amps' worth after the deadband.
			mockPw.getData.mockResolvedValue(siteAt(3.1, 18, 'T3'));
			await service.runTick();
			amps = lastCommandedAmps();
			expect(amps).toBe(11);
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
		});

		it('stops once the surplus cannot cover the draw the car already has', async () => {
			mockCp.getUserChargingStatus.mockResolvedValue(null);
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 8,
				})
			);
			mockPw.getData.mockResolvedValue(siteAt(5.1, 8, 'T1'));
			await service.runTick();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);

			// Solar collapses: at 18A the site is importing 3.8 kW, more than winding all
			// the way down to 8A could recover.
			mockPw.getData.mockResolvedValue(siteAt(1.0, 18, 'T2'));
			await service.runTick();

			expect(service.getStatus().state).toBe(SunkeepState.WAITING);
			expect(service.getStatus().waitReason).toBe('Insufficient solar excess');
		});

		it('stops raising the limit for a car that is not taking the headroom', async () => {
			// A car tapering at its charge limit keeps the surplus high no matter what
			// limit it is offered. Walking the limit to 32A against it achieves nothing and
			// leaves a 7.7 kW ceiling for the car to wake up into.
			mockCp.getUserChargingStatus.mockResolvedValue(null);
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 8,
				})
			);
			// Load never moves off 8A worth of draw however high the limit goes.
			mockPw.getData.mockResolvedValue(siteAt(5.1, 8, 'T1'));
			await service.runTick();
			expect(lastCommandedAmps()).toBe(18);

			mockCp.setAmperageLimit.mockClear();
			mockPw.getData.mockResolvedValue(siteAt(5.1, 8, 'T2'));
			await service.runTick();
			mockPw.getData.mockResolvedValue(siteAt(5.1, 8, 'T3'));
			await service.runTick();

			expect(mockCp.setAmperageLimit).not.toHaveBeenCalled();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
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

	it('persists the started session id onto the ChargingEvent for debugging/audit', async () => {
		// The event row is created before startChargingSession() resolves (so the
		// attempt is recorded even if it times out) — sessionId can only be known
		// afterward, via a follow-up update.
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));

		await service.runTick();

		expect(mockPrisma.chargingEvent.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.not.objectContaining({ sessionId: expect.anything() }),
			})
		);
		expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith({
			where: { id: 'event-1' },
			data: { sessionId: mockSession.sessionId },
		});
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

	it('reports a ChargePoint refusal, not a full car, when error 25 arrives with a non-DONE charger', async () => {
		// VehicleNotReadyError (ChargePoint error 25) is also how ChargePoint refuses a
		// start it cannot service — a stale session on their backend that the REST API
		// will not let us clear. Calling that "Car fully charged" sends the user hunting
		// for a charge limit that is not the problem; the charger is not reporting DONE.
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));
		const cpError = new VehicleNotReadyError(
			'Unable to start charging. Please try again after the vehicle charging has unplugged.',
			{ errorId: 25, errorCategory: 'CHARGE', errorMessage: 'Unable to start charging.' }
		);
		mockCp.startChargingSession.mockRejectedValueOnce(cpError);

		await service.runTick();

		expect(mockPrisma.chargingEvent.create).toHaveBeenCalledOnce();
		// The optimistically-created row must be deleted, not left open — otherwise the
		// next tick's reconcile closes it as a bogus UNKNOWN "session".
		expect(mockPrisma.chargingEvent.delete).toHaveBeenCalledWith({ where: { id: 'event-1' } });
		expect(service.getStatus().state).toBe(SunkeepState.WAITING);
		expect(service.getStatus().waitReason).toBe('ChargePoint rejected start');
	});

	it('reports "Car fully charged" when error 25 arrives and the charger corroborates with DONE', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(
			pluggedInStatus({ chargingStatus: 'DONE' as HomeChargerStatus['chargingStatus'] })
		);
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));
		mockCp.startChargingSession.mockRejectedValueOnce(
			new VehicleNotReadyError('Unable to start charging.', {
				errorId: 25,
				errorCategory: 'CHARGE',
				errorMessage: 'Unable to start charging.',
			})
		);

		// The automated tick short-circuits on DONE, so drive the start explicitly.
		await service.manualStartSession();

		expect(service.getStatus().state).toBe(SunkeepState.WAITING);
		expect(service.getStatus().waitReason).toBe('Car fully charged');
	});

	it('does not re-attempt a start (no churning event rows) after a car-full rejection until unplugged', async () => {
		// Reproduces the real-world bug: a full car for which ChargePoint reports
		// NOT_CHARGING (rather than DONE). Without the carReportedFull guard, every
		// 10-minute tick would create a fresh event row, attempt a start, get
		// VehicleNotReadyError, and orphan the row — producing one junk ~10-minute
		// "session" per tick.
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));
		const cpError = new VehicleNotReadyError('Unable to start charging.', {
			errorId: 25,
			errorCategory: 'CHARGE',
			errorMessage: 'Unable to start charging.',
		});
		// Only the first tick should reach startChargingSession; the guard must prevent
		// any further attempts, so a single one-shot rejection is all that's needed.
		mockCp.startChargingSession.mockRejectedValueOnce(cpError);

		await service.runTick(); // first tick: attempts start, gets VehicleNotReadyError, deletes row
		await service.runTick(); // subsequent ticks: must short-circuit, no new attempt
		await service.runTick();

		expect(mockCp.startChargingSession).toHaveBeenCalledOnce();
		expect(mockPrisma.chargingEvent.create).toHaveBeenCalledOnce();
		expect(service.getStatus().state).toBe(SunkeepState.WAITING);
		expect(service.getStatus().waitReason).toBe('ChargePoint rejected start');

		// Unplugging clears the guard so a later plug-in gets a fresh attempt.
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus({ isPluggedIn: false }));
		await service.runTick();
		expect(service.getStatus().state).toBe(SunkeepState.IDLE);

		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		await service.runTick();
		expect(mockCp.startChargingSession).toHaveBeenCalledTimes(2);
	});

	it('enters WAITING with "Charger busy" and drops the row when startChargingSession throws ChargerBusyError', async () => {
		// ChargerBusyError (ChargePoint error 89) means the charger refused the start
		// because the connector is in use by another user or needs to be re-seated. The
		// start did not take, so Sunkeep must surface "Charger busy" and delete the
		// optimistically-created event row rather than leaving it open (which next-tick
		// reconcile would close as a junk UNKNOWN row).
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));
		const cpError = new ChargerBusyError(
			'Failed to start charging. May be in use by another user or return plug and try again.',
			{
				errorId: 89,
				errorCategory: 'CHARGE',
				errorMessage:
					'Failed to start charging. May be in use by another user or return plug and try again.',
			}
		);
		mockCp.startChargingSession.mockRejectedValueOnce(cpError);

		await service.runTick();

		expect(mockPrisma.chargingEvent.create).toHaveBeenCalledOnce();
		expect(mockPrisma.chargingEvent.delete).toHaveBeenCalledWith({ where: { id: 'event-1' } });
		expect(service.getStatus().state).toBe(SunkeepState.WAITING);
		expect(service.getStatus().waitReason).toBe('Charger busy');
	});

	it('retries the start on the next tick after a ChargerBusyError (transient, not car-full)', async () => {
		// Unlike VehicleNotReadyError (car full), a busy charger is transient: Sunkeep must
		// not set the carReportedFull guard, so the next tick re-attempts the start once
		// conditions still hold. The second attempt succeeds and the service reaches
		// CHARGING.
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));
		mockCp.startChargingSession
			.mockRejectedValueOnce(new ChargerBusyError())
			.mockResolvedValueOnce(mockSession);

		await service.runTick(); // first tick: busy, drops row, WAITING
		expect(service.getStatus().state).toBe(SunkeepState.WAITING);
		expect(service.getStatus().waitReason).toBe('Charger busy');

		await service.runTick(); // second tick: retries and succeeds
		expect(mockCp.startChargingSession).toHaveBeenCalledTimes(2);
		expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
	});

	it('adopts the live session on ChargerBusyError when the charger is actually already CHARGING', async () => {
		// Reproduces the real-world "force start doesn't work" bug: the charger is already
		// delivering current (auto-started on plug-in, invisible to getUserChargingStatus),
		// so startChargingSession races it and loses with ChargerBusyError. Rather than
		// giving up in WAITING, Sunkeep must re-check the device plane and, seeing CHARGING,
		// adopt the row it optimistically created instead of failing the start.
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus
			.mockResolvedValueOnce(pluggedInStatus()) // initial tick poll: NOT_CHARGING
			.mockResolvedValueOnce(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 12,
				})
			); // recheck after ChargerBusyError: charger is actually charging
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));
		mockCp.startChargingSession.mockRejectedValueOnce(new ChargerBusyError());

		await service.runTick();

		expect(mockPrisma.chargingEvent.delete).not.toHaveBeenCalled();
		expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
		expect(service.getStatus().waitReason).toBeNull();
	});

	it('enters WAITING with the ChargePoint errorMessage for other CommunicationErrors', async () => {
		// node-chargepoint >=0.11 surfaces a clean human-readable message directly on
		// CommunicationError (no JSON to parse out of err.message).
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));
		const cpError = new CommunicationError(422, 'Some other transient error', {
			errorId: 99,
			errorCategory: 'CHARGE',
			errorMessage: 'Some other transient error',
		});
		mockCp.startChargingSession.mockRejectedValueOnce(cpError);

		await service.runTick();

		expect(service.getStatus().state).toBe(SunkeepState.WAITING);
		expect(service.getStatus().waitReason).toBe('Some other transient error');
	});

	it('stops ghost ChargePoint session then starts immediately (no second click needed)', async () => {
		// ChargePoint has an active session record (from a prior failed start) but the
		// hardware is not CHARGING, so reconcileWithCharger never adopted it.
		// startSession must detect, stop, and immediately retry — not defer to next tick —
		// so that manual force-charge works on the first click.
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));
		mockCp.getUserChargingStatus.mockResolvedValueOnce({ sessionId: 55 });

		await service.runTick();

		expect(mockCp.stopChargingSession).toHaveBeenCalledWith(42);
		expect(mockCp.startChargingSession).toHaveBeenCalledWith(42);
		expect(mockPrisma.chargingEvent.create).toHaveBeenCalledOnce();
		expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
	});

	it('returns WAITING when ghost session stop fails (non-NoActiveSessionError)', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));
		mockCp.getUserChargingStatus.mockResolvedValueOnce({ sessionId: 55 });
		mockCp.stopChargingSession.mockRejectedValueOnce(new CommunicationError(500, 'network error'));

		await service.runTick();

		expect(mockCp.startChargingSession).not.toHaveBeenCalled();
		expect(mockPrisma.chargingEvent.create).not.toHaveBeenCalled();
		expect(service.getStatus().state).toBe(SunkeepState.WAITING);
		expect(service.getStatus().waitReason).toBe('ChargePoint start error');
	});

	it('does not start at 1.5 kW surplus — the charger cannot draw less than 1.92 kW', async () => {
		// 8A at 240V is 1.92 kW, so a 1.5 kW surplus cannot run even the minimum charge:
		// starting would pull the remaining 0.42 kW from the grid or the Powerwall.
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 2.5, loadKw: 1.0 }));
		await service.runTick();
		expect(mockCp.startChargingSession).not.toHaveBeenCalled();
		expect(service.getStatus().waitReason).toBe('Insufficient solar excess');
	});

	it('starts at 8A once the surplus covers the minimum draw', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 2.92, loadKw: 1.0 })); // 1.92 kW → exactly 8A
		await service.runTick();
		expect(mockCp.setAmperageLimit).toHaveBeenCalledWith(42, 8);
		expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
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

		mockPw.getData.mockResolvedValue(goodPwData({ batteryPct: 79 })); // below floor 80 (95 - 15 hysteresis)
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

	it('persists energyKwh from the device-plane status when the session was adopted without a handle', async () => {
		// Sessions adopted without a driver-plane session handle (the common case for
		// chargers whose auto-started sessions never surface via getUserChargingStatus) have
		// no session.energyKwh to read at stop time — session is null. Sunkeep must fall back
		// to the device-plane energyKwh polled on each tick instead of persisting null.
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getUserChargingStatus.mockResolvedValueOnce(null); // no driver-plane handle
		mockCp.getHomeChargerStatus.mockResolvedValueOnce(
			pluggedInStatus({
				chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
				energyKwh: 1.2,
			})
		);
		mockPw.getData.mockResolvedValue(goodPwData());
		await service.runTick(); // adopt without a handle
		expect(service.getStatus().activeSession).toBeNull();

		mockCp.getHomeChargerStatus.mockResolvedValue(
			pluggedInStatus({
				chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
				energyKwh: 3.4,
			})
		);
		await service.runTick(); // energy climbs

		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus({ isPluggedIn: false }));
		await service.runTick(); // charger reports stopped -> closes the event

		expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ energyKwh: 3.4 }),
			})
		);
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

	it('falls back to device-level stop when session.stop() reports no-active-session', async () => {
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData());
		await service.runTick(); // start CHARGING with a session handle

		const { NoActiveSessionError } = await import('node-chargepoint');
		mockSession.stop.mockRejectedValueOnce(new NoActiveSessionError());

		await service.manualStopSession();

		expect(mockSession.stop).toHaveBeenCalled();
		// Device-level stop must be attempted as a second mechanism
		expect(mockCp.stopChargingSession).toHaveBeenCalledWith(42);
		expect(service.getStatus().state).toBe(SunkeepState.IDLE);
	});

	it('clamps to minimum amps and still closes the record when the session id cannot be resolved', async () => {
		// node-chargepoint's stopChargingSession throws UnresolvedSessionError when it cannot
		// resolve the live session id over REST (e.g. a CPH50 that only surfaces auto-started
		// sessions over WebSocket). Sunkeep must not throw — it closes the event record and
		// falls back to the MIN_AMPS clamp.
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData());
		mockCp.getUserChargingStatus.mockResolvedValueOnce(null); // ghost-session check at start
		await service.runTick(); // start CHARGING with a session handle

		const { NoActiveSessionError, UnresolvedSessionError } = await import('node-chargepoint');
		mockSession.stop.mockRejectedValueOnce(new NoActiveSessionError());
		mockCp.stopChargingSession.mockRejectedValueOnce(new UnresolvedSessionError(42));
		mockCp.setAmperageLimit.mockClear();

		await service.manualStopSession();

		// Belt-and-suspenders MIN_AMPS clamp is still applied.
		expect(mockCp.setAmperageLimit).toHaveBeenCalledWith(42, 8);
		expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ stopReason: StopReason.MANUAL }),
			})
		);
		expect(service.getStatus().state).toBe(SunkeepState.IDLE);
	});

	it('manualStopSession() still stops the charger when state drifted to WAITING but the charger reports CHARGING', async () => {
		// Reproduces the real-world bug: the charger is CHARGING with no session/event
		// Sunkeep owns (solar policy rejected adopting it), leaving Sunkeep in WAITING while
		// the car keeps drawing current at the clamped minimum. A force-stop must still
		// retry the stop instead of no-op'ing just because state !== CHARGING.
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(
			pluggedInStatus({ chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'] })
		);
		// Charger reports amperageLimit 16 (3.84 kW draw); even adding that back, excess is
		// still well below the 1.5 kW threshold, so evaluateSolarPolicy rejects adopting it.
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 0.5, loadKw: 5.0 }));
		await service.runTick(); // policy rejects adopting -> WAITING, no owned session/event
		expect(service.getStatus().state).toBe(SunkeepState.WAITING);
		expect(service.getStatus().activeSession).toBeNull();

		mockCp.stopChargingSession.mockClear();
		mockCp.setAmperageLimit.mockClear();

		await service.manualStopSession();

		expect(mockCp.stopChargingSession).toHaveBeenCalledWith(42);
		expect(mockCp.setAmperageLimit).toHaveBeenCalledWith(42, 8);
		expect(service.getStatus().state).toBe(SunkeepState.IDLE);
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

	it('manualStartSession() attempts the start even when the charger reports DONE', async () => {
		// DONE means the car was at its charge limit when ChargePoint last looked, which
		// goes stale as soon as the limit is raised. Refusing to try left the user with a
		// charger that starts fine from the ChargePoint app while Sunkeep insisted the car
		// was full — an explicit force start must let ChargePoint make the call.
		service.enable();
		mockCp.getHomeChargerStatus.mockResolvedValue(
			pluggedInStatus({ chargingStatus: 'DONE' as HomeChargerStatus['chargingStatus'] })
		);
		mockPw.getData.mockResolvedValue(goodPwData());
		await service.manualStartSession();

		expect(mockCp.startChargingSession).toHaveBeenCalledWith(42);
		expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
		expect(service.getStatus().forced).toBe(true);
	});

	it('manualStartSession() reports "Car fully charged" when a DONE car really rejects the start', async () => {
		// The genuine car-full case still surfaces correctly: ChargePoint answers the
		// attempt with error 25 and Sunkeep re-latches the guard instead of churning rows.
		service.enable();
		mockCp.getHomeChargerStatus.mockResolvedValue(
			pluggedInStatus({ chargingStatus: 'DONE' as HomeChargerStatus['chargingStatus'] })
		);
		mockPw.getData.mockResolvedValue(goodPwData());
		mockCp.startChargingSession.mockRejectedValueOnce(
			new VehicleNotReadyError('Unable to start charging.', {
				errorId: 25,
				errorCategory: 'CHARGE',
				errorMessage: 'Unable to start charging.',
			})
		);

		await service.manualStartSession();

		expect(service.getStatus().state).toBe(SunkeepState.WAITING);
		expect(service.getStatus().waitReason).toBe('Car fully charged');
		expect(mockPrisma.chargingEvent.delete).toHaveBeenCalledWith({ where: { id: 'event-1' } });
	});

	it('manualStartSession() clears a latched car-full guard so a force start is not blocked', async () => {
		// A prior error-25 rejection latches carReportedFull, after which every tick
		// short-circuits to "Car fully charged". A force start must clear it and try again
		// rather than inherit a stale verdict.
		service.enable();
		vi.setSystemTime(NOON);
		mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
		mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));
		mockCp.startChargingSession.mockRejectedValueOnce(
			new VehicleNotReadyError('Unable to start charging.', {
				errorId: 25,
				errorCategory: 'CHARGE',
				errorMessage: 'Unable to start charging.',
			})
		);
		await service.runTick();
		expect(service.getStatus().waitReason).toBe('ChargePoint rejected start');

		await service.manualStartSession();

		expect(mockCp.startChargingSession).toHaveBeenCalledTimes(2);
		expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
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
			mockPrisma.chargingEvent.findMany.mockResolvedValueOnce([
				{
					id: 'event-orphan',
					startedAt,
					startAmps: 21,
					peakSolarKw: 7.2,
				},
			]);
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
			mockPrisma.chargingEvent.findMany.mockResolvedValueOnce([
				{
					id: 'event-orphan',
					startedAt: new Date('2026-05-23T10:00:00Z'),
					startAmps: 21,
					peakSolarKw: 7.2,
				},
			]);
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
			mockPrisma.chargingEvent.findMany.mockResolvedValueOnce([
				{
					id: 'event-ancient',
					startedAt: ancientStartedAt,
					startAmps: 16,
					peakSolarKw: 4.0,
				},
			]);
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

		it('uses the driver-plane startTime for a freshly-created ChargingEvent, when available', async () => {
			// The car auto-started 6 minutes before this poll noticed it — well within
			// a single 10-minute tick interval, so "now" would understate the true
			// start by that much. getUserChargingStatus's startTime is ChargePoint's
			// own record and should be used instead.
			const trueStart = new Date(NOON.getTime() - 6 * 60 * 1000);
			mockPrisma.chargingEvent.findMany.mockResolvedValueOnce([]);
			mockCp.getUserChargingStatus.mockResolvedValueOnce({
				sessionId: 7777,
				startTime: trueStart,
				asOf: NOON,
			});

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

			expect(mockPrisma.chargingEvent.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ startedAt: trueStart, sessionId: 7777 }),
				})
			);
			expect(service.getStatus().activeSession?.startedAt).toBe(trueStart.toISOString());
		});

		it('falls back to now when the driver-plane status has no usable startTime', async () => {
			mockPrisma.chargingEvent.findMany.mockResolvedValueOnce([]);
			// node-chargepoint returns epoch(0) when it can't parse a timestamp — must
			// not be mistaken for a real start time.
			mockCp.getUserChargingStatus.mockResolvedValueOnce({
				sessionId: 7777,
				startTime: new Date(0),
				asOf: NOON,
			});

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

			expect(mockPrisma.chargingEvent.create).toHaveBeenCalledWith(
				expect.objectContaining({ data: expect.objectContaining({ startedAt: NOON }) })
			);
			expect(service.getStatus().activeSession?.startedAt).toBe(NOON.toISOString());
		});

		it('reuses an open event that is just under the 12h threshold (preserves startedAt)', async () => {
			const recentStartedAt = new Date(NOON.getTime() - 11 * 60 * 60 * 1000); // 11h before NOON
			mockPrisma.chargingEvent.findMany.mockResolvedValueOnce([
				{
					id: 'event-recent',
					startedAt: recentStartedAt,
					startAmps: 21,
					peakSolarKw: 7.0,
				},
			]);
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
			mockPrisma.chargingEvent.findMany.mockResolvedValueOnce([]);
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
			mockPrisma.chargingEvent.findMany.mockResolvedValueOnce([
				{
					id: 'event-stale',
					startedAt: new Date('2026-05-23T09:00:00Z'),
					startAmps: 16,
					peakSolarKw: 5.0,
				},
			]);

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

		it('closes ALL multiple orphaned open events when charger is not charging', async () => {
			// Regression: previously only the most-recent open event was closed per tick.
			// Now all stale open rows must be closed in a single pass.
			mockPrisma.chargingEvent.findMany.mockResolvedValueOnce([
				{
					id: 'event-c',
					startedAt: new Date('2026-05-23T09:30:00Z'),
					startAmps: 24,
					peakSolarKw: null,
				},
				{
					id: 'event-b',
					startedAt: new Date('2026-05-23T09:20:00Z'),
					startAmps: 8,
					peakSolarKw: null,
				},
				{
					id: 'event-a',
					startedAt: new Date('2026-05-23T09:10:00Z'),
					startAmps: 15,
					peakSolarKw: null,
				},
			]);

			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({ chargingStatus: 'NOT_CHARGING' as HomeChargerStatus['chargingStatus'] })
			);
			mockPw.getData.mockResolvedValue(goodPwData());

			await service.runTick();

			// All three rows should be closed
			expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'event-a' },
					data: expect.objectContaining({ stopReason: StopReason.UNKNOWN }),
				})
			);
			expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'event-b' },
					data: expect.objectContaining({ stopReason: StopReason.UNKNOWN }),
				})
			);
			expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'event-c' },
					data: expect.objectContaining({ stopReason: StopReason.UNKNOWN }),
				})
			);
			// Solar/battery still allow charging, so Sunkeep starts a fresh session right
			// after closing the stale rows — a 4th update persists its sessionId.
			expect(mockPrisma.chargingEvent.update).toHaveBeenCalledTimes(4);
			expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
				expect.objectContaining({ data: { sessionId: mockSession.sessionId } })
			);
		});

		it('closes extra orphaned open events during adoption, reusing only the freshest', async () => {
			// Regression: multiple open rows accumulated from previous failed starts.
			// During adoption the freshest should be reused; all older ones must be closed.
			const freshStartedAt = new Date(NOON.getTime() - 30 * 60 * 1000); // 30 min ago
			mockPrisma.chargingEvent.findMany.mockResolvedValueOnce([
				{ id: 'event-fresh', startedAt: freshStartedAt, startAmps: 15, peakSolarKw: null },
				{
					id: 'event-old-1',
					startedAt: new Date(NOON.getTime() - 60 * 60 * 1000),
					startAmps: 8,
					peakSolarKw: null,
				},
				{
					id: 'event-old-2',
					startedAt: new Date(NOON.getTime() - 90 * 60 * 1000),
					startAmps: 15,
					peakSolarKw: null,
				},
			]);
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

			// The two older rows should be closed
			expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'event-old-1' },
					data: expect.objectContaining({ stopReason: StopReason.UNKNOWN }),
				})
			);
			expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'event-old-2' },
					data: expect.objectContaining({ stopReason: StopReason.UNKNOWN }),
				})
			);
			// The freshest row should be reused (no create, no update for event-fresh)
			expect(mockPrisma.chargingEvent.create).not.toHaveBeenCalled();
			const updateCalls = (mockPrisma.chargingEvent.update as ReturnType<typeof vi.fn>).mock.calls;
			expect(updateCalls.every((c: any[]) => c[0].where.id !== 'event-fresh')).toBe(true);
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
			expect(service.getStatus().activeSession?.sessionId).toBe(7777);
		});

		it('retries adoption next tick when session we started is not yet visible via getUserChargingStatus', async () => {
			// After StartVerificationTimeoutError sets activeEventId but no activeSession,
			// the next tick must NOT try to stop our own session just because
			// getUserChargingStatus returns null. It should keep CHARGING state and
			// retry adoption once the session propagates.
			service.enable();
			vi.setSystemTime(NOON);
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));

			// Tick 1: start session, verification times out but charger confirms charging
			mockCp.getHomeChargerStatus.mockResolvedValueOnce(pluggedInStatus());
			mockCp.startChargingSession.mockRejectedValueOnce(
				new StartVerificationTimeoutError(42, 15000, 8, true)
			);
			await service.runTick();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);

			// Tick 2: charger still reports CHARGING, user-status API still null
			// → should NOT stop our session; should stay CHARGING
			mockCp.getUserChargingStatus.mockResolvedValueOnce(null);
			mockCp.getHomeChargerStatus.mockResolvedValueOnce(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 12,
				})
			);
			await service.runTick();

			expect(mockCp.stopChargingSession).not.toHaveBeenCalled();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
			expect(service.getStatus().waitReason).toBeNull();
		});

		it('completes adoption on the tick when getUserChargingStatus starts returning the session', async () => {
			// After the timeout path leaves us without activeSession, the session
			// should be fully adopted once getUserChargingStatus propagates.
			service.enable();
			vi.setSystemTime(NOON);
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));

			// Tick 1: timeout path — activeEventId set, no activeSession
			mockCp.getHomeChargerStatus.mockResolvedValueOnce(pluggedInStatus());
			mockCp.startChargingSession.mockRejectedValueOnce(
				new StartVerificationTimeoutError(42, 15000, 8, true)
			);
			await service.runTick();

			// Tick 2: getUserChargingStatus now returns the session
			mockCp.getUserChargingStatus.mockResolvedValueOnce({ sessionId: 7777 });
			mockCp.getHomeChargerStatus.mockResolvedValueOnce(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 12,
				})
			);
			await service.runTick();

			expect(service.getStatus().activeSession?.sessionId).toBe(7777);
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
		});

		it('closes event and resets state when charger stops for an unconfirmed session (timeout path + external stop)', async () => {
			// StartVerificationTimeoutError leaves activeEventId but no activeSession.
			// If the charger then stops (user stopped via app), reconcile should close
			// the event and let tick() re-evaluate conditions rather than getting stuck.
			service.enable();
			vi.setSystemTime(NOON);
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));

			// Tick 1: timeout path — state=CHARGING, activeEventId set, no activeSession
			mockCp.getHomeChargerStatus.mockResolvedValueOnce(pluggedInStatus());
			mockCp.startChargingSession.mockRejectedValueOnce(
				new StartVerificationTimeoutError(42, 15000, 8, true)
			);
			await service.runTick();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);

			// Tick 2: charger now confirms CHARGING (session propagated, adoption retries)
			mockCp.getUserChargingStatus.mockResolvedValueOnce(null);
			mockCp.getHomeChargerStatus.mockResolvedValueOnce(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 12,
				})
			);
			await service.runTick();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);

			// Tick 3: user stopped via app — charger now NOT_CHARGING; low excess so we'd wait
			// (getUserChargingStatus is NOT called in Case 3 path — don't mock it here)
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 1.8, loadKw: 1.5 }));
			mockCp.getHomeChargerStatus.mockResolvedValueOnce(
				pluggedInStatus({
					chargingStatus: 'NOT_CHARGING' as HomeChargerStatus['chargingStatus'],
					isPluggedIn: true,
				})
			);
			await service.runTick();

			// First not-charging poll is debounced — the session is held, not yet closed.
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
			expect(mockPrisma.chargingEvent.update).not.toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ stopReason: StopReason.UNKNOWN }),
				})
			);

			// Tick 4: still NOT_CHARGING — external stop confirmed, close as UNKNOWN.
			mockCp.getHomeChargerStatus.mockResolvedValueOnce(
				pluggedInStatus({
					chargingStatus: 'NOT_CHARGING' as HomeChargerStatus['chargingStatus'],
					isPluggedIn: true,
				})
			);
			await service.runTick();

			expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ stopReason: StopReason.UNKNOWN }),
				})
			);
			// State should reflect solar conditions, not be stuck on a stale reason
			expect(service.getStatus().state).toBe(SunkeepState.WAITING);
			expect(service.getStatus().waitReason).toBe('Insufficient solar excess');
		});

		it('closes session and resets state when user stops charging via CP app while session is active', async () => {
			// User stops charging manually via the CP app. The charger transitions to
			// NOT_CHARGING while sunkeep still holds an activeSession. reconcileWithCharger
			// should detect this and close the session so tick() can re-evaluate conditions.
			service.enable();
			vi.setSystemTime(NOON);
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));

			// Tick 1: normal session started
			mockCp.getHomeChargerStatus.mockResolvedValueOnce(pluggedInStatus());
			await service.runTick();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);

			// Tick 2: charger confirms CHARGING (session running; chargerConfirmedCurrentSession set)
			mockCp.getHomeChargerStatus.mockResolvedValueOnce(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 12,
				})
			);
			await service.runTick();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);

			// Tick 3: user stopped via app — charger NOT_CHARGING, still plugged in
			// Low excess so tick() re-evaluates to "Insufficient solar excess"
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 1.8, loadKw: 1.5 }));
			mockCp.getHomeChargerStatus.mockResolvedValueOnce(
				pluggedInStatus({
					chargingStatus: 'NOT_CHARGING' as HomeChargerStatus['chargingStatus'],
					isPluggedIn: true,
				})
			);
			await service.runTick();

			// First not-charging poll is debounced — session held, not stopped yet.
			expect(mockSession.stop).not.toHaveBeenCalled();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);

			// Tick 4: still NOT_CHARGING — external stop confirmed, close as UNKNOWN.
			mockCp.getHomeChargerStatus.mockResolvedValueOnce(
				pluggedInStatus({
					chargingStatus: 'NOT_CHARGING' as HomeChargerStatus['chargingStatus'],
					isPluggedIn: true,
				})
			);
			await service.runTick();

			expect(mockSession.stop).toHaveBeenCalled();
			expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ stopReason: StopReason.UNKNOWN }),
				})
			);
			expect(service.getStatus().state).toBe(SunkeepState.WAITING);
			expect(service.getStatus().waitReason).toBe('Insufficient solar excess');
			// Should NOT show a stale solar-window reason
			expect(service.getStatus().waitReason).not.toBe('Outside solar window');
		});

		it('adopts a session started outside Sunkeep (getUserChargingStatus null) and manages amperage without stopping it', async () => {
			// The car was started charging from the ChargePoint app or auto-started on
			// plug-in, so getUserChargingStatus returns null. Sunkeep must adopt the
			// in-progress session (no handle) and adjust amperage from solar — never
			// stop-and-restart it, since app-started sessions are not stoppable via API
			// and that left it stuck on "Charger busy", never adjusting.
			mockCp.getUserChargingStatus.mockResolvedValue(null);
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 15,
				})
			);
			// Tesla load includes the car at 15A (3.6 kW) on top of a 1.0 kW house
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 6.0, loadKw: 4.6 }));

			await service.runTick();

			expect(mockCp.stopChargingSession).not.toHaveBeenCalled();
			expect(mockCp.startChargingSession).not.toHaveBeenCalled();
			expect(mockPrisma.chargingEvent.create).toHaveBeenCalled();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
			// Adopted without an API-visible ChargePoint session handle
			expect(service.getStatus().activeSession).toBeNull();
			// Amperage is still managed via the charger device (excess 6-4.6+3.6 = 5.0 kW → 20 A)
			expect(mockCp.setAmperageLimit).toHaveBeenCalledWith(42, 20);
		});

		it('keeps an externally-started session adopted across ticks without duplicating events or stopping it', async () => {
			// Regression for the "Charger busy / never adjusts" bug: a session started
			// outside Sunkeep (getUserChargingStatus null) is adopted without a handle,
			// then re-evaluated every tick. It must not be stopped, and the follow-up
			// tick must not spawn a second ChargingEvent.
			mockCp.getUserChargingStatus.mockResolvedValue(null);
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 15,
				})
			);
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 6.0, loadKw: 1.0 }));

			await service.runTick();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
			expect(mockCp.setAmperageLimit).toHaveBeenCalled();

			await service.runTick();

			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
			expect(mockPrisma.chargingEvent.create).toHaveBeenCalledTimes(1);
			expect(mockCp.stopChargingSession).not.toHaveBeenCalled();
		});

		it('manualStartSession adopts an orphaned session instead of starting a new one', async () => {
			const startedAt = new Date('2026-05-23T10:00:00Z');
			mockPrisma.chargingEvent.findMany.mockResolvedValueOnce([
				{
					id: 'event-orphan',
					startedAt,
					startAmps: 24,
					peakSolarKw: 8.0,
				},
			]);
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

	// --- Force charging ---

	describe('force charging', () => {
		it('stops an auto-started session below threshold without creating a junk event', async () => {
			// ChargePoint auto-starts charging on plug-in while the Powerwall is below the
			// start threshold. Sunkeep must stop the charger WITHOUT adopting it or writing
			// a ChargingEvent — adopting then immediately stopping spammed a row per tick.
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 16,
				})
			);
			mockPw.getData.mockResolvedValue(goodPwData({ batteryPct: 75 }));

			await service.runTick();

			expect(mockCp.stopChargingSession).toHaveBeenCalledWith(42);
			expect(mockPrisma.chargingEvent.create).not.toHaveBeenCalled();
			expect(mockPrisma.chargingEvent.update).not.toHaveBeenCalled();
			expect(service.getStatus().state).toBe(SunkeepState.WAITING);
			expect(service.getStatus().waitReason).toBe('Battery below threshold');
			expect(service.getStatus().forced).toBe(false);
		});

		it('does not create events across repeated ticks while the car auto-charges below threshold', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 24,
				})
			);
			mockPw.getData.mockResolvedValue(goodPwData({ batteryPct: 79 })); // below floor 80 (95 - 15 hysteresis)

			await service.runTick();
			await service.runTick();
			await service.runTick();

			expect(mockPrisma.chargingEvent.create).not.toHaveBeenCalled();
			expect(service.getStatus().state).toBe(SunkeepState.WAITING);
			expect(service.getStatus().waitReason).toBe('Battery below threshold');
		});

		it('stops an externally-started session outside the solar window without an event', async () => {
			service.enable();
			vi.setSystemTime(NIGHT);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 24,
				})
			);
			mockPw.getData.mockResolvedValue(goodPwData());

			await service.runTick();

			expect(mockCp.stopChargingSession).toHaveBeenCalledWith(42);
			expect(mockPrisma.chargingEvent.create).not.toHaveBeenCalled();
			expect(service.getStatus().state).toBe(SunkeepState.WAITING);
			expect(service.getStatus().waitReason).toBe('Outside solar window');
		});

		it('clamps to minimum amps in the reject path when the session id cannot be resolved', async () => {
			// A policy-rejected external session whose id node-chargepoint cannot resolve over
			// REST (UnresolvedSessionError) must not throw: sunkeep still reaches WAITING and
			// clamps to MIN_AMPS as the remaining mitigation.
			service.enable();
			vi.setSystemTime(NIGHT); // outside solar window → reject without adopting
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 24,
				})
			);
			mockPw.getData.mockResolvedValue(goodPwData());
			const { UnresolvedSessionError } = await import('node-chargepoint');
			mockCp.stopChargingSession.mockRejectedValueOnce(new UnresolvedSessionError(42));

			await service.runTick();

			expect(mockCp.stopChargingSession).toHaveBeenCalledWith(42);
			expect(mockCp.setAmperageLimit).toHaveBeenCalledWith(42, 8);
			expect(mockPrisma.chargingEvent.create).not.toHaveBeenCalled();
			expect(service.getStatus().state).toBe(SunkeepState.WAITING);
			expect(service.getStatus().waitReason).toBe('Outside solar window');
		});

		it('manualStartSession marks the session forced and exempts it from the battery threshold', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));

			await service.manualStartSession();

			expect(service.getStatus().forced).toBe(true);
			expect(mockPrisma.chargingEvent.create).toHaveBeenCalledWith(
				expect.objectContaining({ data: expect.objectContaining({ forced: true }) })
			);

			// Powerwall drops well below threshold — a forced session must NOT stop.
			mockSession.stop.mockClear();
			mockPw.getData.mockResolvedValue(goodPwData({ batteryPct: 50 }));
			await service.runTick();

			expect(mockSession.stop).not.toHaveBeenCalled();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
			expect(service.getStatus().forced).toBe(true);
		});

		it('keeps a forced session charging outside the solar window', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
			mockPw.getData.mockResolvedValue(goodPwData());
			await service.manualStartSession();
			expect(service.getStatus().forced).toBe(true);

			vi.setSystemTime(NIGHT);
			mockSession.stop.mockClear();
			await service.runTick();

			expect(mockSession.stop).not.toHaveBeenCalled();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
		});

		it('Force Start on an already auto-charging session adopts it and marks it forced', async () => {
			mockCp.getUserChargingStatus.mockResolvedValueOnce({ sessionId: 7777 });
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 16,
				})
			);
			mockPw.getData.mockResolvedValue(goodPwData({ batteryPct: 60 }));

			await service.manualStartSession();

			expect(mockCp.startChargingSession).not.toHaveBeenCalled();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
			expect(service.getStatus().forced).toBe(true);
			// The forced flag is persisted onto the adopted event row.
			expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
				expect.objectContaining({ data: { forced: true } })
			);

			// The next tick (still below threshold) must not stop it.
			mockSession.stop.mockClear();
			await service.runTick();
			expect(mockSession.stop).not.toHaveBeenCalled();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
		});

		it('clears the forced flag when the session stops', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
			mockPw.getData.mockResolvedValue(goodPwData());
			await service.manualStartSession();
			expect(service.getStatus().forced).toBe(true);

			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus({ isPluggedIn: false }));
			await service.runTick();

			expect(service.getStatus().state).toBe(SunkeepState.IDLE);
			expect(service.getStatus().forced).toBe(false);
		});

		it('restores the forced flag when adopting a forced session after a restart', async () => {
			const startedAt = new Date('2026-05-23T10:00:00Z');
			const forcedEvent = {
				id: 'event-forced',
				startedAt,
				startAmps: 16,
				peakSolarKw: 8.0,
				forced: true,
			};
			// findMany is read twice: once by hasReusableChargingEvent (to defer to
			// reconcile) and once by finalizeAdoption (to reuse the row).
			mockPrisma.chargingEvent.findMany
				.mockResolvedValueOnce([forcedEvent])
				.mockResolvedValueOnce([forcedEvent]);
			mockCp.getUserChargingStatus.mockResolvedValueOnce({ sessionId: 7777 });

			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 16,
				})
			);
			// Below threshold: a non-forced adoption would stop, but the restored
			// forced flag must keep it charging.
			mockPw.getData.mockResolvedValue(goodPwData({ batteryPct: 70 }));

			await service.runTick();

			expect(mockSession.stop).not.toHaveBeenCalled();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
			expect(service.getStatus().forced).toBe(true);
		});
	});

	// --- Transient-error resilience ---

	describe('transient error resilience', () => {
		it('keeps the session charging when a tick fails with a transient Tesla error', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
			mockPw.getData.mockResolvedValue(goodPwData());
			await service.runTick();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);

			// Tesla live_status fails transiently on the next tick — must not tear down.
			mockPw.getData.mockRejectedValueOnce(new Error('Tesla live_status failed: 503 — timeout'));
			await service.runTick();

			expect(mockSession.stop).not.toHaveBeenCalled();
			expect(mockPrisma.chargingEvent.update).not.toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ stopReason: StopReason.ERROR }),
				})
			);
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);

			// Recovers and resumes management on the next successful tick.
			mockPw.getData.mockResolvedValue(goodPwData());
			await service.runTick();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
		});
	});

	// --- Battery threshold hysteresis ---

	describe('battery threshold hysteresis', () => {
		it('keeps charging when battery dips below the start threshold but stays within the band', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
			mockPw.getData.mockResolvedValue(goodPwData());
			await service.runTick(); // start CHARGING (battery 99)

			// threshold 95, default hysteresis 15 → floor 80. 93 is below start but above floor.
			mockPw.getData.mockResolvedValue(goodPwData({ batteryPct: 93 }));
			await service.runTick();

			expect(mockSession.stop).not.toHaveBeenCalled();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
		});

		it('stops charging once battery falls below the hysteresis floor', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
			mockPw.getData.mockResolvedValue(goodPwData());
			await service.runTick(); // start CHARGING

			mockPw.getData.mockResolvedValue(goodPwData({ batteryPct: 79 })); // below floor 80 (95 - 15 hysteresis)
			await service.runTick();

			expect(mockSession.stop).toHaveBeenCalled();
			expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ stopReason: StopReason.BATTERY_DEPLETED }),
				})
			);
			expect(service.getStatus().state).toBe(SunkeepState.WAITING);
		});

		it('does not start a fresh session until battery reaches the full threshold', async () => {
			// Not charging + battery at 93 (within the band but below start) must not start.
			service.enable();
			vi.setSystemTime(NOON);
			mockCp.getHomeChargerStatus.mockResolvedValue(pluggedInStatus());
			mockPw.getData.mockResolvedValue(goodPwData({ batteryPct: 93 }));
			await service.runTick();

			expect(mockCp.startChargingSession).not.toHaveBeenCalled();
			expect(service.getStatus().state).toBe(SunkeepState.WAITING);
			expect(service.getStatus().waitReason).toBe('Battery below threshold');
		});
	});

	// --- External-stop debounce ---

	describe('external-stop debounce', () => {
		it('does not close a session on a single transient NOT_CHARGING poll, then resumes when CHARGING returns', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));

			// Start and confirm a session.
			mockCp.getHomeChargerStatus.mockResolvedValueOnce(pluggedInStatus());
			await service.runTick();
			mockCp.getHomeChargerStatus.mockResolvedValueOnce(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 12,
				})
			);
			await service.runTick();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);

			// Transient NOT_CHARGING blip (e.g. right after an amp change) — held, not closed.
			mockCp.getHomeChargerStatus.mockResolvedValueOnce(
				pluggedInStatus({ chargingStatus: 'NOT_CHARGING' as HomeChargerStatus['chargingStatus'] })
			);
			await service.runTick();
			expect(mockSession.stop).not.toHaveBeenCalled();
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);

			// Charger reports CHARGING again — streak resets, no event was ever closed.
			mockCp.getHomeChargerStatus.mockResolvedValueOnce(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 12,
				})
			);
			await service.runTick();
			expect(mockSession.stop).not.toHaveBeenCalled();
			expect(mockPrisma.chargingEvent.update).not.toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ stopReason: StopReason.UNKNOWN }),
				})
			);
			expect(service.getStatus().state).toBe(SunkeepState.CHARGING);
		});

		it('closes the session after two consecutive NOT_CHARGING polls', async () => {
			service.enable();
			vi.setSystemTime(NOON);
			mockPw.getData.mockResolvedValue(goodPwData({ solarKw: 4.0, loadKw: 1.0 }));

			mockCp.getHomeChargerStatus.mockResolvedValueOnce(pluggedInStatus());
			await service.runTick();
			mockCp.getHomeChargerStatus.mockResolvedValueOnce(
				pluggedInStatus({
					chargingStatus: 'CHARGING' as HomeChargerStatus['chargingStatus'],
					amperageLimit: 12,
				})
			);
			await service.runTick();

			mockCp.getHomeChargerStatus.mockResolvedValue(
				pluggedInStatus({ chargingStatus: 'NOT_CHARGING' as HomeChargerStatus['chargingStatus'] })
			);
			await service.runTick(); // held
			expect(mockSession.stop).not.toHaveBeenCalled();
			await service.runTick(); // confirmed → closed

			expect(mockSession.stop).toHaveBeenCalled();
			expect(mockPrisma.chargingEvent.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ stopReason: StopReason.UNKNOWN }),
				})
			);
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
