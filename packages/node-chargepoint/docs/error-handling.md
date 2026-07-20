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

### Known limitation: some home chargers never surface a session id over REST

For an EV session that auto-starts on plug-in (no app/RFID interaction), both resolution
paths can come back empty depending on the charger model:

- `getUserChargingStatus()` — the driver plane — was verified live to return an empty
  `user_status: {}` for an actively-charging home session, regardless of request body.
- `getHomeChargerStatus()` — the device plane — was verified live to return no
  `sessionId`/`energyKwh`/`powerKw`/`sessionStartTime` fields at all for a
  `CPH50`-family charger, despite `chargingStatus: "CHARGING"`.

ChargePoint's own service discovery config advertises a model-specific WebSocket channel
for these chargers (`kestrel_websocket_endpoint`, scoped to the `CPH50` family) separate
from the REST `hcpo-charger-management` API this library uses. That suggests live session
state and control for these models may be WebSocket-native rather than REST-polled — which
this library does not implement.

**Net effect:** for a charger in this situation, `stopChargingSession(deviceId)` /
`ChargingSession.stopByDevice()` cannot resolve a session and will throw
`UnresolvedSessionError` rather than silently failing or sending a bogus stop command. This
is considered correct, honest behavior — not a bug — until WebSocket support is added (see
the library's issue tracker for status). Sessions started via this library's own
`startChargingSession()` are unaffected, since the session id is captured directly from the
start acknowledgement.
