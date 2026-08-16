---
name: chargepoint
description: ChargePoint API reference — node-chargepoint client library, auth, key methods, and usage in gaspar sunkeep
---

# ChargePoint

The ChargePoint API is accessed via the `node-chargepoint` npm package. The source lives at `../node-chargepoint` (sibling repo, owned by Pat) — read it for types and method signatures when the npm package types are insufficient.

## Auth

`ChargePoint` uses a session token called `coulombToken`.

**First time (no saved token):**

```ts
const client = await ChargePoint.create(username);
await client.loginWithPassword(password);
console.log(client.coulombToken); // save this as CHARGEPOINT_TOKEN
```

**With saved token (preferred):**

```ts
const client = await ChargePoint.create(username, { coulombToken: savedToken });
```

If a request throws `InvalidSession`, the token has expired — catch it and re-authenticate with `loginWithPassword`.

## Environment Variables

| Var                     | Description                                                     |
| ----------------------- | --------------------------------------------------------------- |
| `CHARGEPOINT_USERNAME`  | ChargePoint account email                                       |
| `CHARGEPOINT_PASSWORD`  | ChargePoint account password                                    |
| `CHARGEPOINT_TOKEN`     | Saved coulombToken — pass on startup to avoid re-authenticating |
| `CHARGEPOINT_DEVICE_ID` | Numeric home charger device ID                                  |

## Key Methods

```ts
// Session token (persist between restarts)
client.coulombToken: string | null

// Home charger discovery
const ids = await client.getHomeChargers(): Promise<number[]>

// Status and config
await client.getHomeChargerStatus(chargerId: number): Promise<HomeChargerStatus>
await client.getHomeChargerConfig(chargerId: number): Promise<HomeChargerConfiguration>

// Amperage control (integer amps only — clamp and round before calling)
await client.setAmperageLimit(chargerId: number, amperage: number): Promise<void>

// Sessions
await client.startChargingSession(deviceId: number, options?: StartSessionOptions): Promise<ChargingSession>
await client.stopChargingSession(deviceId: number): Promise<void>  // resolves the live session (driver plane, then device plane) and stops it by its real sessionId/outletNumber (0.10.0). Throws UnresolvedSessionError when no session id is visible over REST.
await client.getChargingSession(sessionId: number): Promise<ChargingSession>
await client.getUserChargingStatus(): Promise<UserChargingStatus | null>
```

## Usage in Zeal

`apps/gaspar/src/sunkeep/` — sunkeep uses ChargePoint to start/stop the home charger and set amperage based on available solar power. Entry point is `sunkeep.plugin.ts`, which constructs the `ChargePoint` client and passes it to `SunkeepService`.

## Common Pitfalls

- Call `getUserChargingStatus()` before `startChargingSession()` — ChargePoint errors if a session is already active.
- `setAmperageLimit()` takes integer amps. Always `Math.round()` before calling.
- `InvalidSession` means the coulombToken expired — catch and re-authenticate.
- `stopChargingSession()` can still throw `UnresolvedSessionError` in principle (no session visible via either the driver or device plane), but as of node-chargepoint 0.12.0 this is no longer expected for auto-started sessions on CPH50-family chargers — that was a library bug (`getUserChargingStatus()` parsing the wrong response keys, plus a `coulomb_sess` token-corruption bug), not a real API gap, and both are fixed. Confirmed live against a genuinely auto-started (zero app/RFID interaction) session. If `UnresolvedSessionError` does fire, the caller falls back to clamping amperage to the minimum.
- `getUserChargingStatus()` (≥0.12.0) also returns `startTime` (when the session began, per ChargePoint) and `asOf` (server time of this snapshot) — `startTime` is more accurate than a local poll timestamp for recording when a session actually started; see `SunkeepService.finalizeAdoption()`.
- Source types: `../node-chargepoint/src/types.ts` has all response shapes.
