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

<!--
Copy this template per session:

### YYYY-MM-DD — <what was attempted>

**Method:** (discovery dump / browser WS capture / APK static / other)
**Result:**
**Raw frames / evidence:** (paste redacted excerpts, or link to out/*.redacted.*)
**Next step:**
-->
