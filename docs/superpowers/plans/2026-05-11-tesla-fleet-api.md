# Tesla Fleet API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local `PowerwallClient` with a `TeslaEnergyClient` that fetches Powerwall data from the Tesla Fleet API, since the Powerwall 3 is not reachable on the local network.

**Architecture:** `TeslaEnergyClient` implements the same `getData() → PowerwallData` interface so `SunkeepService` and all routes are untouched. A one-time OAuth callback route in `apps/portfolio` captures the refresh token. All Tesla credentials live in `.env` on the Pi.

**Tech Stack:** Tesla Fleet API (REST), OAuth 2.0 auth code + refresh token, Node.js built-in `fetch`, Next.js 16 App Router route handlers (Vercel), Vitest.

---

### Task 1: Create TeslaEnergyClient with unit tests

**Files:**

- Delete: `apps/gaspar/src/sunkeep/powerwall.client.ts`
- Delete: `apps/gaspar/src/sunkeep/powerwall.client.spec.ts`
- Create: `apps/gaspar/src/sunkeep/tesla.client.ts`
- Create: `apps/gaspar/src/sunkeep/tesla.client.spec.ts`

**Context:** `PowerwallData` is defined in `apps/gaspar/src/sunkeep/sunkeep.types.ts` as `{ batteryPct: number; solarKw: number; loadKw: number }`. The new client must return that exact shape. Use Node's built-in `fetch` (Node 24 has it globally). Mock fetch via `vi.spyOn(global, 'fetch')`.

- [ ] **Step 1: Write the failing test file**

Create `apps/gaspar/src/sunkeep/tesla.client.spec.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeslaEnergyClient } from './tesla.client.js';

const mockConfig = {
	clientId: 'client-id',
	clientSecret: 'client-secret',
	refreshToken: 'refresh-token',
	energySiteId: '12345',
};

const TOKEN_RESPONSE = { access_token: 'access-tok', expires_in: 28800 };
const LIVE_STATUS_RESPONSE = {
	response: { battery_percentage: 95.5, solar_power: 3200, load_power: 1800 },
};

function mockFetch(responses: { ok: boolean; body: unknown }[]) {
	let i = 0;
	vi.spyOn(global, 'fetch').mockImplementation(async () => {
		const r = responses[i++]!;
		return {
			ok: r.ok,
			status: r.ok ? 200 : 500,
			json: async () => r.body,
			text: async () => String(r.body),
		} as Response;
	});
}

describe('TeslaEnergyClient', () => {
	let client: TeslaEnergyClient;

	beforeEach(() => {
		vi.clearAllMocks();
		client = new TeslaEnergyClient(mockConfig);
	});

	it('fetches data and caches access token', async () => {
		mockFetch([
			{ ok: true, body: TOKEN_RESPONSE },
			{ ok: true, body: LIVE_STATUS_RESPONSE },
		]);

		const data = await client.getData();

		expect(data.batteryPct).toBe(95.5);
		expect(data.solarKw).toBeCloseTo(3.2);
		expect(data.loadKw).toBeCloseTo(1.8);
		expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
	});

	it('skips token refresh when cached token is fresh', async () => {
		mockFetch([
			{ ok: true, body: TOKEN_RESPONSE },
			{ ok: true, body: LIVE_STATUS_RESPONSE },
			{ ok: true, body: LIVE_STATUS_RESPONSE },
		]);

		await client.getData();
		await client.getData();

		// token fetched once, live_status fetched twice = 3 total
		expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
	});

	it('refreshes token when expired', async () => {
		mockFetch([
			{ ok: true, body: TOKEN_RESPONSE },
			{ ok: true, body: LIVE_STATUS_RESPONSE },
			{ ok: true, body: TOKEN_RESPONSE },
			{ ok: true, body: LIVE_STATUS_RESPONSE },
		]);

		await client.getData();
		// Force expiry
		(client as unknown as { tokenExpiresAt: number }).tokenExpiresAt = Date.now() - 1;
		await client.getData();

		const calls = vi.mocked(fetch).mock.calls;
		const tokenCalls = calls.filter(([url]) => String(url).includes('oauth2'));
		expect(tokenCalls).toHaveLength(2);
	});
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter gaspar test tesla.client
```

