#!/usr/bin/env bash
#
# Dump the RAW ChargePoint service-discovery payload.
#
# node-chargepoint's parseEndpoints() keeps 12 known keys and silently drops everything
# else. docs/error-handling.md references a `kestrel_websocket_endpoint` scoped to the
# CPH50 family that neither node-chargepoint nor python-chargepoint parses — this script
# recovers the unparsed keys.
#
# The response may be conditioned on the request body or User-Agent (that's the likeliest
# explanation for a "CPH50-scoped" endpoint), so we probe several variants and diff them.
#
# Unauthenticated. No credentials involved, nothing to redact from the output.
#
# Usage: ./01-discovery-dump.sh [outdir]

set -uo pipefail

OUT="${1:-./out}"
mkdir -p "$OUT"

DISCOVERY="https://discovery.chargepoint.com/discovery/v3/globalconfig"

UA_LIB="node-chargepoint/0.11.2"
UA_APP="ChargePoint/6.0.0 (Android 14; Pixel 7)"
UA_WEB="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"

# NOTE: curl, not node. Node 24's built-in fetch adds `Sec-Fetch-Mode: cors`, which makes
# this endpoint return HTTP 500 (see the comment in node-chargepoint/src/global-config.ts).
probe() {
  local name="$1" ua="$2" body="$3"
  local code
  code=$(curl -sS -X POST "$DISCOVERY" \
    -H 'Content-Type: application/json' \
    -H "User-Agent: $ua" \
    -d "$body" \
    -o "$OUT/$name.json" \
    -w '%{http_code}' 2>"$OUT/$name.err")
  printf '  %-28s HTTP %-4s %8s bytes\n' "$name" "$code" "$(wc -c <"$OUT/$name.json" 2>/dev/null || echo 0)"
}

echo "==> Probing $DISCOVERY"

probe "baseline-na"      "$UA_LIB" '{"regionCode":"NA"}'
probe "empty-body"       "$UA_LIB" '{}'
probe "ua-mobile"        "$UA_APP" '{"regionCode":"NA"}'
probe "ua-browser"       "$UA_WEB" '{"regionCode":"NA"}'
probe "devicetype-ios"   "$UA_APP" '{"regionCode":"NA","deviceType":"IOS","appVersion":"6.0.0"}'
probe "devicetype-droid" "$UA_APP" '{"regionCode":"NA","deviceType":"ANDROID","appVersion":"6.0.0"}'
probe "model-cph50"      "$UA_APP" '{"regionCode":"NA","model":"CPH50"}'
probe "devicemodel-panda" "$UA_APP" '{"regionCode":"NA","deviceModel":"CPH50","deviceType":"PANDA"}'
probe "region-eu"        "$UA_LIB" '{"regionCode":"EU"}'

echo
echo "==> Probing alternate discovery paths (status codes only)"
for path in \
  /discovery/v1/globalconfig \
  /discovery/v2/globalconfig \
  /discovery/v4/globalconfig \
  /discovery/v3/config \
  /discovery/v3/globalconfig/mobile
do
  code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "https://discovery.chargepoint.com${path}" \
    -H 'Content-Type: application/json' -H "User-Agent: $UA_LIB" \
    -d '{"regionCode":"NA"}' 2>/dev/null)
  printf '  %-40s HTTP %s\n' "$path" "$code"
done

echo
node "$(dirname "$0")/analyze-discovery.mjs" "$OUT"
