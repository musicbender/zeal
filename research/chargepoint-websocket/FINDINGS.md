# Findings Log

Living record of confirmed facts from this research. Append, don't rewrite — if something
gets superseded, strike it through rather than deleting, so the trail of reasoning survives.

## Known going in (from node-chargepoint / python-chargepoint source, 2026-08-15)

- Discovery API (`POST https://discovery.chargepoint.com/discovery/v3/globalconfig`)
  advertises two websocket endpoints that neither library connects to:
  - `pandaWebsocketEndpoint` = `wss://panda.chargepoint.com`
  - `websocketEndpoint` = `wss://ws.chargepoint.com`
- "Panda" is ChargePoint's internal codename for a home charger — confirmed via a debug
  log string in `mbillow/python-chargepoint`'s `get_home_charger_status()`:
  `_LOGGER.debug("Getting status for panda: %s", charger_id)`. `pandaWebsocketEndpoint` is
  therefore the more likely candidate for home-charger live telemetry.
- `docs/error-handling.md` in `musicbender/node-chargepoint` references a
  `kestrel_websocket_endpoint` scoped to the CPH50 family, seen in a prior session but not
  parsed by either library and not present in the committed test fixture
  (`tests/fixtures/global-config.json`) — unconfirmed against a live response as of this
  writing.
- Prior session (per user) already tried "various REST API guesses" for the session id
  with no luck — REST enumeration is not a fresh lead, deprioritized in favor of WS/APK
  recon.
- This sandboxed environment's egress proxy blocks `chargepoint.com` outright (403 on
  CONNECT) — all live probing must run from a machine with real network access (user's
  laptop, confirmed available and already authenticated to their ChargePoint account).

## Session log

### 2026-08-15 — Discovery dump, live

**Method:** `01-discovery-dump.sh` run from user's laptop against the real discovery API.

**Result:**

- All 9 request variants (baseline, empty body, mobile/browser UA, iOS/Android device type,
  `model: CPH50`, `deviceType: PANDA`, region EU) returned **byte-identical 20913-byte
  responses**. The discovery API does not branch on region, device type, model, or UA —
  it's one universal config. No further variant-probing along this axis is worth doing.
- Alternate version paths `/discovery/v{1,2,4}/globalconfig` all returned HTTP 200 (body
  not yet compared — `/v3/config` and `/v3/globalconfig/mobile` 404). Unknown whether v1/v2/v4
  bodies differ from v3; low priority since v3 already yields everything below.
- Live payload has **26 endpoint keys**, not the 12 `node-chargepoint` parses. 14 are
  currently discarded. Full list in the raw capture; the relevant ones:

  | Key | Value | Note |
  | --- | --- | --- |
  | `kestrel_websocket_endpoint` | `wss://homecharger-cph50k-na.chargepoint.com:443/ws-prod/panda/v1` | **CPH50-scoped. Confirmed real — was previously only a memory from a prior session.** Not parsed by node-chargepoint or python-chargepoint. `dataDome: true`. |
  | `hcpo_auth_endpoint` | `https://internal-api-us.chargepoint.com/hcpo-token-exchange/` | Likely exchanges `coulomb_sess` for a credential the HCPO (home-charger) system — possibly the websocket — actually accepts. Not parsed by either library. |
  | `station_updates_live_endpoint` | `wss://internal-api-us.chargepoint.com/a/0/cposvc/station-live/v1/station-updates/live` | Probably public station-map live status, not home-charger session telemetry. Lower priority. |
  | `driver_bff_endpoint` | `https://internal-api-us.chargepoint.com/driver-bff/` | A *second*, newer driver-bff host distinct from the `cpapi.chargepoint.com` one node-chargepoint's `internalApiGatewayEndpoint` currently uses. Unclear if both are live or one is legacy. |

  Full 14-key discard list also includes chatbot/CCaaS, fraud-detection, route-planning,
  smart-car-integration, installer-app, and org-management endpoints — not relevant to this
  investigation, noted for completeness only.

- **Correction to the "known going in" section above:** `panda_websocket_endpoint`'s live
  value is `wss://homecharger-na.chargepoint.com:443/ws-prod/panda/v1`, **not**
  `wss://panda.chargepoint.com` as the committed node-chargepoint test fixture
  (`tests/fixtures/global-config.json`) claims. The fixture value looks fabricated/placeholder
  rather than sourced from a real response — parsing logic itself is fine (it does correctly
  extract whatever `panda_websocket_endpoint` contains), just the fixture data is stale/wrong.
  Worth a follow-up fix in `node-chargepoint` independent of this research.

- Both `kestrel_websocket_endpoint` and `panda_websocket_endpoint` share the identical path
  `/ws-prod/panda/v1` on different hosts — suggests one uniform "panda v1" protocol, sharded
  by charger family/region, rather than two different protocols. If true, we only need to
  reverse-engineer it once.

**Raw evidence:** `out/baseline-na.json` on the user's laptop (gitignored, not committed).

