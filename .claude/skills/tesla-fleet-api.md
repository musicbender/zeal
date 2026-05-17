---
name: tesla-fleet-api
description: Tesla Fleet API reference — auth flow, endpoints, env vars, and TeslaEnergyClient usage in gaspar/sunkeep
---

# Tesla Fleet API

## Auth Flow

Uses OAuth2 with a long-lived refresh token and short-lived access tokens (~8h TTL). RSA key pair: public key hosted at `apps/portfolio/public/.well-known/appspecific/com.tesla.3p.public-key.pem` on patjacobs.com.

### Token refresh

`TeslaEnergyClient.refreshIfNeeded()` is called before every API request. It skips refresh if the cached access token has >60 seconds remaining. Never skip this call.

```
POST https://auth.tesla.com/oauth2/v3/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
client_id=TESLA_CLIENT_ID
client_secret=TESLA_CLIENT_SECRET
refresh_token=TESLA_REFRESH_TOKEN
```

Returns `{ access_token, expires_in }`. Store expiry as `Date.now() + expires_in * 1000`.

## Key Endpoints

Base: `https://fleet-api.prd.na.vn.cloud.tesla.com`

### Live status (called every 10 minutes by SunkeepScheduler)

```
GET /api/1/energy_sites/{energySiteId}/live_status
Authorization: Bearer {accessToken}
```

Response fields mapped to `PowerwallData`:

| API field            | PowerwallData field | Transform        |
| -------------------- | ------------------- | ---------------- |
| `percentage_charged` | `batteryPct`        | direct           |
| `solar_power`        | `solarKw`           | ÷ 1000           |
| `load_power`         | `loadKw`            | ÷ 1000           |
| `battery_power`      | `batteryKw`         | ÷ 1000, nullable |
| `grid_power`         | `gridKw`            | ÷ 1000, nullable |
| `grid_status`        | `gridStatus`        | nullable string  |

### Site info

```
GET /api/1/energy_sites/{energySiteId}/site_info
Authorization: Bearer {accessToken}
```

Returns site name, battery capacity (watts → kWh ÷ 1000), backup reserve %, firmware version, battery count.

## Environment Variables

| Var                    | Description                                                              |
| ---------------------- | ------------------------------------------------------------------------ |
| `TESLA_CLIENT_ID`      | OAuth app client ID from developer.tesla.com                             |
| `TESLA_CLIENT_SECRET`  | OAuth app client secret                                                  |
| `TESLA_REFRESH_TOKEN`  | Long-lived refresh token (obtained during one-time OAuth setup)          |
| `TESLA_ENERGY_SITE_ID` | Numeric energy site ID — static, obtained once via `GET /api/1/products` |

## Implementation

`apps/gaspar/src/sunkeep/tesla.client.ts` — `TeslaEnergyClient` implements `IPowerwallAdapter`:

```ts
interface IPowerwallAdapter {
	getData(): Promise<PowerwallData>;
}
```

`SunkeepService` depends only on `IPowerwallAdapter` — swap the client by passing a different implementation to its constructor.

## Common Pitfall

Never assume a cached `accessToken` is valid. Always call `refreshIfNeeded()`. The implementation uses a 60-second buffer (`Date.now() < this.tokenExpiresAt - 60_000`) to avoid expiry mid-request.
