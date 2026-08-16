# WebSocket Capture Playbook

Goal: catch the ChargePoint web portal (`mc.chargepoint.com`) opening a live WebSocket
connection for your CPH50 while it's charging, and read the frames.

This only works if the web portal shows **live** charger state (a wattage/amp reading that
updates without a page refresh, or a spinner that isn't just polling). If the portal's
charger detail page is static/refresh-only, it may not use the socket at all — note that
in `FINDINGS.md` and move to APK static analysis instead of pushing on this further.

## Setup

1. **Trigger the actual scenario.** The bug is specifically about _auto-started_ sessions —
   the car begins charging from being plugged in, not from tapping "start" in the app. If
   you have an active manual/app-started session, stop it, unplug, then plug back in and
   let it auto-start. If your car doesn't auto-start on plug-in, plug in and use the
   **ChargePoint app** (not this capture) to start it — some auto-start behavior only
   differs at the _stop_ resolution step, so a portal-started session may still reproduce
   the missing-session-id symptom. Try auto-start first; fall back to app-start if the car
   won't auto-start.

2. **Open Chrome, log into `https://mc.chargepoint.com`**, navigate to your home charger's
   detail/status page.

3. **Open DevTools → Network tab.** Do NOT filter to `WS` only this time — leave `Fetch/XHR`
   visible too (or use `All` and eyeball it). The discovery dump turned up
   `hcpo_auth_endpoint` = `https://internal-api-us.chargepoint.com/hcpo-token-exchange/`,
   which is a plain HTTPS call, not a socket — if the portal calls it before opening the
   websocket, filtering to `WS` only would hide it.

4. **Reload the page** with DevTools already open (Cmd+R) so both the token-exchange call
   and the WS handshake are captured from the start.

## What to capture

**First, the token exchange (if it happens):** find the request to
`internal-api-us.chargepoint.com/hcpo-token-exchange/` in the Fetch/XHR list. Capture its
full request (headers + body) and response (headers + body). This is the strongest
candidate for how the browser authenticates to the panda/kestrel socket — the discovery
config marks both websocket endpoints `"dataDome": true`, so a bare cookie replay from a
script may not be accepted; whatever this call returns is likely the real credential.

**Then, for each row that appears under the `WS` filter:**

- **Request URL** — full `wss://...` URL including query string
- **Status** — 101 (switching protocols) means it connected
- **Headers tab** → note `Sec-WebSocket-Protocol` (subprotocol) if present, and any custom
  headers ChargePoint sends (auth tokens, session ids)
- **Messages tab** — click the connection row, then Messages. Every frame appears here as
  it's sent/received, with a ↑ (client→server) or ↓ (server→client) arrow and a timestamp.
  Let it sit for 30–60 seconds while the charger is actively charging so you catch a live
  telemetry push, not just the handshake.

## What we're specifically looking for

- Any frame containing a numeric field that looks like a session id — cross-reference
  against `getChargingSession()` id shapes (`session_id`, `sessionId`) already known from
  the REST API. Large-ish integers, distinct from `deviceId`/`chargerId`/`userId`.
- The **subscribe/auth handshake** — the first client→server frame(s) after connect. This
  tells us whether the socket needs the `coulomb_sess` token, the token from
  `hcpo-token-exchange` above, or the `chargerId`/MAC to subscribe to that specific
  charger's channel.
- **Which host actually gets used.** Confirmed live (2026-08-15 discovery dump — see
  `FINDINGS.md`), the real candidates are:
  - `wss://homecharger-cph50k-na.chargepoint.com:443/ws-prod/panda/v1` — **CPH50-specific,
    top candidate.**
  - `wss://homecharger-na.chargepoint.com:443/ws-prod/panda/v1` — general home-charger
    channel, same path, different host.

  Both are marked `dataDome: true` in the discovery response. Ignore
  `panda.chargepoint.com` / `ws.chargepoint.com` — those were placeholder values from a
  stale test fixture, not real hostnames; if you see either in real traffic that's itself
  worth noting since it'd mean the fixture wasn't as fake as it looked.

## Exporting for analysis

1. Right-click any WS row → **Copy → Copy as HAR** (or DevTools → Network → the down-arrow
   "Export HAR" button for the whole session) — this preserves WS frames, not just the
   handshake.
2. Save it into `out/capture.har` (already gitignored).
3. Run the redactor before sharing:
   ```bash
   python3 redact.py out/capture.har
   ```
4. Also just paste the raw frame contents from the Messages tab into `FINDINGS.md` under
   "Raw frames" — HAR sometimes doesn't capture WS message bodies depending on Chrome
   version; having both is cheap insurance.

## If Chrome shows nothing under WS

Two likely reasons, in order of probability:

1. **The portal doesn't use a socket for home chargers** — it might poll REST on an
   interval instead, and the WebSocket infra is reserved for public station live-status
   maps (a different use case) or is mobile-app-only. Check the regular `Fetch/XHR` tab
   for a polling request repeating every few seconds — if you find one, note its response
   shape in `FINDINGS.md`; it might carry the session id in JSON even though `node-chargepoint`
   doesn't parse that field from the equivalent API today (worth diffing against
   `getHomeChargerStatus`'s raw response).
2. **It's app-only.** Move to APK static analysis (jadx on the ChargePoint Android app) to
   pull the socket URL/protocol constants out of the binary, then come back to a proxy
   capture (mitmproxy + `apk-mitm`) targeting the app specifically, using this same
   Messages-tab technique against the proxy's flow view instead of DevTools.

## Safety notes

- This is read-only observation of traffic between your own browser and your own account/
  hardware. No injection, no replay, no auth bypass attempts.
- Don't paste raw HAR/frame captures anywhere before running `redact.py` — HAR exports
  include full request/response headers, which means your session cookie.
