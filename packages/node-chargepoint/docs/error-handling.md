# Error Handling

```typescript
import {
  ChargePoint,
  ChargerBusyError,
  VehicleNotReadyError,
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
  } else if (err instanceof ChargerBusyError) {
    console.error('Charger is busy — try again shortly');
  } else if (err instanceof VehicleNotReadyError) {
    console.error('Vehicle not ready to charge:', err.body?.errorMessage);
  } else if (err instanceof CommunicationError) {
    console.error(`API error ${err.statusCode}:`, err.message, err.body);
  }
}
```

## Error hierarchy

```
APIError
├── CommunicationError              (non-2xx response)
│   ├── ChargerBusyError            (charger busy — HTTP 422, errorId 89)
│   ├── VehicleNotReadyError        (vehicle not ready to charge, e.g. at charge limit — HTTP 422, errorId 25)
│   ├── NoActiveSessionError        (stop for a missing session — HTTP 422, errorId 165)
│   ├── LoginError                  (authentication failed)
│   └── InvalidSession              (session expired — HTTP 401)
├── UnresolvedSessionError          (no active session could be resolved for a device-level stop)
├── StartVerificationTimeoutError   (start ack'd but no session appeared in time)
└── DatadomeCaptcha                 (Datadome bot protection — HTTP 403)
```

Every `CommunicationError` thrown from `sendCommand` (the shared start/stop implementation behind `startChargingSession`, `stopChargingSession`, and `ChargingSession.stop`) carries the parsed ChargePoint error response on `.body`, whether or not it matches one of the typed subclasses above. `.message` is always a human-readable string — either the API's own `errorMessage`, or a generic fallback — and never has JSON embedded in it, so `.body` (typed as `ChargePointCommandErrorBody`) is the place to look for structured details.

## `ChargerBusyError`

Thrown by `startChargingSession` and `stopChargingSession` (and `ChargingSession.stop`) when the ChargePoint API responds with HTTP 422 and `errorId` 89 — indicating the charger is mid-handshake or otherwise not ready to accept a start/stop command. Retry after a short delay.

```typescript
import { ChargerBusyError } from 'node-chargepoint';

try {
  await client.stopChargingSession(deviceId);
} catch (err) {
  if (err instanceof ChargerBusyError) {
    // err.statusCode === 422
    console.error('Charger busy, retrying…');
  }
}
```

## `VehicleNotReadyError`

Thrown by `startChargingSession` and `stopChargingSession` (and `ChargingSession.start`/`.stop`) when the ChargePoint API responds with HTTP 422 and `errorId` 25 — indicating the vehicle isn't in a state that can (dis)charge right now, e.g. it's already at its charge limit. Unplug and reconnect the vehicle, or retry later.

```typescript
import { VehicleNotReadyError } from 'node-chargepoint';

try {
  await client.startChargingSession(deviceId);
} catch (err) {
  if (err instanceof VehicleNotReadyError) {
    // err.statusCode === 422, err.body?.errorId === 25
    console.error('Vehicle not ready:', err.message);
  }
}
```

## `UnresolvedSessionError`

Thrown by `stopChargingSession(deviceId)` (and `ChargingSession.stopByDevice`) when no active charging session can be resolved for the device. A device-level stop must carry the real session id — sending `sessionId: 0` is rejected by ChargePoint — so the library first resolves the active session via the driver plane (`getUserChargingStatus`) and then the device plane (`getHomeChargerStatus`). If neither yields a session id, this error is thrown instead of a misleading `NoActiveSessionError`. The offending device id is available as `err.deviceId`.

### Home-charger sessions with no `device_id` in the driver-bff response

On some home-charger sessions, the driver-bff `/sessions/{id}` response omits `device_id`
and `outlet_number` entirely, rather than nesting them under a different key. Left
unhandled, this meant `ChargingSession.deviceId`/`.outletNumber` stayed at the class default
of `0`, which broke device-level stops in two ways:

- `session.stop()` sent `deviceId: 0` in the stop command body, which ChargePoint silently
  ignored instead of stopping the real charger.
- `resolveActiveByDevice`'s device-match check (`session.deviceId === deviceId`), added to
  stop `stopChargingSession()` from ever targeting the wrong charger in a multi-charger
  household, rejected the session — even though it was the correct one — and fell through
  to `UnresolvedSessionError`.

The fix does not depend on any particular response shape: when a resolved session's
`deviceId` comes back as `0`, the library corroborates against the device plane
(`getHomeChargerStatus(deviceId)`) — only once that device itself reports `CHARGING` does
it accept the session as belonging to `deviceId` and backfill `deviceId`/`outletNumber`
(the latter defaulting to `1`, i.e. the charger's only outlet) from the context it already
resolved for, rather than an echo the API may never provide. `getHomeChargerSession()`
applies the same backfill unconditionally, since it already queried that specific charger.

```typescript
import { UnresolvedSessionError } from 'node-chargepoint';

try {
  await client.stopChargingSession(deviceId);
} catch (err) {
  if (err instanceof UnresolvedSessionError) {
    console.error(`No active session found for device ${err.deviceId}`);
  }
}
```

### Resolved: auto-started sessions were unresolvable due to three bugs, not a WebSocket gap

Earlier versions of this library couldn't resolve a session id for an EV session that
auto-starts on plug-in (no app/RFID interaction), and this section used to document that as
a known limitation requiring WebSocket support. That theory was wrong — investigation found
three unrelated bugs in `getUserChargingStatus()` (the driver-plane resolution path) that
together made it return `null` unconditionally, masking session data the REST API had all
along. No WebSocket work was needed. See
[Session ID Resolution](session-id-resolution.md) for the full explanation and current
usage examples.
