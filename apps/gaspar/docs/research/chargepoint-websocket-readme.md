# ChargePoint WebSocket Recon

Reverse-engineering the ChargePoint WebSocket channel to recover the **session id** of an
EV-auto-started charging session on a CPH50 (Home Flex) charger.

## Why

`node-chargepoint` can't stop a session it didn't start. The stop command is:

```
POST {accountsEndpoint}/v1/driver/station/stopSession
{ "deviceId": <known>, "portNumber": 1, "sessionId": <MISSING> }
```

`deviceId` and `portNumber` are known. `sessionId` is the only missing input. Both REST
resolution paths return empty for a session the car auto-started on plug-in:

- Driver plane (`getUserChargingStatus`) → `user_status: {}`
- Device plane (`getHomeChargerStatus`) → no `sessionId` field, despite `chargingStatus: "CHARGING"`

Sunkeep currently falls back to clamping amperage to the 8A minimum, which is a mitigation,
not a stop.

**Scope note:** we need to _read one number_. A full WebSocket control plane is not required.
If any channel exposes the live session id, the existing REST stop path works unchanged.

## Files

| File                     | Purpose                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `01-discovery-dump.sh`   | Dump the raw service-discovery payload, unparsed, across request variants |
| `02-capture-playbook.md` | Step-by-step browser WebSocket capture procedure                          |
| `redact.py`              | Scrub tokens/user ids/MACs out of captures before sharing                 |
| `FINDINGS.md`            | Living log of confirmed facts — **update this as we learn**               |

## Usage

```bash
./01-discovery-dump.sh            # writes to ./out/
python3 redact.py out/*.json      # scrub before pasting anywhere
```

Then follow `02-capture-playbook.md`.

## Ground rules

- Personal account, personally owned hardware, read-only observation of our own traffic.
- Never commit `out/` — it contains session tokens. It is gitignored.
- Redact before pasting into any chat, issue, or PR: `coulomb_sess`, `userId`, MAC, serial.
