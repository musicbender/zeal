# Tesla Fleet API One-Time Setup

This doc covers registering a Tesla developer app and capturing a refresh token for Sunkeep.

## Prerequisites

- Access to [developer.tesla.com](https://developer.tesla.com)
- The RSA public key already deployed to patjacobs.com (see `public/.well-known/appspecific/com.tesla.3p.public-key.pem`)
- `TESLA_CLIENT_ID` and `TESLA_CLIENT_SECRET` added to Vercel env vars for the portfolio project

## Steps

### 1. Register the app at developer.tesla.com

1. Go to [developer.tesla.com](https://developer.tesla.com) and sign in with your Tesla account.
2. Create a new application:
   - **Name:** anything (e.g. "Sunkeep")
   - **Domain:** `patjacobs.com`
   - **Redirect URI:** `https://www.patjacobs.com/tesla/callback`
   - **Allowed scopes:** `energy_device_data offline_access`
3. Copy the **Client ID** and **Client Secret** — add them to:
   - Root `.env` on the Pi as `TESLA_CLIENT_ID` and `TESLA_CLIENT_SECRET`
   - Vercel env vars for the portfolio project (needed by the callback route)

### 2. Deploy the public key

The public key is at `apps/portfolio/public/.well-known/appspecific/com.tesla.3p.public-key.pem`. Push the branch and deploy to Vercel. Tesla fetches this URL during registration to verify you own the domain.

Verify it is live:

```bash
curl https://patjacobs.com/.well-known/appspecific/com.tesla.3p.public-key.pem
```

Expected: PEM contents starting with `-----BEGIN PUBLIC KEY-----`.

### 3. Register as a partner (one-time API call)

After your app is approved and the public key is live, register your domain with Tesla's Fleet API:

```bash
# Get a partner access token
PARTNER_TOKEN=$(curl -s -X POST https://auth.tesla.com/oauth2/v3/token \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "scope=openid vehicle_device_data energy_device_data offline_access" \
  -d "audience=https://fleet-api.prd.na.vn.cloud.tesla.com" \
  | jq -r .access_token)

# Register your domain
curl -X POST https://fleet-api.prd.na.vn.cloud.tesla.com/api/1/partner_accounts \
  -H "Authorization: Bearer $PARTNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"domain": "patjacobs.com"}'
```

### 4. Authorize and capture the refresh token

Construct the authorization URL and open it in a browser (replace `YOUR_CLIENT_ID`):

```
https://auth.tesla.com/oauth2/v3/authorize?client_id=YOUR_CLIENT_ID&locale=en-US&prompt=login&redirect_uri=https%3A%2F%2Fwww.patjacobs.com%2Ftesla%2Fcallback&response_type=code&scope=energy_device_data+offline_access&state=sunkeep
```

Tesla redirects to `www.patjacobs.com/tesla/callback`, which exchanges the code and displays your refresh token. Copy it.

### 5. Find your energy site ID

```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  https://fleet-api.prd.na.vn.cloud.tesla.com/api/1/products
```

Find the entry with `"resource_type": "energy_site"` and copy its `"energy_site_id"` value.

### 6. Set Pi env vars

Add to `/home/pi/zeal/.env`:

```env
TESLA_CLIENT_ID=your_client_id
TESLA_CLIENT_SECRET=your_client_secret
TESLA_REFRESH_TOKEN=the_token_from_step_4
TESLA_ENERGY_SITE_ID=the_id_from_step_5
```

Remove the old Powerwall vars if present:

```
# Remove these if they exist:
# POWERWALL_HOST=...
# POWERWALL_EMAIL=...
# POWERWALL_PASSWORD=...
```

### 7. Verify with the integration test

```bash
pnpm --filter gaspar test:integration
```

Expected: 1 test passes (fetches live battery/solar/load data).
