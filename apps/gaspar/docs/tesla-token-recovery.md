# Tesla Refresh Token Recovery

The Tesla Fleet API uses a refresh token to obtain short-lived access tokens. This token can be invalidated when you log in from a new device, change your Tesla password, or revoke access in the Tesla app. When it happens, Sunkeep detects it on the next poll, disables itself, and logs a clear message.

## How to Tell It Happened

In the service logs you'll see:

```
ERROR (sunkeep.service): Tesla refresh token invalid — PUT /sunkeep/tesla/refresh-token with a new token to recover. Disabling sunkeep.
```

Sunkeep will stop polling entirely (state → `DISABLED`) until a valid token is provided. No further error spam.

## How to Recover

### Step 1 — Get a new refresh token

Use whichever method you normally use to generate a Tesla OAuth refresh token (e.g. the `tesla-auth` Python tool or the Fleet API authorization flow). The token is a long JWT string starting with `eyJ`.

### Step 2 — Send it to Gaspar over the local network

From any machine on the home network (no SSH needed):

```bash
curl -X PUT http://magus:3000/sunkeep/tesla/refresh-token \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"eyJ..."}'
```

Gaspar will:

1. Persist the new token to the database
2. Clear the circuit breaker in the Tesla client
3. Re-enable Sunkeep immediately (no restart required)

The response is the current Sunkeep status — confirm `"state": "IDLE"` (or `"WAITING"`/`"CHARGING"` depending on conditions).

### Step 3 — Verify

```bash
curl http://magus:3000/sunkeep/status | jq .state
# "IDLE"
```

## Self-Healing Token Rotation

Tesla returns a new refresh token on each successful token exchange. Gaspar captures this automatically and persists it to the database. On restart, the database value takes precedence over the `TESLA_REFRESH_TOKEN` environment variable.

This means as long as Gaspar is running and refreshing tokens regularly, the stored token stays current and the `login_required` error should be rare — typically only triggered by a password change or new device login.

## What Does NOT Work

- Gaspar cannot initiate the Tesla OAuth flow itself — it requires a browser login on your part.
- There is no automatic retry once the token is invalid. A new token must be provided manually.
- Restarting the service without updating the token will not help — the invalid token persists in the database.

## If the Database Already Has a Bad Token

If you've already tried the PUT endpoint but used a bad token (and the error continues), the database row will hold that bad value and it will take precedence over the env var on restart. Fix it with another PUT using a valid token, or clear the row directly:

```bash
psql $DATABASE_URL -c "DELETE FROM setting WHERE key = 'tesla_refresh_token';"
```

After deleting, the env var `TESLA_REFRESH_TOKEN` is used again on the next restart.
