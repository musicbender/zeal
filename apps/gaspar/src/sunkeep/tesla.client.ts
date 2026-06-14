import { initLogger } from '@repo/logger/server';
import type { IPowerwallAdapter, PowerwallData, TeslaSiteInfo } from './sunkeep.types.js';

const log = initLogger('tesla.client');

export class TeslaAuthError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TeslaAuthError';
	}
}

interface TeslaClientConfig {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
	energySiteId: string;
	onTokenRotated?: (newRefreshToken: string) => Promise<void>;
}

interface TokenResponse {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
}

interface SiteInfoResponse {
	response: {
		site_name?: string;
		backup_reserve_percent?: number;
		version?: string;
		battery_count?: number;
		user_settings?: { storm_mode_enabled?: boolean };
		components?: {
			gateways?: Array<{
				part_name?: string;
				nameplate_energy_watts?: number;
			}>;
		};
	};
}

interface LiveStatusResponse {
	response: {
		percentage_charged: number;
		solar_power: number;
		load_power: number;
		battery_power?: number;
		grid_power?: number;
		grid_status?: string;
		timestamp?: string;
	};
}

const AUTH_BASE = 'https://auth.tesla.com';
const FLEET_BASE = 'https://fleet-api.prd.na.vn.cloud.tesla.com';
// Serve a recent successful live_status read instead of re-hitting Tesla. The scheduler
// ticks every 10 minutes, so this never stales a scheduled poll; it only collapses bursts
// of manual /sunkeep/poll calls into one upstream request, which avoids Tesla 429s.
const LIVE_STATUS_TTL_MS = 30_000;

export class TeslaEnergyClient implements IPowerwallAdapter {
	private accessToken: string | null = null;
	private tokenExpiresAt = 0;
	private fatalError: TeslaAuthError | null = null;
	private refreshPromise: Promise<void> | null = null;
	private liveStatusCache: { data: PowerwallData; at: number } | null = null;

	constructor(private readonly config: TeslaClientConfig) {}

	async getData(): Promise<PowerwallData> {
		const cached = this.liveStatusCache;
		if (cached && Date.now() - cached.at < LIVE_STATUS_TTL_MS) {
			return cached.data;
		}

		await this.refreshIfNeeded();

		const res = await fetch(
			`${FLEET_BASE}/api/1/energy_sites/${this.config.energySiteId}/live_status`,
			{ headers: { Authorization: `Bearer ${this.accessToken}` } }
		);

		if (!res.ok) {
			const body = await res.text().catch(() => '');
			throw new Error(`Tesla live_status failed: ${res.status} — ${body}`);
		}

		const body = (await res.json()) as LiveStatusResponse;
		const {
			percentage_charged,
			solar_power,
			load_power,
			battery_power,
			grid_power,
			grid_status,
			timestamp,
		} = body.response;

		if (percentage_charged === undefined || solar_power === undefined || load_power === undefined) {
			throw new Error(`Tesla live_status unexpected shape: ${JSON.stringify(body)}`);
		}

		const data: PowerwallData = {
			batteryPct: percentage_charged,
			solarKw: solar_power / 1000,
			loadKw: load_power / 1000,
			batteryKw: battery_power != null ? battery_power / 1000 : null,
			gridKw: grid_power != null ? grid_power / 1000 : null,
			gridStatus: grid_status ?? null,
			lastTeslaAt: timestamp ?? null,
		};
		// Cache only successful reads; failures fall through so callers see the error and
		// the next call retries the upstream.
		this.liveStatusCache = { data, at: Date.now() };
		return data;
	}

	async getSiteInfo(): Promise<TeslaSiteInfo> {
		await this.refreshIfNeeded();

		const res = await fetch(
			`${FLEET_BASE}/api/1/energy_sites/${this.config.energySiteId}/site_info`,
			{ headers: { Authorization: `Bearer ${this.accessToken}` } }
		);

		if (!res.ok) {
			const body = await res.text().catch(() => '');
			throw new Error(`Tesla site_info failed: ${res.status} — ${body}`);
		}

		const body = (await res.json()) as SiteInfoResponse;
		const r = body.response;
		const gateway = r.components?.gateways?.[0];

		return {
			siteName: r.site_name ?? null,
			batteryCapacityKwh:
				gateway?.nameplate_energy_watts != null ? gateway.nameplate_energy_watts / 1000 : null,
			backupReservePct: r.backup_reserve_percent ?? null,
			model: gateway?.part_name ?? null,
			firmwareVersion: r.version ? r.version.split(' ')[0]! : null,
			batteryCount: r.battery_count ?? null,
			stormModeEnabled: r.user_settings?.storm_mode_enabled ?? null,
		};
	}

	private refreshIfNeeded(): Promise<void> {
		if (this.fatalError) throw this.fatalError;
		if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) return Promise.resolve();
		// Deduplicate concurrent refresh calls — only one token exchange in flight at a time.
		if (!this.refreshPromise) {
			this.refreshPromise = this.doRefresh().finally(() => {
				this.refreshPromise = null;
			});
		}
		return this.refreshPromise;
	}

	private async doRefresh(): Promise<void> {
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

		if (!res.ok) {
			const text = await res.text().catch(() => '');
			let errorCode: string | undefined;
			try {
				errorCode = (JSON.parse(text) as { error?: string }).error;
			} catch {}
			if (errorCode === 'login_required') {
				this.fatalError = new TeslaAuthError(
					'Tesla refresh token is invalid — update TESLA_REFRESH_TOKEN and restart'
				);
				throw this.fatalError;
			}
			throw new Error(`Tesla token refresh failed: ${res.status} — ${text}`);
		}

		const { access_token, refresh_token, expires_in } = (await res.json()) as TokenResponse;
		this.accessToken = access_token;
		this.tokenExpiresAt = Date.now() + expires_in * 1000;

		if (refresh_token && refresh_token !== this.config.refreshToken) {
			this.config.refreshToken = refresh_token;
			log.info('Tesla access token refreshed — persisting rotated refresh token');
			try {
				await this.config.onTokenRotated?.(refresh_token);
				log.info('Rotated refresh token persisted to DB');
			} catch (err) {
				log.error(
					{ err },
					'Rotated refresh token saved in memory but failed to persist to DB — manual token update will be needed after restart'
				);
			}
		} else {
			log.info('Tesla access token refreshed');
		}
	}

	updateRefreshToken(token: string): void {
		this.config.refreshToken = token;
		this.fatalError = null;
	}
}