**Next step:** Browser WS capture, retargeted at the *real* hostnames now known
(`homecharger-cph50k-na.chargepoint.com`, `homecharger-na.chargepoint.com` — not the
placeholder `panda.chargepoint.com`/`ws.chargepoint.com` originally assumed), and watching
the Fetch/XHR tab for a call to `hcpo-token-exchange` immediately before/during the WS
handshake — that call's response is the likely source of the socket's auth credential.

### 2026-08-16 — HAR capture from `driver.chargepoint.com` (real driver portal), live active session

**Method:** Browser HAR export from `https://driver.chargepoint.com/charging-activity` (note:
`mc.chargepoint.com` 404s now — `driver.chargepoint.com` is the current React SPA portal;
`mc.chargepoint.com` survives only as an API host, not a UI). Captured with a genuinely
active home-charger session in progress (~106 min elapsed at capture time, Home Flex / "CP
HOME", Hyundai Ioniq 6). 60 total network entries.

**Result — the WebSocket lead is a dead end (for now):**

Exactly one WS connection: `wss://publish.chargepoint.com/pub-prod/pub/v1` (entry 38, matches
discovery's `websocket_endpoint`, **not** `panda_`/`kestrel_websocket_endpoint` — those two
never appear anywhere in this capture, meaning the driver SPA doesn't use them, or doesn't use
them on this page). It sent one frame:

```
→ {"seq":100,"name":"subscribe","data":{"topics":["device_status_change"]}}
← {"data":{"error_message":"missing connection id","status":false},"name":"subscribe","seq":100}
```

Subscribe rejected — the client needs a "connection id" from somewhere else first, and nothing
in this capture ever supplied one. Whatever this channel is for, it isn't delivering session
data here; it reads like a generic "something changed, go re-fetch" notification bus rather
than a data carrier. No `hcpo-token-exchange` call appears anywhere in the capture either — the
token-exchange theory from the previous session doesn't hold up against real traffic.

**Result — the actual answer was hiding in REST, in code that already exists:**

The session id first appears (entry 33, ~60ms before the WS even connects) in a call to
`node-chargepoint`'s **already-implemented** `getUserChargingStatus()` endpoint —
`POST {mapcacheEndpoint}/v2` with a `user_status` body — just with a different request field
than the library sends (`{"mfhs":{}}` vs. the library's `{"timestamp": Date.now()}}`; unclear
yet whether that difference matters or is coincidental):

```
→ {"user_status":{"mfhs":{}}}
← {"user_status":{"charging":{
     "sessionId":5428468691,
     "startTimeUTC":1786832584,
     "currentTimeUTC":1786838952,
     "state":"in_use",
     "stations":[{"deviceId":17618011,"lat":33.65...,"lon":-117.57...,"name":"CP HOME / <redacted-serial>"}]
  }}}
```

**Root cause: `node-chargepoint`'s parser is looking for the wrong keys.**
`client.ts` `getUserChargingStatus()` reads `data.user_status.charging_status` (snake_case
container, then `.session_id`/`.start_time`/`.current_charging`, station objects keyed by
`.id`). The live API nests under `data.user_status.charging` (**not** `charging_status`) with
**camelCase** fields (`sessionId`, `startTimeUTC`, `currentTimeUTC`, `state`), and station
objects keyed by `deviceId`, not `id`. Since `userStatus.charging_status` is `undefined` on
every real response, `if (!charging) return null` fires unconditionally —
**`getUserChargingStatus()` has likely never once returned non-null against the live API**,
regardless of charger model or how the session started. This is the mechanism behind the
"verified live to return an empty `user_status: {}}`" limitation documented in
`docs/error-handling.md` — from the outside it looked like the API had nothing to give;
actually the parser just couldn't read what was there.

A corresponding follow-on call (entries 40/54) confirms the richer per-session detail shape
too: `POST {mapcacheEndpoint}/v2` with `{"charging_status":{"mfhs":{},"session_id":<id>}}`
(note: here the *outer* request key genuinely is `charging_status` — that's the request
envelope name, unrelated to the response's `charging` key) returns full session telemetry
(`device_id`, `energy_kwh`, `power_kw`, `vehicle_info`, live `update_data` samples) keyed in
snake_case, matching what `session.ts`'s `refresh()` already expects from the driver-bff host
— so that path's parsing looks correct as-is; it's specifically `getUserChargingStatus()`'s
key names that are stale.

**Open question:** this HAR captures a session that was already ~106 minutes in when the
portal loaded — unknown whether it was originally auto-started (plug-in, no app/RFID) or
driver-initiated. `getMyConnectionObjects` (entry 27) returned an employer-sponsored charging
network binding, unrelated to this device. Need to confirm the parser fix actually resolves
`UnresolvedSessionError` specifically for a **freshly auto-started** CPH50 session (unplug,
replug, don't touch the app) before calling this closed — it's possible a genuinely
zero-driver-interaction auto-start still comes back with an empty `charging_status`/`charging`
block for a different reason than the one just found. But the key-name bug is real and
reproducible regardless, and worth fixing independent of that outcome.

**Raw evidence:** `capture.har` on the user's laptop (not committed; contains session
cookies). Analyzed via a throwaway script against a copy in this session's scratchpad, not
committed to the repo.

**Next step:**
1. Patch `node-chargepoint`'s `getUserChargingStatus()` to read `charging`/camelCase/
   `deviceId` instead of `charging_status`/snake_case/`id`.
2. Re-test against a **freshly auto-started** (unplug/replug, no app) CPH50 session to see if
   `UnresolvedSessionError` goes away now that the driver-plane fallback can actually see data.
3. If confirmed, this closes (or mostly closes) the original ask without touching WebSockets
   at all. If auto-start still comes back empty even with the parser fixed, *then* the
   WS/APK-static track becomes relevant again — but not before this cheaper fix is ruled out.

### 2026-08-16 — Postman/curl validation of both fixes, live

**Method:** Manual curl testing against `mc.chargepoint.com/map-prod/v2` using freshly
copied browser cookies, iterating on header/cookie shape until it matched real traffic
exactly (several failed attempts along the way had stale reused tokens, duplicate cookie
entries, and cookie-export-tool artifacts like a stray `Cookie_1=value` — none of those
were code or auth-model problems, just assembly mistakes in manual testing).

**Result:** Confirmed working. `getUserChargingStatus()`'s two fixes both hold up against
live traffic:
1. Opaque `coulomb_sess` handling (no `decodeURIComponent`) — a token containing `%23`
   round-trips correctly now.
2. `mapcacheEndpoint` (`mc.chargepoint.com`) auth model — no `cp-session-*` headers, cookie
   jar needs `ci_ui_session` alongside `coulomb_sess`, plus a browser-realistic header set
   (origin/referer/sec-fetch-*/etc.) — confirmed as the actual requirement, not
   over-engineering.

The response returned full session data (`sessionId`, `state`, `stations`) for an
**app/portal-started** session — confirms the parser fix and the mapcache auth model are
both correct. Does **not yet** confirm the original ask: whether this resolves
`UnresolvedSessionError` for a **freshly auto-started** (car plugged in, zero app/RFID
interaction) CPH50 session specifically — that's still the one open question from the
2026-08-16 HAR-capture entry above.

**Next step:** Same as before — test against a genuinely auto-started session (unplug,
replug, don't touch the app) before considering the original CPH50 stop-session problem
fully closed. If it also resolves there, this is done. If auto-start still comes back
empty even with both fixes in place, that's a real, different signal worth investigating
(possibly session binding genuinely differs for auto-start vs. driver-initiated sessions at
the API level, independent of the bugs found so far) — and only then does the WS/APK-static
track become relevant again.

### 2026-08-16 — CONFIRMED: auto-started CPH50 session resolves cleanly. Original problem solved.

**Method:** Unplugged and replugged the car (zero app/RFID interaction, genuine auto-start
on plug-in — the exact scenario `docs/error-handling.md`'s known limitation describes) and
called `getUserChargingStatus()` (`mc.chargepoint.com/map-prod/v2`, `user_status` request)
before and after the replug, using both fixes from this branch (opaque `coulomb_sess`,
`mapcacheEndpoint` auth model with `ci_ui_session` + browser headers).

**Result:** Both auto-started sessions — the one already running, and the new one created
by the replug — returned fully populated data:

```
sessionId: 5429277421 → (replug) → sessionId: 5429306431
state: "in_use" for both, stations[0].deviceId: 17618011 (the CPH50) for both
```

**This is the answer to the original question.** No session id was ever actually missing
from the REST API for auto-started sessions — `getUserChargingStatus()` was always capable
of resolving them, but two independent bugs in `node-chargepoint` masked it:
1. `_setToken`/`_request()` corrupted any `coulomb_sess` token containing reserved
   characters by decoding it before every replay.
2. The response parser looked for the wrong container key (`charging_status` snake_case
   instead of the real `charging` camelCase), so even a correctly-authenticated response
   was silently discarded as "no session."

With both fixed, `ChargingSession.resolveActiveByDevice()`'s existing driver-plane
resolution path (`getUserChargingStatus()` → `getChargingSession()`) should now succeed for
auto-started CPH50 sessions, meaning `stopChargingSession(deviceId)` should work end-to-end
without ever needing the WebSocket channel.

**No WebSocket reverse-engineering is needed to close the original ask.** The
`kestrel_websocket_endpoint`/`panda_websocket_endpoint` findings from earlier in this branch
remain documented above as a real, confirmed discovery (unused endpoints, real live-telemetry
channel for CPH50) in case live push-based session updates become independently interesting
later — but they were never actually required to solve "how do we get a session id to stop a
session."

**Next step:** Land the PR (`src/client.ts` + test fixture/assertion updates, both already
passing 84/84 locally) on `musicbender/node-chargepoint`, bump the dependency in `zeal`'s
`apps/gaspar/package.json`, and confirm `stopChargingSession()` actually stops a live
auto-started session end-to-end (the Postman "Stop Session — Send Command" request, using
the now-resolvable `sessionId`/`deviceId`) as final real-world validation.

<!--
Copy this template per session:

### YYYY-MM-DD — <what was attempted>

**Method:** (discovery dump / browser WS capture / APK static / other)
**Result:**
**Raw frames / evidence:** (paste redacted excerpts, or link to out/*.redacted.*)
**Next step:**
-->