Expected: FAIL — `Cannot find module './tesla.client.js'`

- [ ] **Step 3: Write the implementation**

Create `apps/gaspar/src/sunkeep/tesla.client.ts`:

```typescript
import type { PowerwallData } from './sunkeep.types.js';

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

export class TeslaEnergyClient {
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter gaspar test tesla.client
```

Expected: PASS — 3 tests passed

- [ ] **Step 5: Delete the old Powerwall files**

```bash
rm apps/gaspar/src/sunkeep/powerwall.client.ts
rm apps/gaspar/src/sunkeep/powerwall.client.spec.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/gaspar/src/sunkeep/tesla.client.ts apps/gaspar/src/sunkeep/tesla.client.spec.ts
git rm apps/gaspar/src/sunkeep/powerwall.client.ts apps/gaspar/src/sunkeep/powerwall.client.spec.ts
git commit -m "feat(gaspar): add TeslaEnergyClient, remove PowerwallClient"
```

---

### Task 2: Update types, service, config, and plugin

**Files:**

- Modify: `apps/gaspar/src/sunkeep/sunkeep.types.ts`
- Modify: `apps/gaspar/src/sunkeep/sunkeep.service.ts` (line 3 and 77)
- Modify: `apps/gaspar/src/sunkeep/sunkeep.service.spec.ts` (testConfig object)
- Modify: `apps/gaspar/src/sunkeep/sunkeep.config.ts`
- Modify: `apps/gaspar/src/sunkeep/sunkeep.plugin.ts`

