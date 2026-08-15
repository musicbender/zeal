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

<!--
Copy this template per session:

### YYYY-MM-DD — <what was attempted>

**Method:** (discovery dump / browser WS capture / APK static / other)
**Result:**
**Raw frames / evidence:** (paste redacted excerpts, or link to out/*.redacted.*)
**Next step:**
-->
