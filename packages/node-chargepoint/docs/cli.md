# CLI

After installation, a `chargepoint` command is available.

## Authentication

Credentials are read from environment variables:

```bash
export CP_USERNAME="user@example.com"
export CP_TOKEN="<coulomb_sess cookie value>"
# or use --password / CP_PASSWORD for password-based login
```

## Commands

```bash
# Show account info
chargepoint -u user@example.com -t $CP_TOKEN account

# List registered vehicles
chargepoint -u user@example.com -t $CP_TOKEN vehicles

# Show current charging session status
chargepoint -u user@example.com -t $CP_TOKEN status

# List home charger IDs
chargepoint -u user@example.com -t $CP_TOKEN chargers

# Start a charging session on a device
chargepoint -u user@example.com -t $CP_TOKEN start <deviceId>

# Show details for a charging station
chargepoint -u user@example.com -t $CP_TOKEN station <deviceId>
```

Global options:

```
-u, --username <username>   ChargePoint username (or set CP_USERNAME)
-t, --token <token>         Coulomb session token (or set CP_TOKEN)
-p, --password <password>   Password login fallback (or set CP_PASSWORD)
-V, --version               Print version
-h, --help                  Display help
```
