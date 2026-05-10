# Sunkeep — Design Spec

**Date:** 2026-05-10  
**Status:** Approved  
**Feature:** Solar-powered car charging automation in `apps/gaspar`

---

## Overview

Sunkeep is a background automation service in gaspar that monitors excess solar energy and automatically charges a Tesla car via a ChargePoint home charger. It starts a charge session only when the Powerwall battery is at 100% (no grid export needed, no battery drain), sets charge amperage based on current excess solar, and adjusts every 10 minutes. Charging stops when excess solar drops below the minimum threshold, the car is unplugged, solar drops to zero (night), or the user disables automation.

---

## Goals

- Charge the car exclusively on excess solar energy
- Never draw from the Powerwall battery
- Never export unused solar to the grid when the car is available
- Provide REST endpoints for dashboard status display and manual control
- Persist each charging session as a `charging_event` DB record

---

## Architecture

### File Structure

```
apps/gaspar/src/sunkeep/
  sunkeep.plugin.ts        ← Fastify plugin: wires service + scheduler + routes
  sunkeep.service.ts       ← State machine + all automation logic
  sunkeep.scheduler.ts     ← node-cron job management
  sunkeep.routes.ts        ← REST endpoints
  powerwall.client.ts      ← Thin adapter over the powerwall2 npm package
  sunkeep.types.ts         ← Shared types and enums
```

Follows the existing gaspar pattern: one service class, one routes file, registered via `main.ts`. The Fastify plugin approach adds lifecycle hooks (`onReady` / `onClose`) so the scheduler starts and stops cleanly with the server.

### New Dependencies

| Package                  | Source       | Purpose                          |
| ------------------------ | ------------ | -------------------------------- |
| `node-chargepoint@0.4.0` | npm (public) | ChargePoint home charger control |
| `powerwall2`             | npm          | Local Powerwall gateway adapter  |
| `node-cron`              | npm          | Cron-style job scheduling        |

---

## State Machine

`SunkeepService` holds one of five states:

| State      | Meaning                                                               |
| ---------- | --------------------------------------------------------------------- |
| `DISABLED` | Automation off — no polling, no API calls                             |
| `IDLE`     | Enabled, polling, car not plugged in                                  |
| `WAITING`  | Car plugged in, insufficient excess solar (< 1.5 kW) or battery < 95% |
| `CHARGING` | Active session in progress, amps adjusting every 10 min               |
| `ERROR`    | A recoverable error occurred — logged, retried next poll cycle        |

---

## Polling Logic (single loop, every 10 minutes)

```
1. Is automation enabled?
   - No → exit (state = DISABLED)

2. Is current time within solar window (SOLAR_WINDOW_START – SOLAR_WINDOW_END)?
   - No → exit (no API calls made)

3. ChargePoint: getHomeChargerStatus
   - isPluggedIn = false → state = IDLE, exit

4. Powerwall: getSystemStateOfEnergy + getMetersAggregates
   - solar_kw == 0 AND state == CHARGING → stop session (reason: night_safety), update ChargingEvent, state = IDLE, exit
   - solar_kw == 0 → state = IDLE, exit
   - battery_pct < 95 AND state == CHARGING → stop session (reason: battery_depleted), update ChargingEvent, state = WAITING, exit
   - battery_pct < 95 → state = WAITING, exit

5. excess_kw = solar_kw - load_kw
   target_amps = clamp(floor(excess_kw * 1000 / 240), 8, 32)

   - excess_kw < 1.5 AND state == CHARGING → stop session (reason: solar_dropped), update ChargingEvent, state = WAITING, exit
   - excess_kw < 1.5 → state = WAITING, exit

6. state == IDLE or WAITING:
   - setAmperageLimit(target_amps)
   - startChargingSession(CHARGEPOINT_DEVICE_ID)
   - Insert ChargingEvent (startedAt, startAmps, initial solar/battery snapshot)
   - state = CHARGING

7. state == CHARGING:
   - Recalculate target_amps
   - If target_amps differs from current → setAmperageLimit(target_amps)
   - Update peakSolarKw on ChargingEvent if current solar > stored peak
```

### Amps Formula

```
target_amps = clamp(floor(excessKw * 1000 / 240), 8, 32)
```

- Voltage: 240V (US Level 2 standard)
- Minimum: 8A (~1.92 kW) — ChargePoint home charger minimum
- Maximum: 32A (~7.68 kW) — ChargePoint home charger maximum
- Start/stop threshold: 1.5 kW — note that at 1.5–1.92 kW of excess, the charger runs at minimum 8A which slightly exceeds the available excess; the small deficit (~0.4 kW) is accepted as a deliberate trade-off to start charging earlier
- `possibleAmperageLimits` from the ChargePoint API is used to snap to valid values if the charger reports a non-contiguous set
- **SOE threshold:** The Powerwall reports SOE as a float that may hover at 99.7–99.9% when physically full. `battery_pct >= 95` is used as the "battery full" threshold to avoid the automation being permanently blocked by minor SOE fluctuations. This is configurable via `POWERWALL_SOE_THRESHOLD` env var (default: 95).

