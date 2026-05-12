# Tesla Fleet API Integration Design

## Goal

Replace the local `PowerwallClient` (which used direct HTTPS to the Powerwall gateway) with a `TeslaEnergyClient` that calls the Tesla Fleet API. The Powerwall 3 is not reachable on the local network; the Fleet API is the stable alternative.

## Architecture

`SunkeepService`, `SunkeepScheduler`, all routes, and the state machine are unchanged — they already consume a `getData() → PowerwallData` interface. Swapping the client is invisible to them.

Two areas change: `apps/gaspar` (client replacement + config update) and `apps/portfolio` (partner key file + one-time OAuth callback).

## One-Time Setup Flow

Performed once from any browser. The Pi is never publicly reachable and is not involved.

1. Generate an RSA key pair locally (script provided in plan).
2. Place the public key at `apps/portfolio/public/.well-known/appspecific/com.tesla.3p.public-key.pem` and deploy to Vercel. Tesla fetches this to verify app identity.
3. Register an app at developer.tesla.com using `https://patjacobs.com` as the domain. Set the redirect URI to `https://patjacobs.com/api/tesla/callback`.
4. Add `TESLA_PRIVATE_KEY` (PEM string, no newlines) to Vercel env vars for the `apps/portfolio` project.
5. Visit the Tesla OAuth authorization URL in a browser. Tesla redirects to `patjacobs.com/api/tesla/callback?code=...`.
6. The callback exchanges the code for tokens and renders the refresh token on screen.
7. Copy the refresh token to `.env` on the Pi.
8. Use the access token to call `GET /api/1/products` to find your `energy_site_id`. Copy it to `.env` as `TESLA_ENERGY_SITE_ID`. Done — static value that never changes.

## Runtime Flow (Pi, every 10 minutes)

1. `TeslaEnergyClient.getData()` calls `refreshIfNeeded()`.
2. If the cached access token has more than 60 seconds remaining, skip refresh.
3. Otherwise POST to `https://auth.tesla.com/oauth2/v3/token` with `grant_type: refresh_token` to obtain a new access token (~8h TTL).
4. GET `https://fleet-api.prd.na.vn.cloud.tesla.com/api/1/energy_sites/{siteId}/live_status`.
5. Map response → `PowerwallData`: `battery_percentage → batteryPct`, `solar_power / 1000 → solarKw`, `load_power / 1000 → loadKw`.

## Files Changed

### apps/gaspar

| File                                                 | Change                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| `src/sunkeep/powerwall.client.ts`                    | Deleted                                                          |
| `src/sunkeep/powerwall.client.spec.ts`               | Deleted                                                          |
| `src/sunkeep/tesla.client.ts`                        | New — `TeslaEnergyClient` class                                  |
| `src/sunkeep/tesla.client.spec.ts`                   | New — unit tests (mocked fetch)                                  |
| `src/sunkeep/sunkeep.types.ts`                       | Remove Powerwall fields from `SunkeepConfig`, add 4 Tesla fields |
| `src/sunkeep/sunkeep.config.ts`                      | Read new Tesla env vars, remove old Powerwall vars               |
| `src/sunkeep/sunkeep.plugin.ts`                      | Instantiate `TeslaEnergyClient` instead of `PowerwallClient`     |
| `src/__integration-tests__/powerwall.integration.ts` | Deleted                                                          |
| `src/__integration-tests__/tesla.integration.ts`     | New — real network call, skipped if env vars absent              |
| `docs/sunkeep.md`                                    | Update env vars table                                            |
| `README.md`                                          | Update env vars table                                            |

### apps/portfolio

| File                                                         | Change                                        |
| ------------------------------------------------------------ | --------------------------------------------- |
| `public/.well-known/appspecific/com.tesla.3p.public-key.pem` | New — RSA public key (generated during setup) |
| `app/api/tesla/callback/route.ts`                            | New — GET route handler for OAuth callback    |
| `docs/tesla-oauth-setup.md`                                  | New — step-by-step setup instructions         |

## TeslaEnergyClient Interface

```typescript
class TeslaEnergyClient {
	constructor(config: {
		clientId: string;
		clientSecret: string;
		refreshToken: string;
		energySiteId: string;
	});
	getData(): Promise<PowerwallData>;
}
```

Internally holds `accessToken: string | null` and `tokenExpiresAt: number` (Unix ms). `refreshIfNeeded()` is private.

## SunkeepConfig Changes

Removed:

- `powerwallHost: string`
- `powerwallEmail: string`
- `powerwallPassword: string`

Added:

- `teslaClientId: string`
- `teslaClientSecret: string`
- `teslaRefreshToken: string`
- `teslaEnergySiteId: string`

## Environment Variables

### apps/gaspar (.env on Pi)

| Variable               | Description                                             |
| ---------------------- | ------------------------------------------------------- |
| `TESLA_CLIENT_ID`      | App client ID from developer.tesla.com                  |
| `TESLA_CLIENT_SECRET`  | App client secret                                       |
| `TESLA_REFRESH_TOKEN`  | Refresh token captured from the one-time OAuth callback |
| `TESLA_ENERGY_SITE_ID` | Energy site ID (numeric string from Tesla API)          |

Removes: `POWERWALL_HOST`, `POWERWALL_EMAIL`, `POWERWALL_PASSWORD`

### apps/portfolio (Vercel env vars)

| Variable              | Description                                                  |
| --------------------- | ------------------------------------------------------------ |
| `TESLA_CLIENT_ID`     | Same app client ID                                           |
| `TESLA_CLIENT_SECRET` | Same app client secret                                       |
| `TESLA_PRIVATE_KEY`   | RSA private key PEM as single-line string (newlines as `\n`) |

## OAuth Callback Route

`GET /api/tesla/callback`

- Reads `code` from query params
- POSTs to `https://auth.tesla.com/oauth2/v3/token`:
  - `grant_type: authorization_code`
  - `client_id`, `client_secret`, `code`, `redirect_uri`
- Returns a plain HTML response displaying the `refresh_token` for the user to copy
- No state stored — purely a one-time token display page

## TeslaEnergyClient Unit Tests

Three test cases in `tesla.client.spec.ts` (mocked `fetch`):

1. **Fetches data and caches token** — mock token endpoint returns valid token, mock live_status returns energy data; assert `PowerwallData` shape is correct and token endpoint called once
2. **Refreshes expired token** — set `tokenExpiresAt` to past; assert token endpoint called again before data fetch
3. **Skips refresh when token is fresh** — set `tokenExpiresAt` to far future; assert token endpoint not called

## Integration Test

`tesla.integration.ts` — `describe.skipIf(!configured)` where configured = all four `TESLA_*` env vars present. One test: `getData()` returns `batteryPct` in 0–100, `solarKw ≥ 0`, `loadKw ≥ 0`.
