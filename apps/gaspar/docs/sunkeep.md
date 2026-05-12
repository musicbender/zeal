# Sunkeep

Background automation service that charges a car using excess solar power. It polls every 10 minutes, checks the Tesla energy site state (battery SOE and solar production via the Tesla Fleet API), and starts or adjusts a ChargePoint home charging session whenever there's enough surplus to charge without drawing from the battery or grid.

## How It Works

1. Every 10 minutes (within the configured solar window), Sunkeep polls ChargePoint and the Tesla Fleet API.
2. If the car is plugged in, battery is ≥95% charged, and excess solar ≥ 1.5 kW — start charging.
3. Amperage is set based on current excess: `clamp(floor(excessKw × 1000 / 240), 8, 32)` amps.
4. On subsequent ticks, amps are adjusted up or down to track the changing solar surplus.
5. Charging stops automatically if solar drops, the battery depletes, the car is unplugged, or it gets dark.

## State Machine

| State      | Meaning                                                                   |
| ---------- | ------------------------------------------------------------------------- |
| `DISABLED` | Automation is off — no polling, no API calls                              |
| `IDLE`     | Polling, car not plugged in                                               |
| `WAITING`  | Car plugged in, but conditions not met (low solar or battery < threshold) |
| `CHARGING` | Active session in progress, amps adjusting every 10 min                   |
| `ERROR`    | A recoverable error occurred — retried next poll cycle                    |

## Session Stop Reasons

| Reason             | Trigger                                                                               |
| ------------------ | ------------------------------------------------------------------------------------- |
| `solar_dropped`    | Excess kW fell below 1.5 kW during active session                                     |
| `night_safety`     | `solar_kw == 0` detected during active session                                        |
| `battery_depleted` | Tesla battery SOE dropped below threshold during active session                       |
| `unplugged`        | Car unplugged during active session                                                   |
| `manual`           | User called `POST /sunkeep/charge/stop`, `POST /sunkeep/disable`, or server shut down |
| `error`            | Unrecoverable API error during active session                                         |

## Environment Variables

All Sunkeep variables are required unless a default is shown.

| Variable                | Default | Description                                          |
| ----------------------- | ------- | ---------------------------------------------------- |
| `CHARGEPOINT_USERNAME`  | —       | ChargePoint account email                            |
| `CHARGEPOINT_PASSWORD`  | —       | ChargePoint account password                         |
| `CHARGEPOINT_DEVICE_ID` | —       | Numeric device ID of the home charger                |
| `TESLA_CLIENT_ID`       | —       | App client ID from developer.tesla.com               |
| `TESLA_CLIENT_SECRET`   | —       | App client secret                                    |
| `TESLA_REFRESH_TOKEN`   | —       | Refresh token from one-time OAuth setup              |
| `TESLA_ENERGY_SITE_ID`  | —       | Numeric energy site ID from Tesla Fleet API          |
| `SOLAR_WINDOW_START`    | `06:00` | Local time — no API calls before this hour (`HH:MM`) |
| `SOLAR_WINDOW_END`      | `20:00` | Local time — no API calls after this hour (`HH:MM`)  |
| `SUNKEEP_ENABLED`       | `true`  | Start polling automatically on server boot           |
| `SUNKEEP_SOE_THRESHOLD` | `95`    | Minimum battery % to allow charging (0–100)          |

> The Tesla Fleet API reports battery SOE as a float that may read 99.7–99.9% when physically full. The default threshold of 95 avoids the automation being permanently blocked by minor SOE fluctuations.

## REST Endpoints

### `GET /sunkeep/status`

Returns the current automation state and live solar/battery snapshot.

**Response:**

```json
{
	"state": "CHARGING",
	"enabled": true,
	"lastPollAt": "2026-05-10T13:00:00.000Z",
	"activeSession": {
		"sessionId": 12345,
		"currentAmps": 16,
		"startedAt": "2026-05-10T12:50:00.000Z"
	},
	"solarKw": 5.2,
	"excessKw": 3.8,
	"batteryPct": 99.1
}
```

---

### `POST /sunkeep/enable`

Enable automation. Transitions state from `DISABLED` → `IDLE` and begins polling.

**Response:** `200` with current status object.

---

### `POST /sunkeep/disable`

Disable automation. Stops any active charging session (reason: `manual`) and transitions to `DISABLED`.

**Response:** `200` with current status object.

---

### `POST /sunkeep/charge/start`

Manually start a charging session, bypassing the solar window and threshold checks. Uses current solar surplus to calculate amperage; falls back to minimum 8A if there's no excess.

**Response:** `200` with current status. `500` if the ChargePoint API call fails.

---

### `POST /sunkeep/charge/stop`

Manually stop the active charging session (reason: `manual`).

**Response:** `200` with current status. `500` if the ChargePoint API call fails.

---

### `GET /sunkeep/events`

Paginated list of charging events, newest first.

**Query params:**

| Param   | Default | Description                |
| ------- | ------- | -------------------------- |
| `page`  | `1`     | Page number                |
| `limit` | `20`    | Results per page (max 100) |

**Response:**

```json
{
	"events": [
		{
			"id": "a1b2c3...",
			"startedAt": "2026-05-10T12:50:00.000Z",
			"stoppedAt": "2026-05-10T15:30:00.000Z",
			"stopReason": "solar_dropped",
			"startAmps": 16,
			"endAmps": 8,
			"peakSolarKw": 6.1,
			"energyKwh": 12.4,
			"createdAt": "2026-05-10T12:50:00.000Z",
			"updatedAt": "2026-05-10T15:30:00.000Z"
		}
	],
	"total": 42,
	"page": 1,
	"limit": 20
}
```

---

### `GET /sunkeep/events/:id`

Single charging event by ID.

**Response:** `200` with event object. `404` if not found.

## Database Schema

```prisma
model ChargingEvent {
  id          String    @id @default(uuid())
  startedAt   DateTime  @default(now())
  stoppedAt   DateTime?
  stopReason  String?
  startAmps   Int
  endAmps     Int?
  peakSolarKw Float?
  energyKwh   Float?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

`energyKwh` is populated at session stop from the ChargePoint session data. `peakSolarKw` is updated live during charging whenever a higher reading is observed.

## Amperage Formula

```
target_amps = clamp(floor(excess_kw × 1000 / 240), 8, 32)
```

- Voltage: 240V (US Level 2)
- Minimum: 8A (~1.92 kW) — ChargePoint home charger minimum
- Maximum: 32A (~7.68 kW) — ChargePoint home charger maximum
- Start/stop threshold: 1.5 kW — at 1.5–1.92 kW excess the charger runs at the minimum 8A, drawing slightly more than available; the ~0.4 kW deficit is an accepted trade-off to start charging earlier
