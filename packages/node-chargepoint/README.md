# node-chargepoint

A simple, async Node.js/TypeScript wrapper around the ChargePoint EV Charging Network API.

> Based on [python-chargepoint](https://github.com/mbillow/python-chargepoint) by Marc Billow (MIT).

## Disclaimer

This project is not affiliated with or endorsed by ChargePoint in any way. Use at your own risk.
ChargePoint is a registered trademark of ChargePoint, Inc.

---

## Installation

```bash
npm install node-chargepoint
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

---

### Charging Status and Sessions

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
// Stop the current session
const session = await client.getChargingSession(status.sessionId);
await session.stop();

// Start a new session on any device
const newSession = await client.startChargingSession(chargerId);
console.log(newSession.sessionId);
```

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

After installation, a `chargepoint` command is available.

### Authentication

Credentials are read from environment variables:

```bash
export CP_USERNAME="user@example.com"
export CP_TOKEN="<coulomb_sess cookie value>"
# or use --password / CP_PASSWORD for password-based login
```

### Commands

```bash
# Show account info
chargepoint -u user@example.com -t $CP_TOKEN account

# List registered vehicles
chargepoint -u user@example.com -t $CP_TOKEN vehicles

# Show current charging session status
chargepoint -u user@example.com -t $CP_TOKEN status

# List home charger IDs
chargepoint -u user@example.com -t $CP_TOKEN chargers

# Start a charging session on a device
chargepoint -u user@example.com -t $CP_TOKEN start <deviceId>

# Show details for a charging station
chargepoint -u user@example.com -t $CP_TOKEN station <deviceId>
```

Global options:

```
-u, --username <username>   ChargePoint username (or set CP_USERNAME)
-t, --token <token>         Coulomb session token (or set CP_TOKEN)
-p, --password <password>   Password login fallback (or set CP_PASSWORD)
-V, --version               Print version
-h, --help                  Display help
```

---

## Error Handling

```typescript
import {
  ChargePoint,
  LoginError,
  InvalidSession,
  DatadomeCaptcha,
  CommunicationError,
  APIError,
} from 'node-chargepoint';

try {
  await client.loginWithPassword('bad-password');
} catch (err) {
  if (err instanceof LoginError) {
    console.error('Wrong credentials');
  } else if (err instanceof InvalidSession) {
    console.error('Session expired — re-authenticate');
  } else if (err instanceof DatadomeCaptcha) {
    console.error('Bot protection triggered:', err.captchaUrl);
  } else if (err instanceof CommunicationError) {
    console.error(`API error ${err.statusCode}:`, err.message);
  }
}
```

**Error hierarchy:**

```
APIError
├── CommunicationError     (non-2xx response)
│   ├── LoginError         (authentication failed)
│   └── InvalidSession     (session expired — HTTP 401)
└── DatadomeCaptcha        (Datadome bot protection — HTTP 403)
```

---

## Development

### Setup

```bash
git clone https://github.com/musicbender/node-chargepoint.git
cd node-chargepoint
npm install
```

### Type checking

```bash
npm run typecheck
```

### Tests

```bash
npm test
```

Tests use [Vitest](https://vitest.dev/) and [MSW](https://mswjs.io/) to intercept `fetch` calls. No real network traffic is made during tests.

### Build

```bash
npm run build
```

Produces `dist/index.js` (ESM), `dist/index.cjs` (CommonJS), and `dist/index.d.ts` (type declarations) via [tsup](https://tsup.egoist.dev/).

### Checks

| Command | Purpose |
|---|---|
| `npm run typecheck` | TypeScript strict type checking |
| `npm test` | Run all tests |
| `npm run build` | Build CJS + ESM + `.d.ts` |
| `npm run prepublishOnly` | Build + typecheck (runs automatically before `npm publish`) |

---
