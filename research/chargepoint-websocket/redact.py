#!/usr/bin/env python3
"""Scrub ChargePoint secrets/PII out of captures before sharing (chat, issue, PR, gist).

Handles JSON discovery dumps, raw HTTP Archive (.har) exports from DevTools, and plain
text/log paste dumps. Writes <name>.redacted<ext> next to each input; never overwrites
the original.

Usage:
    python3 redact.py out/*.json
    python3 redact.py ~/Downloads/chargepoint.har
"""
import json
import re
import sys
from pathlib import Path

# coulomb_sess cookie / cp-session-token header value: long opaque token, often URL-encoded
TOKEN_RE = re.compile(r'(coulomb_sess=|cp-session-token["\']?\s*[:=]\s*["\']?)([^;"\'&\s]{20,})', re.IGNORECASE)
BEARER_RE = re.compile(r'(Bearer\s+)([A-Za-z0-9\-_.]{20,})', re.IGNORECASE)
MAC_RE = re.compile(r'\b([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b')
# ChargePoint numeric userId / chargerId / deviceId / sessionId in JSON bodies
ID_KEYS = re.compile(
    r'("(?:userId|user_id|chargerId|charger_id|deviceId|device_id|sessionId|session_id|serialNumber|serial_number)"\s*:\s*)(\d+|"[^"]*")',
    re.IGNORECASE,
)
EMAIL_RE = re.compile(r'\b[\w.+-]+@[\w-]+\.[\w.-]+\b')

REPLACEMENT = {
    'token': 'REDACTED_TOKEN',
    'mac': 'REDACTED_MAC',
    'id': 'REDACTED_ID',
    'email': 'REDACTED_EMAIL',
}


def redact_text(s: str) -> str:
    s = TOKEN_RE.sub(lambda m: m.group(1) + REPLACEMENT['token'], s)
    s = BEARER_RE.sub(lambda m: m.group(1) + REPLACEMENT['token'], s)
    s = MAC_RE.sub(REPLACEMENT['mac'], s)
    s = ID_KEYS.sub(lambda m: m.group(1) + ('"' + REPLACEMENT['id'] + '"' if m.group(2).startswith('"') else '0'), s)
    s = EMAIL_RE.sub(REPLACEMENT['email'], s)
    return s


def process(path: Path) -> Path:
    raw = path.read_text(encoding='utf-8', errors='replace')
    cleaned = redact_text(raw)

    # If it's valid JSON, re-serialize so structure stays intact and diffable.
    try:
        obj = json.loads(cleaned)
        cleaned = json.dumps(obj, indent=2)
    except json.JSONDecodeError:
        pass  # not JSON (HAR-with-binary-noise, plain log, etc.) — text redaction stands

    out = path.with_suffix(f'.redacted{path.suffix}')
    out.write_text(cleaned, encoding='utf-8')
    return out


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    for arg in sys.argv[1:]:
        path = Path(arg)
        if not path.exists():
            print(f'skip (not found): {path}')
            continue
        out = process(path)
        print(f'{path}  ->  {out}')

    print('\nSpot-check the .redacted files before pasting anywhere — this is a best-effort')
    print('regex scrub, not a guarantee. Grep the output for your own token/email if unsure:')
    print('  grep -i "coulomb_sess\\|@" out/*.redacted.json')


if __name__ == '__main__':
    main()
