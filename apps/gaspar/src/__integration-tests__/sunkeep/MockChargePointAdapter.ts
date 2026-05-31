import type {
	ChargingSession,
	HomeChargerConfiguration,
	HomeChargerStatus,
	UserChargingStatus,
} from 'node-chargepoint';
import type { IChargePointClient } from '../../sunkeep/sunkeep.types.js';

interface MockChargerState {
	isPluggedIn: boolean;
	chargingStatus: HomeChargerStatus['chargingStatus'];
	amperageLimit: number;
	activeSessionId: number | null;
	nextSessionId: number;
}

export class MockChargePointAdapter implements IChargePointClient {
	private state: MockChargerState = {
		isPluggedIn: false,
		chargingStatus: 'NOT_CHARGING',
		amperageLimit: 16,
		activeSessionId: null,
		nextSessionId: 100,
	};

	plugIn(): void {
		this.state.isPluggedIn = true;
	}

	unplug(): void {
		this.state.isPluggedIn = false;
		this.state.chargingStatus = 'NOT_CHARGING';
		this.state.activeSessionId = null;
	}

	setDone(): void {
		this.state.chargingStatus = 'DONE';
		this.state.activeSessionId = null;
	}

	setAlreadyCharging(amps: number): void {
		this.state.isPluggedIn = true;
		this.state.chargingStatus = 'CHARGING';
		this.state.amperageLimit = amps;
		this.state.activeSessionId = ++this.state.nextSessionId;
	}

	/** Simulate ChargePoint auto-starting on plug-in (no API session — getUserChargingStatus returns null). */
	setAutoStarted(amps: number): void {
		this.state.isPluggedIn = true;
		this.state.chargingStatus = 'CHARGING';
		this.state.amperageLimit = amps;
		// activeSessionId intentionally left null so getUserChargingStatus returns null
	}

	async getHomeChargerStatus(chargerId: number): Promise<HomeChargerStatus> {
		return {
			chargerId,
			brand: 'ChargePoint',
			model: 'CPH50',
			macAddress: '00:00:00:00:00:00',
			chargingStatus: this.state.chargingStatus,
			isPluggedIn: this.state.isPluggedIn,
			isConnected: true,
			isReminderEnabled: false,
			plugInReminderTime: '',
			amperageLimit: this.state.amperageLimit,
			possibleAmperageLimits: [8, 16, 24, 32],
			hasUtilityInfo: false,
			isDuringScheduledTime: false,
		};
	}

	async setAmperageLimit(_chargerId: number, amps: number): Promise<void> {
		this.state.amperageLimit = amps;
	}

	async startChargingSession(_deviceId: number): Promise<ChargingSession> {
		const sessionId = ++this.state.nextSessionId;
		this.state.activeSessionId = sessionId;
		this.state.chargingStatus = 'CHARGING';
		return {
			sessionId,
			energyKwh: 5.0,
			stop: async () => {
				this.state.chargingStatus = 'NOT_CHARGING';
				this.state.activeSessionId = null;
			},
		} as unknown as ChargingSession;
	}

	async stopChargingSession(_deviceId: number): Promise<void> {
		this.state.chargingStatus = 'NOT_CHARGING';
		this.state.activeSessionId = null;
	}

	async getHomeChargerTechnicalInfo(
		_chargerId: number
	): Promise<{ softwareVersion: string; deviceIp: string }> {
		return { softwareVersion: '1.0.0', deviceIp: '192.168.1.50' };
	}

	async getHomeChargerConfig(_chargerId: number): Promise<HomeChargerConfiguration> {
		return {
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
	}

	async getUserChargingStatus(): Promise<UserChargingStatus | null> {
		if (this.state.activeSessionId === null) return null;
		return { sessionId: this.state.activeSessionId } as unknown as UserChargingStatus;
	}

	async getChargingSession(sessionId: number): Promise<ChargingSession> {
		return {
			sessionId,
			energyKwh: 5.0,
			stop: async () => {
				this.state.chargingStatus = 'NOT_CHARGING';
				this.state.activeSessionId = null;
			},
		} as unknown as ChargingSession;
	}
}