---

## Session Stop Reasons

| Reason             | Trigger                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `solar_dropped`    | Excess kW fell below 1.5 kW during active session                    |
| `night_safety`     | `solar_kw == 0` detected during active session                       |
| `battery_depleted` | Powerwall SOE dropped below 95% (configurable) during active session |
| `unplugged`        | `isPluggedIn` became false during active session                     |
| `manual`           | User called `POST /sunkeep/charge/stop` or `POST /sunkeep/disable`   |
| `error`            | Unrecoverable API error during active session                        |

---

## Database Schema

```prisma
model ChargingEvent {
  id            String    @id @default(uuid())
  startedAt     DateTime  @default(now())
  stoppedAt     DateTime?
  stopReason    String?
  startAmps     Int
  endAmps       Int?
  peakSolarKw   Float?
  energyKwh     Float?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@map("charging_event")
}
```

`energyKwh` is populated at session stop from the ChargePoint `ChargingSession.energyKwh` field.

---

## REST API Endpoints

### Automation Control

| Method | Path               | Description                                                                                                               |
| ------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/sunkeep/status`  | Current state, enabled flag, active session summary, last poll time, next poll countdown, current excess kW and battery % |
| `POST` | `/sunkeep/enable`  | Enable automation (begin polling)                                                                                         |
| `POST` | `/sunkeep/disable` | Disable automation; stops any active session (reason: `manual`)                                                           |

### Manual Charging Control

| Method | Path                    | Description                                                                                  |
| ------ | ----------------------- | -------------------------------------------------------------------------------------------- |
| `POST` | `/sunkeep/charge/start` | Manually start a session (bypasses solar check, uses current amperage calculation or min 8A) |
| `POST` | `/sunkeep/charge/stop`  | Manually stop the active session (reason: `manual`)                                          |

### Charging History

| Method | Path                  | Description                                                      |
| ------ | --------------------- | ---------------------------------------------------------------- |
| `GET`  | `/sunkeep/events`     | Paginated list of ChargingEvents (query params: `page`, `limit`) |
| `GET`  | `/sunkeep/events/:id` | Single ChargingEvent detail                                      |

---

## Environment Variables

```
# ChargePoint
CHARGEPOINT_USERNAME=
CHARGEPOINT_PASSWORD=
CHARGEPOINT_DEVICE_ID=       # numeric device ID of home charger

# Powerwall (local gateway)
POWERWALL_HOST=               # LAN IP, e.g. 192.168.1.100
POWERWALL_EMAIL=
POWERWALL_PASSWORD=

# Solar window (no API calls outside this range)
SOLAR_WINDOW_START=06:00
SOLAR_WINDOW_END=20:00

# Automation boot behavior
SUNKEEP_ENABLED=true          # start polling automatically on server start

# Powerwall SOE "battery full" threshold (0-100, default 95)
POWERWALL_SOE_THRESHOLD=95
```

---

## Error Handling

- Each poll tick is wrapped in a try/catch. Errors are logged with structured data (state, error message). State transitions to `ERROR` only during an active session; otherwise the service stays in its current state and retries next tick.
- `node-chargepoint` `InvalidSession` errors trigger a re-login and retry within the same tick (one retry).
- Powerwall auth failures are logged and the tick is skipped (the gateway token has a long TTL on LAN).
- All session stop actions (including error stops) write to the DB before state transition.

---

## Solar Window

`SOLAR_WINDOW_START` / `SOLAR_WINDOW_END` are `HH:MM` strings in local server time. The scheduler does not stop; every tick checks time first and exits before any API call if outside the window. This prevents unnecessary requests at night.

The `night_safety` stop reason provides a belt-and-suspenders guard: if a session is somehow active when `solar_kw == 0` is detected (e.g., the window was configured too wide), it stops immediately.

---

## Testing Strategy

- `SunkeepService` unit tests: mock ChargePoint client + Powerwall client, exercise all state transitions
- `SunkeepScheduler` unit tests: verify cron job start/stop behavior
- `powerwall.client.ts` unit tests: mock `powerwall2` responses, verify adapter output
- Routes integration tests: follow the `sensors.service.spec.ts` pattern
- No e2e tests against live hardware (ChargePoint/Powerwall are external)

---

## Out of Scope

- Tesla Fleet API / cloud integration (local gateway only)
- Multi-charger support
- Time-of-use pricing optimization
- Push notifications (can be added later)
- `apps/web` dashboard UI (separate feature, depends on these endpoints)
