# Session ID Resolution

## The problem this solves

ChargePoint's REST API exposes an active charging session through two independent
"planes," and neither is guaranteed to have it:

- **Driver plane** — `getUserChargingStatus()`, bound to the authenticated account. Works
  regardless of how the session was started (app tap-to-start, RFID, auto-start on
  plug-in, or this library's `startChargingSession`), as long as the session belongs to
  the logged-in driver.
- **Device plane** — `getHomeChargerStatus()`, bound to the physical charger. Surfaces a
  `sessionId` only when the charger model's status endpoint happens to include one — some
  models don't.

`ChargingSession.resolveActiveByDevice()` (used by `stopChargingSession(deviceId)`),
`getHomeChargerSession()`, and `startChargingSession()` all try both planes and merge the
result. What changed is that the driver plane used to be silently broken.

### Sessions are always tied back to a device

Because the driver plane reports whatever session the *account* is running, it may name a
different charger than the one you asked about. Every resolution path therefore accepts a
driver-plane session only when it either names your device, or names no device at all —
in which case the device plane must independently report that charger as `CHARGING`
before the session is claimed. Without that check, a two-charger household could get back
the wrong charger's session and stop the wrong car.

## Why this used to fail for auto-started sessions

`getUserChargingStatus()` had three independent bugs that, together, made it return `null`
unconditionally:

1. **Token corruption.** `coulomb_sess` cookie values can contain percent-encoded bytes
   (e.g. `...%23D147a153`). The client called `decodeURIComponent()` on the token before
   resending it, corrupting it on every request after the first. The server treats the
   token as opaque and expects the exact issued bytes back — a decoded token isn't
   rejected with an error, it just looks like an invalid session (an empty, clean-looking
   response).
2. **Wrong response keys.** The method read `data.user_status.charging_status` with
   snake_case fields (`session_id`, `start_time`, `current_charging`, station `.id`). The
   real API nests the session under `data.user_status.charging`, camelCase
   (`sessionId`, `startTimeUTC`, `state`, station `.deviceId`). `charging_status` was
   always `undefined`, so this path always fell through to `null`.
3. **Fictional auth headers.** The client sent `cp-session-type`, `cp-session-token`, and
   `cp-region` headers on every request. The real ChargePoint web app never sends these —
   confirmed across every endpoint via HAR capture. They were harmless (silently ignored
   by endpoints that also got a valid cookie), so they never caused a visible failure, but
   they also never helped.

Bug #2 alone means this method likely never once returned non-null against live traffic.
That made the driver-plane fallback silently fail for **every** session, not just
auto-started ones — it just showed up most visibly on `CPH50`-family home chargers,
because `getHomeChargerStatus()` also doesn't surface a `sessionId` for that model,
leaving no fallback at all. Public-station and API-started sessions usually had a
device-plane or start-acknowledgement session id to fall back on, which is why the driver
plane's failure went unnoticed for so long.

No WebSocket work is needed here. `publish.chargepoint.com/pub-prod` (the WS endpoint
ChargePoint's discovery config actually advertises) is a generic notification bus, not a
session-data channel — confirmed via HAR. The REST API had the data the whole time.

## How to resolve a session id today

For home chargers, `getHomeChargerSession()` is the recommended entry point — it already
tries the device plane then the driver plane, and backfills `deviceId`/`outletNumber` when
the resolved session omits them:

```typescript
const session = await client.getHomeChargerSession(chargerId);
if (session) {
  console.log(session.sessionId);
  await session.stop();
}
```

`getUserChargingStatus()` is the driver-plane primitive underneath it, useful directly when
you don't have a specific `chargerId` in hand yet (e.g. resolving whatever the driver is
currently charging):

```typescript
const status = await client.getUserChargingStatus();
if (status) {
  console.log(status.sessionId);   // 1234567890
  console.log(status.state);       // "in_use"
  console.log(status.startTime);   // Date — when the session began; the only source of
                                    // this for an auto-started session, since you never
                                    // called startChargingSession() yourself
  console.log(status.asOf);        // Date — server time this snapshot reflects

  const session = await client.getChargingSession(status.sessionId);
  await session.stop();
}
```

Returns `null` when the driver has no active session — including when the active session
belongs to a different plane entirely (e.g. a device-plane-only session on a charger model
that doesn't echo it back driver-side).

If you hit `UnresolvedSessionError` from `stopChargingSession(deviceId)`, both planes
genuinely came back empty for that device — see
[Error Handling](error-handling.md#unresolvedsessionerror).

## Troubleshooting with curl/Postman

If you're debugging directly against `mc.chargepoint.com` (or any other ChargePoint host)
outside this library:

- **Auth is cookie-only.** Send `coulomb_sess=<token>` as a `cookie` header. Nothing else
  is required — no `cp-session-type`, `cp-session-token`, or `cp-region` headers.
- **Never decode the token.** Treat `coulomb_sess` as an opaque byte string, exactly as
  issued in `Set-Cookie`. Percent-decoding it produces a token the server silently treats
  as invalid.
- **`ci_ui_session` is unconfirmed but included for parity.** Live captures of
  `mc.chargepoint.com/map-prod/v2` also show a second cookie, `ci_ui_session`, alongside
  `coulomb_sess`. Whether it's actually required hasn't been isolated — this library
  doesn't send it and works without it in testing so far. The
  [Postman collection](../chargepoint.postman_collection.json) includes it as an optional
  `ci_ui_session` variable on the three `mapcacheEndpoint` requests, empty by default, in
  case you want to test with it present.
- **`getUserChargingStatus()`'s request body must include `mfhs`.** `{ user_status: { mfhs:
  {} } }` — the API appears to require the key to be present at all; it's unclear whether
  its value matters.

The fastest way to try this by hand is the **Account > Get User Charging Status** request
in the [Postman collection](../chargepoint.postman_collection.json) — run **Setup > Fetch
Global Config** and **Authentication > Login with Password** first to populate
`coulombToken`.
