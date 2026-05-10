# Error Handling

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

## Error hierarchy

```
APIError
├── CommunicationError     (non-2xx response)
│   ├── LoginError         (authentication failed)
│   └── InvalidSession     (session expired — HTTP 401)
└── DatadomeCaptcha        (Datadome bot protection — HTTP 403)
```
