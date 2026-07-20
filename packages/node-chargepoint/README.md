# node-chargepoint

![Pre-release](https://img.shields.io/badge/status-pre--release-orange?style=flat-square)
![Not production ready](https://img.shields.io/badge/production-not%20ready-red?style=flat-square)

> **Warning:** This library is in pre-release and is **not ready for production use**. The API is unstable and may change without notice between versions.

A simple, async Node.js/TypeScript wrapper around the ChargePoint EV Charging Network API.

> Based on [python-chargepoint](https://github.com/mbillow/python-chargepoint) by Marc Billow (MIT).

## Disclaimer

This project is not affiliated with or endorsed by ChargePoint in any way. Use at your own risk.
ChargePoint is a registered trademark of ChargePoint, Inc.

---

## Installation

```bash
pnpm add node-chargepoint
```

Requires **Node.js ≥ 24**.

---

## Library Usage

All client methods are `async` and return Promises.

### Authentication

Three authentication methods are supported. The client is created via the async factory `ChargePoint.create()`.

**Password:**
```typescript
import { ChargePoint } from 'node-chargepoint';

const client = await ChargePoint.create('user@example.com');
await client.loginWithPassword('password');
// ...
await client.logout();
```

**Long-lived session token** (recommended for automation):
```typescript
const client = await ChargePoint.create('user@example.com', {
  coulombToken: '<coulomb_sess cookie value>',
});
```

**SSO JWT:**
```typescript
const client = await ChargePoint.create('user@example.com');
await client.loginWithSsoSession('<sso jwt>');
```

---

### Obtaining Tokens Manually

Password-based login may be blocked by bot-protection (Datadome). When that happens,
you can capture a token directly from your browser and pass it to the client.

1. Open [https://driver.chargepoint.com](https://driver.chargepoint.com) in your browser and log in normally.
2. Open Developer Tools and navigate to **Application > Cookies > https://driver.chargepoint.com**.
3. Copy the value of one of the following cookies:

| Cookie | Use as |
|---|---|
| `coulomb_sess` | `coulombToken:` option (recommended — long-lived) |
| `auth-session` | `loginWithSsoSession()` (shorter-lived JWT) |

> **Note:** The `coulomb_sess` value contains `#` and `?` characters. When setting it as a
> shell environment variable, always wrap the value in **double quotes** to prevent the shell
> from interpreting `#` as a comment:
>
> ```bash
> export CP_TOKEN="Ab3dEf...token...#D???????#RNA-US"
> ```

---

### Account

```typescript
const account = await client.getAccount();
console.log(account.user.fullName);          // "Jane Smith"
console.log(account.accountBalance.amount);  // 12.34

const vehicles = await client.getVehicles();
for (const ev of vehicles) {
  console.log(`${ev.year} ${ev.make} ${ev.model}`);     // "2023 Polestar 2"
  console.log(`  AC: ${ev.chargingSpeed} kW  DC: ${ev.dcChargingSpeed} kW`);
}
```

---

### Home Charger

```typescript
const chargerIds = await client.getHomeChargers();
// [12345678]

const chargerId = chargerIds[0];

const status = await client.getHomeChargerStatus(chargerId);
// {
//   chargerId: 12345678,
//   brand: 'CP',
//   model: 'HOME FLEX',
//   chargingStatus: 'AVAILABLE',
//   isPluggedIn: true,
//   isConnected: true,
//   amperageLimit: 28,
//   possibleAmperageLimits: [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]
// }

const tech = await client.getHomeChargerTechnicalInfo(chargerId);
// {
//   modelNumber: 'CPH50-NEMA6-50-L23',
//   serialNumber: '...',
//   softwareVersion: '1.2.3.4',
//   lastConnectedAt: '2024-06-01T08:30:00Z'
// }

const config = await client.getHomeChargerConfig(chargerId);
// {
//   stationNickname: 'Home Flex',
//   ledBrightness: { level: 5, supportedLevels: [0,1,2,3,4,5] },
//   utility: { name: 'Austin Energy', ... }
// }
```

#### Amperage limit

```typescript
// Print valid amperage values
console.log(status.possibleAmperageLimits);
// [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]

await client.setAmperageLimit(chargerId, 24);
```

#### LED brightness

Levels map to: `0`=off, `1`=20%, `2`=40%, `3`=60%, `4`=80%, `5`=100%.
Available levels are returned by `getHomeChargerConfig()`.

```typescript
await client.setLedBrightness(chargerId, 3);  // 60%
```

#### Restart

```typescript
await client.restartHomeCharger(chargerId);
```

#### Charging schedule

```typescript
const schedule = await client.getHomeChargerSchedule(chargerId);
console.log(schedule.scheduleEnabled);                      // false
console.log(schedule.defaultSchedule.weekdays.startTime);   // "23:00"
console.log(schedule.defaultSchedule.weekdays.endTime);     // "07:00"
console.log(schedule.defaultSchedule.weekends.startTime);   // "19:00"
console.log(schedule.defaultSchedule.weekends.endTime);     // "15:00"

// Enable a schedule
const updated = await client.setHomeChargerSchedule(
  chargerId,
  '23:00', '07:00',  // weekday start, weekday end
  '19:00', '15:00',  // weekend start, weekend end
);
console.log(updated.scheduleEnabled);  // true

// Disable the schedule
await client.disableHomeChargerSchedule(chargerId);
```

#### Schedule window utilities

Two pure helper functions are exported for evaluating schedule windows without an extra API call.

**`getActiveScheduleWindow(schedule, date?)`**

Resolves the window that is currently active from a `HomeChargerSchedule`. Returns `null` when `scheduleEnabled` is `false` — the signal that the ChargePoint schedule should be ignored and your own logic applied.

Priority when multiple schedules exist: `userSchedule` → `utilitySchedule` → `defaultSchedule`.
Automatically selects the weekday or weekend window based on `date` (defaults to now).

**`isWithinChargeScheduleWindow(window, date?)`**

Returns `true` if the time component of `date` (defaults to now) falls within the given `ChargeScheduleWindow`. Handles midnight-crossing windows (e.g. `22:00`–`06:00`). Start is inclusive, end is exclusive.

**TOU / off-peak charging** — check the ChargePoint schedule:

```typescript
import { getActiveScheduleWindow, isWithinChargeScheduleWindow } from 'node-chargepoint';

const schedule = await client.getHomeChargerSchedule(chargerId);
const window = getActiveScheduleWindow(schedule);

if (window && isWithinChargeScheduleWindow(window)) {
  // within the configured off-peak window — ok to charge
}
```

**Solar / custom scheduling** — ChargePoint schedule is off, apply your own window:

```typescript
const schedule = await client.getHomeChargerSchedule(chargerId);
const window = getActiveScheduleWindow(schedule);

if (!window) {
  // ChargePoint schedule is disabled — use your own time window
  const solarWindow = { startTime: '7:00', endTime: '19:00' };
  if (isWithinChargeScheduleWindow(solarWindow)) {
    // sun is up — ok to charge from solar
  }
}
```

> **Note:** `HomeChargerStatus.isDuringScheduledTime` is the ChargePoint API's own evaluation
> of the configured off-peak schedule. Use `getActiveScheduleWindow` +
> `isWithinChargeScheduleWindow` instead when you need to check a custom window (solar hours,
> time-of-day rules, etc.) independently of TOU pricing.

---

### Charging Status and Sessions

#### Home charger sessions (recommended)

`getHomeChargerSession(chargerId)` resolves the active session for a home charger regardless of
how it was started — including sessions started manually in the ChargePoint app, auto-started on
plug-in, or started via this library.

```typescript
const [chargerId] = await client.getHomeChargers();

const session = await client.getHomeChargerSession(chargerId);
if (session) {
  console.log(session.chargingState);  // "CHARGING"
  console.log(session.energyKwh);     // 6.42
  console.log(session.powerKw);       // 7.2
  await session.stop();
}
```

Returns `null` when the charger is not actively charging or no session can be resolved.

Resolution order:
1. **Device plane** — reads the session id from `getHomeChargerStatus` when the device API
   surfaces it.
2. **Driver plane fallback** — calls `getUserChargingStatus` for driver-authenticated sessions
   (started via this library's `startChargingSession`).

`getHomeChargerStatus` also surfaces optional live telemetry fields when the device API includes
them: `sessionId`, `energyKwh`, `powerKw`, and `sessionStartTime`.

> **Driver-plane vs device-plane identity:** `getUserChargingStatus()` is the *driver plane*
> and is only populated for sessions bound to the current authenticated context (API-started
> or driver-authenticated sessions). The *device plane* (`getHomeChargerStatus`) reflects the
> physical charger state and, on some models, surfaces sessions regardless of how they were
> started. Use `getHomeChargerSession` as the primary path for home charger session management.

> **Known limitation:** on chargers whose live telemetry runs over ChargePoint's WebSocket
> channel rather than REST (observed on the `CPH50` family), neither plane surfaces a session
> id for an EV-auto-started session — `getHomeChargerStatus().sessionId` stays `undefined` and
> `getUserChargingStatus()` returns `null` even while actively charging. This library is
> REST-only today, so such a session cannot currently be resolved or stopped through it; see
> [Error Handling](docs/error-handling.md#known-limitation-some-home-chargers-never-surface-a-session-id-over-rest).

#### Driver-plane status

```typescript
const status = await client.getUserChargingStatus();
if (status) {
  console.log(status.state);      // "CHARGING"
  console.log(status.sessionId);  // 1234567890

  const session = await client.getChargingSession(status.sessionId);
  console.log(session.chargingState);  // "CHARGING"
  console.log(session.energyKwh);     // 6.42
  console.log(session.milesAdded);    // 22.3
}
```

#### Starting and stopping a session

```typescript
// Start a new session on any device
const newSession = await client.startChargingSession(deviceId);
console.log(newSession.sessionId);

// Stop by device ID — no session object needed
await client.stopChargingSession(deviceId);

// Or stop via a session object
const session = await client.getChargingSession(status.sessionId);
await session.stop();
```

`stopChargingSession(deviceId)` is the device-level stop symmetric with `startChargingSession`. It stops the active session on the device without requiring you to fetch a session first.

Under the hood it resolves the active session before issuing the stop, because ChargePoint rejects a stop that does not carry the real session id (HTTP 422 `errorId` 165). Resolution order:

1. **Driver plane** — `getUserChargingStatus()` (public stations and driver-owned sessions). The resolved session is only used when it actually belongs to `deviceId`, so a session on a *different* charger (e.g. a second charger in the same account) is never stopped by mistake.
2. **Device plane fallback** — the session id surfaced by `getHomeChargerStatus`, on chargers where the device API includes it (see the known limitation below).

The resolved session's real `sessionId` and `outletNumber` are then sent to the stop endpoint. If no active session can be resolved on either plane, an `UnresolvedSessionError` (carrying the `deviceId`) is thrown — distinct from the `NoActiveSessionError` the API returns for a stop targeting a non-existent session. If the charger is currently busy (e.g. mid-handshake), a `ChargerBusyError` is thrown. If the vehicle isn't in a state that can charge (e.g. it's already at its charge limit), a `VehicleNotReadyError` is thrown — see [Error Handling](docs/error-handling.md). On some charger models an EV-auto-started session may be unresolvable by either plane; see the [known limitation](docs/error-handling.md#known-limitation-some-home-chargers-never-surface-a-session-id-over-rest).

---

### Station Info

Fetch detailed information about any station by device ID — ports, pricing, connector types, and real-time status.

```typescript
const info = await client.getStation(13055991);
console.log(info.name.join(' / '));    // "DOMAIN TOWER 2 / LVL 2_STATION 2"
console.log(info.address.address1);   // "10025 Alterra Pkwy"
console.log(info.stationStatusV2);    // "available"
console.log(info.portsInfo.totalCount);  // 2

for (const port of info.portsInfo.ports) {
  console.log(`Port ${port.outletNumber}: ${port.statusV2} (Level ${port.level})`);
  for (const c of port.connectorList) {
    console.log(`  ${c.displayPlugType}: ${c.statusV2}`);
  }
}

if (info.stationPrice) {
  for (const tou of info.stationPrice.touFees) {
    console.log(`Rate: ${tou.price} ${info.stationPrice.currencyCode}`);
  }
}
```

---

### Nearby Stations

Fetch all charging stations visible within a geographic bounding box.

```typescript
import type { MapFilter, ZoomBounds } from 'node-chargepoint';

const bounds: ZoomBounds = {
  swLat: 30.37, swLon: -97.66,
  neLat: 30.40, neLon: -97.64,
};

// No filter — return all stations
const stations = await client.getNearbyStations(bounds);

// Optional: filter by connector type or status
const filter: MapFilter = {
  connectorL2: true,
  connectorCombo: true,
  statusAvailable: true,
};
const filtered = await client.getNearbyStations(bounds, filter);

for (const s of filtered) {
  console.log(`${s.name1} — ${s.stationStatusV2}`);
  if (s.isHome && s.chargingInfo) {
    console.log(`  Charging: ${s.chargingStatus}`);
  }
}
```

**`MapFilter` fields** (all `boolean`, all optional):

| Field | Description |
|---|---|
| `connectorL2` | Level 2 AC |
| `connectorCombo` | CCS combo (DC) |
| `connectorChademo` | CHAdeMO (DC) |
| `connectorTesla` | Tesla proprietary |
| `connectorL1` | Level 1 AC |
| `connectorL2Tesla` | Tesla Level 2 |
| `connectorL2Nema1450` | NEMA 14-50 |
| `dcFastCharging` | Any DC fast charger |
| `statusAvailable` | Only available stations |
| `priceFree` | Only free stations |
| `vanAccessible` | Van-accessible spaces |
| `disabledParking` | Disability-accessible parking |
| `networkChargepoint` | ChargePoint network |
| `networkEvgo` | EVgo network |

---

## CLI

See [docs/cli.md](docs/cli.md) for usage, commands, and global options.

---

## Error Handling

See [docs/error-handling.md](docs/error-handling.md) for the error class hierarchy and handling examples.

---

## Development

See [docs/development.md](docs/development.md) for setup, tests, E2E tests, and build instructions.

---
