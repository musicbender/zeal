import type {
	IPowerwallAdapter,
	PowerwallData,
	TeslaSiteInfo,
} from '../../sunkeep/sunkeep.types.js';

interface MockPowerwallState {
	batteryPct: number;
	solarKw: number;
	loadKw: number;
	batteryKw: number | null;
	gridKw: number | null;
	gridStatus: string | null;
}

export class MockPowerwallAdapter implements IPowerwallAdapter {
	private state: MockPowerwallState = {
		batteryPct: 99,
		solarKw: 0,
		loadKw: 1.0,
		batteryKw: null,
		gridKw: null,
		gridStatus: null,
	};

	setSolar(solarKw: number, loadKw: number): void {
		this.state.solarKw = solarKw;
		this.state.loadKw = loadKw;
	}

	setBatteryPct(pct: number): void {
		this.state.batteryPct = pct;
	}

	setNoSolar(): void {
		this.state.solarKw = 0;
	}

	// batteryPct=99, solarKw=4.0, loadKw=1.0
	// excessKw (idle) = 4.0 - 1.0 = 3.0kW → 12A
	setSufficientSolar(): void {
		this.state.batteryPct = 99;
		this.state.solarKw = 4.0;
		this.state.loadKw = 1.0;
	}

	async getData(): Promise<PowerwallData> {
		return {
			batteryPct: this.state.batteryPct,
			solarKw: this.state.solarKw,
			loadKw: this.state.loadKw,
			batteryKw: this.state.batteryKw,
			gridKw: this.state.gridKw,
			gridStatus: this.state.gridStatus,
		};
	}

	async getSiteInfo(): Promise<TeslaSiteInfo> {
		return {
			siteName: 'Test Site',
			batteryCapacityKwh: 27,
			backupReservePct: 20,
			model: 'Powerwall 3',
			firmwareVersion: '26.10.3',
			batteryCount: 2,
			stormModeEnabled: false,
		};
	}

	updateRefreshToken(_token: string): void {
		// no-op for tests
	}
}
