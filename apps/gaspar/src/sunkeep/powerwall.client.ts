import https from 'node:https';
import type { PowerwallData } from './sunkeep.types.js';

interface SoeResponse {
	percentage: number;
}

interface AggregatesResponse {
	solar: { instant_power: number };
	load: { instant_power: number };
}

export class PowerwallClient {
	private token: string | null = null;

	constructor(
		private readonly host: string,
		private readonly email: string,
		private readonly password: string
	) {}

	async getData(): Promise<PowerwallData> {
		if (!this.token) await this.login();

		const [soe, aggregates] = await Promise.all([
			this.get<SoeResponse>('/api/system_status/soe'),
			this.get<AggregatesResponse>('/api/meters/aggregates'),
		]);

		return {
			batteryPct: soe.percentage,
			solarKw: aggregates.solar.instant_power / 1000,
			loadKw: aggregates.load.instant_power / 1000,
		};
	}

	private async login(): Promise<void> {
		const data = await this.request<{ token: string }>('POST', '/api/login/Basic', {
			username: 'customer',
			password: this.password,
			email: this.email,
			force_sm_off: false,
		});
		this.token = data.token;
	}

	private get<T>(path: string): Promise<T> {
		return this.request<T>('GET', path);
	}

	private request<T>(method: string, path: string, body?: unknown): Promise<T> {
		return new Promise((resolve, reject) => {
			const bodyStr = body ? JSON.stringify(body) : undefined;

			const options: https.RequestOptions = {
				hostname: this.host,
				path,
				method,
				rejectUnauthorized: false,
				headers: {
					'Content-Type': 'application/json',
					...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
					...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
				},
			};

			const req = https.request(options, (res) => {
				let raw = '';
				res.on('data', (chunk: string) => (raw += chunk));
				res.on('end', () => {
					try {
						resolve(JSON.parse(raw) as T);
					} catch {
						reject(new Error(`Powerwall: failed to parse response from ${path}: ${raw}`));
					}
				});
			});

			req.on('error', reject);
			if (bodyStr) req.write(bodyStr);
			req.end();
		});
	}
}
