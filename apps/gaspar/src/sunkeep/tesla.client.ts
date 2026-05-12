import type { IPowerwallAdapter, PowerwallData } from './sunkeep.types.js';

interface TeslaClientConfig {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
	energySiteId: string;
}

interface TokenResponse {
	access_token: string;
	expires_in: number;
}

interface LiveStatusResponse {
	response: {
		battery_percentage: number;
		solar_power: number;
		load_power: number;
	};
}

const AUTH_BASE = 'https://auth.tesla.com';
const FLEET_BASE = 'https://fleet-api.prd.na.vn.cloud.tesla.com';

export class TeslaEnergyClient implements IPowerwallAdapter {
	private accessToken: string | null = null;
	private tokenExpiresAt = 0;

	constructor(private readonly config: TeslaClientConfig) {}

	async getData(): Promise<PowerwallData> {
		await this.refreshIfNeeded();

		const res = await fetch(
			`${FLEET_BASE}/api/1/energy_sites/${this.config.energySiteId}/live_status`,
			{ headers: { Authorization: `Bearer ${this.accessToken}` } }
		);

		if (!res.ok) throw new Error(`Tesla live_status failed: ${res.status}`);

		const body = (await res.json()) as LiveStatusResponse;
		const { battery_percentage, solar_power, load_power } = body.response;

		return {
			batteryPct: battery_percentage,
			solarKw: solar_power / 1000,
			loadKw: load_power / 1000,
		};
	}

	private async refreshIfNeeded(): Promise<void> {
		if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) return;

		const res = await fetch(`${AUTH_BASE}/oauth2/v3/token`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				client_id: this.config.clientId,
				client_secret: this.config.clientSecret,
				refresh_token: this.config.refreshToken,
			}),
		});

		if (!res.ok) throw new Error(`Tesla token refresh failed: ${res.status}`);

		const { access_token, expires_in } = (await res.json()) as TokenResponse;
		this.accessToken = access_token;
		this.tokenExpiresAt = Date.now() + expires_in * 1000;
	}
}
