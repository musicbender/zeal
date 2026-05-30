# Error Handling

```typescript
import {
  ChargePoint,
  ChargerBusyError,
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
  } else if (err instanceof CommunicationError) {
    console.error(`API error ${err.statusCode}:`, err.message);
  }
}
```

## Error hierarchy

```
APIError
├── CommunicationError         (non-2xx response)
│   ├── ChargerBusyError       (charger busy — HTTP 422, errorId 89)
│   ├── LoginError             (authentication failed)
│   └── InvalidSession         (session expired — HTTP 401)
└── DatadomeCaptcha            (Datadome bot protection — HTTP 403)
```

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