**Context:** `SunkeepService` currently types its powerwall parameter as `PowerwallClient`. We add an `IPowerwallAdapter` interface to `sunkeep.types.ts` (matching `TeslaEnergyClient`'s shape) and update the service to use it. The mock object in `sunkeep.service.spec.ts` is already `{ getData: vi.fn() }` — only the `testConfig` object needs updating.

- [ ] **Step 1: Add `IPowerwallAdapter` to sunkeep.types.ts and remove Powerwall config fields**

In `apps/gaspar/src/sunkeep/sunkeep.types.ts`, add the interface and update `SunkeepConfig`. The full updated file:

```typescript
export enum SunkeepState {
	DISABLED = 'DISABLED',
	IDLE = 'IDLE',
	WAITING = 'WAITING',
	CHARGING = 'CHARGING',
	ERROR = 'ERROR',
}

export enum StopReason {
	SOLAR_DROPPED = 'solar_dropped',
	NIGHT_SAFETY = 'night_safety',
	BATTERY_DEPLETED = 'battery_depleted',
	UNPLUGGED = 'unplugged',
	MANUAL = 'manual',
	ERROR = 'error',
}

export interface PowerwallData {
	batteryPct: number;
	solarKw: number;
	loadKw: number;
}

export interface IPowerwallAdapter {
	getData(): Promise<PowerwallData>;
}

export interface SunkeepConfig {
	chargePointUsername: string;
	chargePointPassword: string;
	chargePointDeviceId: number;
	teslaClientId: string;
	teslaClientSecret: string;
	teslaRefreshToken: string;
	teslaEnergySiteId: string;
	solarWindowStart: string;
	solarWindowEnd: string;
	sunkeepEnabled: boolean;
	powerwallSoeThreshold: number;
}

export interface ActiveSessionSummary {
	sessionId: number;
	currentAmps: number;
	startedAt: string | null;
}

export interface SunkeepStatus {
	state: SunkeepState;
	enabled: boolean;
	lastPollAt: string | null;
	activeSession: ActiveSessionSummary | null;
	solarKw: number | null;
	excessKw: number | null;
	batteryPct: number | null;
}
```

- [ ] **Step 2: Update sunkeep.service.ts to use IPowerwallAdapter**

In `apps/gaspar/src/sunkeep/sunkeep.service.ts`, make two edits:

**Edit 1** — remove the `PowerwallClient` import (line 3) and add `IPowerwallAdapter` to the existing types import block.

Old:

```typescript
import type { PowerwallClient } from './powerwall.client.js';
import type {
	ActiveSessionSummary,
	PowerwallData,
	SunkeepConfig,
	SunkeepStatus,
} from './sunkeep.types.js';
```

New:

```typescript
import type {
	ActiveSessionSummary,
	IPowerwallAdapter,
	PowerwallData,
	SunkeepConfig,
	SunkeepStatus,
} from './sunkeep.types.js';
```

**Edit 2** — update the constructor parameter type:

Old:

```typescript
    private readonly powerwall: PowerwallClient,
```

New:

```typescript
    private readonly powerwall: IPowerwallAdapter,
```

- [ ] **Step 3: Update sunkeep.config.ts**

Replace the full contents of `apps/gaspar/src/sunkeep/sunkeep.config.ts`:

```typescript
import type { SunkeepConfig } from './sunkeep.types.js';

export function readSunkeepConfig(): SunkeepConfig {
	const required = (key: string): string => {
		const val = process.env[key];
		if (!val) throw new Error(`Missing required env var: ${key}`);
		return val;
	};

	return {
		chargePointUsername: required('CHARGEPOINT_USERNAME'),
		chargePointPassword: required('CHARGEPOINT_PASSWORD'),
		chargePointDeviceId: Number(required('CHARGEPOINT_DEVICE_ID')),
		teslaClientId: required('TESLA_CLIENT_ID'),
		teslaClientSecret: required('TESLA_CLIENT_SECRET'),
		teslaRefreshToken: required('TESLA_REFRESH_TOKEN'),
		teslaEnergySiteId: required('TESLA_ENERGY_SITE_ID'),
		solarWindowStart: process.env.SOLAR_WINDOW_START ?? '06:00',
		solarWindowEnd: process.env.SOLAR_WINDOW_END ?? '20:00',
		sunkeepEnabled: process.env.SUNKEEP_ENABLED !== 'false',
		powerwallSoeThreshold: Number(process.env.POWERWALL_SOE_THRESHOLD ?? '95'),
	};
}
```

- [ ] **Step 4: Update sunkeep.plugin.ts**

Replace the full contents of `apps/gaspar/src/sunkeep/sunkeep.plugin.ts`:

```typescript
import { initLogger } from '@repo/logger/server';
import type { FastifyInstance } from 'fastify';
import { ChargePoint } from 'node-chargepoint';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TeslaEnergyClient } from './tesla.client.js';
import { readSunkeepConfig } from './sunkeep.config.js';
import { registerSunkeepRoutes } from './sunkeep.routes.js';
import { SunkeepScheduler } from './sunkeep.scheduler.js';
import { SunkeepService } from './sunkeep.service.js';
import { SunkeepState } from './sunkeep.types.js';

const log = initLogger('sunkeep.plugin');

export async function registerSunkeepPlugin(
	server: FastifyInstance,
	prismaService: PrismaService
): Promise<void> {
	const config = readSunkeepConfig();

	const chargePoint = await ChargePoint.create(config.chargePointUsername);
	await chargePoint.loginWithPassword(config.chargePointPassword);
	log.info('ChargePoint authenticated');

	const tesla = new TeslaEnergyClient({
		clientId: config.teslaClientId,
		clientSecret: config.teslaClientSecret,
		refreshToken: config.teslaRefreshToken,
		energySiteId: config.teslaEnergySiteId,
	});

	const service = new SunkeepService(chargePoint, tesla, prismaService, config);
	const scheduler = new SunkeepScheduler(service);

	if (config.sunkeepEnabled) {
		service.enable();
	}

	server.addHook('onReady', async () => {
		scheduler.start();
		log.info('Sunkeep plugin ready');
	});

	server.addHook('onClose', async () => {
		scheduler.stop();
		if (service.getStatus().state === SunkeepState.CHARGING) {
			log.warn('Server shutting down during active charge session — stopping session');
			await service.manualStopSession();
		}
	});

	await registerSunkeepRoutes(server, service, prismaService);
}
```

- [ ] **Step 5: Update testConfig in sunkeep.service.spec.ts**

In `apps/gaspar/src/sunkeep/sunkeep.service.spec.ts`, find the `testConfig` object and replace the three powerwall fields with four tesla fields:

Old:

```typescript
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
```

New:

```typescript
const testConfig = {
	chargePointUsername: 'u',
	chargePointPassword: 'p',
	chargePointDeviceId: 42,
	teslaClientId: 'client-id',
	teslaClientSecret: 'client-secret',
	teslaRefreshToken: 'refresh-tok',
	teslaEnergySiteId: '12345',
	solarWindowStart: '06:00',
	solarWindowEnd: '20:00',
	sunkeepEnabled: false,
	powerwallSoeThreshold: 95,
};
```

- [ ] **Step 6: Run all gaspar tests**

```bash
pnpm --filter gaspar test
```

Expected: all tests pass (no references to PowerwallClient remain)

- [ ] **Step 7: Run typecheck**

```bash
pnpm --filter gaspar typecheck
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add apps/gaspar/src/sunkeep/
git commit -m "feat(gaspar): wire TeslaEnergyClient into sunkeep config, service, and plugin"
```

---

### Task 3: Update integration test

**Files:**

- Delete: `apps/gaspar/src/__integration-tests__/powerwall.integration.ts`
- Create: `apps/gaspar/src/__integration-tests__/tesla.integration.ts`

**Context:** Integration tests live in `apps/gaspar/src/__integration-tests__/` and run via `pnpm --filter gaspar test:integration`. They skip automatically if env vars are absent. This test makes a real network call to the Tesla Fleet API — run it only when you have valid credentials in `.env`.

- [ ] **Step 1: Delete the old integration test**

```bash
git rm apps/gaspar/src/__integration-tests__/powerwall.integration.ts
```

- [ ] **Step 2: Write the new integration test**

Create `apps/gaspar/src/__integration-tests__/tesla.integration.ts`:

```typescript
import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { TeslaEnergyClient } from '../sunkeep/tesla.client.js';

const clientId = process.env.TESLA_CLIENT_ID;
const clientSecret = process.env.TESLA_CLIENT_SECRET;
const refreshToken = process.env.TESLA_REFRESH_TOKEN;
const energySiteId = process.env.TESLA_ENERGY_SITE_ID;
const configured = Boolean(clientId && clientSecret && refreshToken && energySiteId);

describe.skipIf(!configured)('TeslaEnergyClient integration', () => {
	it('authenticates and fetches live energy data', async () => {
		const client = new TeslaEnergyClient({
			clientId: clientId!,
			clientSecret: clientSecret!,
			refreshToken: refreshToken!,
			energySiteId: energySiteId!,
		});

		const data = await client.getData();

		expect(typeof data.batteryPct).toBe('number');
		expect(data.batteryPct).toBeGreaterThanOrEqual(0);
		expect(data.batteryPct).toBeLessThanOrEqual(100);

		expect(typeof data.solarKw).toBe('number');
		expect(data.solarKw).toBeGreaterThanOrEqual(0);

		expect(typeof data.loadKw).toBe('number');
		expect(data.loadKw).toBeGreaterThanOrEqual(0);
	});
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/gaspar/src/__integration-tests__/tesla.integration.ts
git commit -m "feat(gaspar): replace powerwall integration test with Tesla Fleet API test"
```

---

### Task 4: OAuth callback route in apps/portfolio

**Files:**

- Create: `apps/portfolio/app/api/tesla/callback/route.ts`

**Context:** This is a one-time-use Next.js App Router GET route handler. It lives at `patjacobs.com/api/tesla/callback`. Tesla redirects here with `?code=...` after the user authorizes. The handler exchanges the code for tokens and displays the refresh token in plain HTML. No UI components needed — plain `Response` objects only, matching the pattern in `apps/portfolio/app/api/discord/route.ts`. Requires `TESLA_CLIENT_ID` and `TESLA_CLIENT_SECRET` in Vercel env vars.

- [ ] **Step 1: Write the route handler**

Create `apps/portfolio/app/api/tesla/callback/route.ts`:

```typescript
export async function GET(request: Request): Promise<Response> {
	const { searchParams } = new URL(request.url);
	const code = searchParams.get('code');

	if (!code) {
		return new Response('Missing code parameter', { status: 400 });
	}

	const clientId = process.env.TESLA_CLIENT_ID;
	const clientSecret = process.env.TESLA_CLIENT_SECRET;

	if (!clientId || !clientSecret) {
		return new Response('Server misconfiguration: missing Tesla credentials', { status: 500 });
	}

	const tokenRes = await fetch('https://auth.tesla.com/oauth2/v3/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			client_id: clientId,
			client_secret: clientSecret,
			code,
			redirect_uri: 'https://patjacobs.com/api/tesla/callback',
		}),
	});

	if (!tokenRes.ok) {
		const text = await tokenRes.text();
		return new Response(`Tesla token exchange failed (${tokenRes.status}):\n${text}`, {
			status: 502,
		});
	}

	const tokens = (await tokenRes.json()) as { refresh_token: string };

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tesla OAuth Complete</title>
  <style>body{font-family:monospace;max-width:700px;margin:40px auto;padding:0 16px}</style>
</head>
<body>
  <h2>Tesla authorization complete</h2>
  <p>Copy this refresh token to your Pi&rsquo;s <code>.env</code> as <code>TESLA_REFRESH_TOKEN</code>:</p>
  <pre style="background:#f4f4f4;padding:16px;word-break:break-all;white-space:pre-wrap">${tokens.refresh_token}</pre>
  <p><strong>Keep this token secret.</strong> Close this tab when done.</p>
</body>
</html>`;

	return new Response(html, {
		headers: { 'Content-Type': 'text/html' },
	});
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm --filter portfolio typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/portfolio/app/api/tesla/callback/route.ts
git commit -m "feat(portfolio): add Tesla OAuth callback route"
```

---

### Task 5: Static partner key file and setup docs

**Files:**

- Create: `apps/portfolio/public/.well-known/appspecific/com.tesla.3p.public-key.pem` (placeholder)
- Create: `apps/portfolio/docs/tesla-oauth-setup.md`
- Modify: `apps/gaspar/docs/sunkeep.md`
- Modify: `apps/gaspar/README.md`

**Context:** The partner key file must exist at this exact path before registering the app with Tesla. Vercel serves everything in `public/` as static files — no config needed. The file content is an RSA public key in PEM format that the developer generates locally. The plan shows the generation command; the actual file content cannot be generated ahead of time.

- [ ] **Step 1: Generate the RSA key pair locally**

Run these commands from the repo root. They produce two files: `tesla-private.pem` (keep secret, never commit) and `tesla-public.pem` (safe to commit):

```bash
openssl genrsa -out tesla-private.pem 2048
openssl rsa -in tesla-private.pem -pubout -out tesla-public.pem
```

- [ ] **Step 2: Place the public key in the portfolio public directory**

```bash
mkdir -p apps/portfolio/public/.well-known/appspecific
cp tesla-public.pem apps/portfolio/public/.well-known/appspecific/com.tesla.3p.public-key.pem
```

Verify it starts with `-----BEGIN PUBLIC KEY-----`:

```bash
head -1 apps/portfolio/public/.well-known/appspecific/com.tesla.3p.public-key.pem
```

Expected output: `-----BEGIN PUBLIC KEY-----`

- [ ] **Step 3: Store the private key safely**

The private key is NOT committed. Store it as an env var in Vercel if you ever need it for manual partner registration calls. For now just keep it locally:

```bash
# Do NOT commit tesla-private.pem
echo "tesla-private.pem" >> .gitignore  # if not already ignored
echo "tesla-public.pem" >> .gitignore
```

- [ ] **Step 4: Write the setup doc**

Create `apps/portfolio/docs/tesla-oauth-setup.md`:

````markdown
# Tesla Fleet API One-Time Setup

This doc covers registering a Tesla developer app and capturing a refresh token for Sunkeep.

## Prerequisites

- Access to [developer.tesla.com](https://developer.tesla.com)
- The RSA key pair generated in Task 5 (public key already deployed to patjacobs.com)
- `TESLA_CLIENT_ID` and `TESLA_CLIENT_SECRET` added to Vercel env vars for the portfolio project

## Steps

### 1. Register the app at developer.tesla.com

1. Go to [developer.tesla.com](https://developer.tesla.com) and sign in with your Tesla account.
2. Create a new application:
   - **Name:** anything (e.g. "Sunkeep")
   - **Domain:** `patjacobs.com`
   - **Redirect URI:** `https://patjacobs.com/api/tesla/callback`
   - **Allowed scopes:** `energy_device_data offline_access`
3. Copy the **Client ID** and **Client Secret** — add them to:
   - Root `.env` on the Pi as `TESLA_CLIENT_ID` and `TESLA_CLIENT_SECRET`
   - Vercel env vars for the portfolio project (needed by the callback route)

### 2. Deploy the public key

The public key is already at `apps/portfolio/public/.well-known/appspecific/com.tesla.3p.public-key.pem`. Push the branch and deploy to Vercel. Tesla will fetch this URL during registration to verify you own the domain.

Verify it's live:

```bash
curl https://patjacobs.com/.well-known/appspecific/com.tesla.3p.public-key.pem
```
````

Expected: the PEM contents starting with `-----BEGIN PUBLIC KEY-----`.

### 3. Register as a partner (one-time API call)

After your app is approved and the public key is live, register your domain with Tesla's Fleet API:

```bash
# Get a partner access token
PARTNER_TOKEN=$(curl -s -X POST https://auth.tesla.com/oauth2/v3/token \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "scope=openid vehicle_device_data energy_device_data offline_access" \
  -d "audience=https://fleet-api.prd.na.vn.cloud.tesla.com" \
  | jq -r .access_token)

# Register your domain
curl -X POST https://fleet-api.prd.na.vn.cloud.tesla.com/api/1/partner_accounts \
  -H "Authorization: Bearer $PARTNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"domain": "patjacobs.com"}'
```

### 4. Authorize and capture the refresh token

Construct the authorization URL and open it in a browser (replace `YOUR_CLIENT_ID`):

```
https://auth.tesla.com/oauth2/v3/authorize?client_id=YOUR_CLIENT_ID&locale=en-US&prompt=login&redirect_uri=https%3A%2F%2Fpatjacobs.com%2Fapi%2Ftesla%2Fcallback&response_type=code&scope=energy_device_data+offline_access&state=sunkeep
```

Tesla will redirect to `patjacobs.com/api/tesla/callback`, which exchanges the code and displays your refresh token. Copy it.

### 5. Find your energy site ID

Use the access token displayed during setup (or request a new one) to list your products:

```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  https://fleet-api.prd.na.vn.cloud.tesla.com/api/1/products
```

Find the entry with `"resource_type": "energy_site"` and copy its `"energy_site_id"` value.

### 6. Set Pi env vars

Add to `/home/pi/zeal/.env`:

```env
TESLA_CLIENT_ID=your_client_id
TESLA_CLIENT_SECRET=your_client_secret
TESLA_REFRESH_TOKEN=the_token_from_step_4
TESLA_ENERGY_SITE_ID=the_id_from_step_5
```

Remove the old Powerwall vars:

```
# Remove these:
# POWERWALL_HOST=...
# POWERWALL_EMAIL=...
# POWERWALL_PASSWORD=...
```

### 7. Verify with the integration test

```bash
pnpm --filter gaspar test:integration
```

Expected: 1 test passes (fetches live battery/solar/load data).

```

- [ ] **Step 5: Update gaspar env vars table in docs/sunkeep.md**

In `apps/gaspar/docs/sunkeep.md`, replace the Environment Variables table. Find the section starting with `## Environment Variables` and replace the table:

Old rows to remove:
```

| `POWERWALL_HOST` | — | LAN IP of the Powerwall gateway (e.g. `192.168.1.100`) |
| `POWERWALL_EMAIL` | — | Powerwall gateway login email |
| `POWERWALL_PASSWORD` | — | Powerwall gateway login password |

```

New rows to add in their place:
```

| `TESLA_CLIENT_ID` | — | App client ID from developer.tesla.com |
| `TESLA_CLIENT_SECRET` | — | App client secret |
| `TESLA_REFRESH_TOKEN` | — | Refresh token from one-time OAuth setup |
| `TESLA_ENERGY_SITE_ID` | — | Numeric energy site ID from Tesla Fleet API |

````

- [ ] **Step 6: Update gaspar README.md env vars table**

In `apps/gaspar/README.md`, find the Sunkeep env vars section and apply the same substitution: remove the 3 `POWERWALL_*` rows, add the 4 `TESLA_*` rows.

- [ ] **Step 7: Run full typecheck to confirm everything is clean**

```bash
pnpm typecheck
````

Expected: all packages pass

- [ ] **Step 8: Commit**

```bash
git add apps/portfolio/public/.well-known/ apps/portfolio/docs/ apps/gaspar/docs/ apps/gaspar/README.md
git commit -m "feat: add Tesla partner key, OAuth setup doc, and update Sunkeep env var docs"
```
