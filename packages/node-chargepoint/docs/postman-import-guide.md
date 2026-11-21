# Postman Import Guide

This guide covers importing the ChargePoint API collection into Postman and getting your first request running.

---

## Prerequisites

- [Postman](https://www.postman.com/downloads/) (desktop app or web at app.getpostman.com)
- A ChargePoint account with username and password

---

## Importing the Collection

### Desktop App

1. Open Postman.
2. Click **Import** in the top-left toolbar.
3. Select the **Files** tab.
4. Click **Choose Files** and select `chargepoint.postman_collection.json` from the project root.
5. Click **Import**.

### Postman Web

1. Go to [app.getpostman.com](https://app.getpostman.com) and sign in.
2. Select your workspace.
3. Click **Import** near the top of the left sidebar.
4. Drag and drop `chargepoint.postman_collection.json` onto the import area, or click **Choose Files**.
5. Click **Import**.

### Drag and Drop (Desktop)

Drag `chargepoint.postman_collection.json` directly from Finder/Explorer onto the Postman window. Postman will detect and prompt you to import it.

---

## Initial Setup

After importing, configure two things before running any requests.

### 1. Set Your Credentials

1. In the left sidebar, right-click **ChargePoint API** and choose **Edit**.
2. Go to the **Variables** tab.
3. Fill in the **Current Value** column for:
   - `username` — your ChargePoint email address
   - `password` — your ChargePoint password
4. Optionally change `region` if you are outside North America (`NA` → `EU`).
5. Click **Save**.

> **Security tip:** The `password` variable is marked as `secret` type, which masks it in the UI. Never commit `Current Value` entries to source control — use Postman Environments instead for shared team setups (see below).

### 2. Fetch API Endpoints

ChargePoint serves its API base URLs dynamically from a discovery endpoint. Run this once to populate all the endpoint variables:

1. Expand the **Setup** folder in the collection.
2. Click **Fetch Global Config**.
3. Click **Send**.
4. The test script automatically sets `ssoEndpoint`, `accountsEndpoint`, `mapcacheEndpoint`, `hcpoHcmEndpoint`, and `internalApiGatewayEndpoint` as collection variables.

You only need to do this once per Postman session (or after the collection variables are cleared).

---

## Authentication Flow

### Login

1. Expand **Authentication**.
2. Click **Login with Password**.
3. Click **Send**.
4. On success the test script extracts the `coulomb_sess` cookie from the response and saves it to the `coulombToken` collection variable.

All subsequent requests automatically include:

```
cookie: coulomb_sess=<token>
cp-session-type: CP_SESSION_TOKEN
cp-session-token: <token>
cp-region: NA
```

These headers are injected by the collection-level pre-request script.

### Saving Your Session Token

If you want to reuse a session token across Postman restarts without re-logging in:

1. After logging in, go to **ChargePoint API > Variables**.
2. Copy the **Current Value** of `coulombToken`.
3. Paste it back into **Initial Value** so it persists when the collection is saved.

Alternatively, use the `ChargePoint.create()` method with the `coulombToken` option in your Node.js code to skip re-authentication.

### Logout

Run **Authentication > Logout** when finished. The test script clears `coulombToken` automatically.

---

## Typical Request Sequence

For home charger management:

```
Setup → Fetch Global Config
Authentication → Login with Password
Account → Get Account              (populates userId)
Home Chargers → Get Home Chargers  (populates chargerId)
Home Chargers → Get Home Charger Status
```

For starting a public charging session:

```
Setup → Fetch Global Config
Authentication → Login with Password
Account → Get Account              (populates userId)
Stations → Get Station Info        (set deviceId first)
Charging Sessions → Start Session — Send Command
Charging Sessions → Poll Session Ack  (repeat until 200)
Charging Sessions → Get Session Data
```

---

## Collection Variables Reference

| Variable | Description | Auto-populated |
|---|---|---|
| `discoveryEndpoint` | ChargePoint discovery URL — do not change | — |
| `region` | Region code (`NA` or `EU`) | — |
| `username` | Your ChargePoint email | — |
| `password` | Your ChargePoint password | — |
| `coulombToken` | Session token | Login requests |
| `ssoEndpoint` | SSO API base URL | Fetch Global Config |
| `portalDomainEndpoint` | Portal base URL | Fetch Global Config |
| `accountsEndpoint` | Accounts API base URL | Fetch Global Config |
| `mapcacheEndpoint` | Mapcache API base URL | Fetch Global Config |
| `hcpoHcmEndpoint` | Home charger API base URL | Fetch Global Config |
| `internalApiGatewayEndpoint` | Internal gateway base URL | Fetch Global Config |
| `userId` | Your numeric user ID | Get Account |
| `chargerId` | Home charger device ID | Get Home Chargers |
| `deviceId` | Public station device ID | Set manually |
| `sessionId` | Active charging session ID | Get User Charging Status |
| `ackId` | Start/stop acknowledgement ID | Start/Stop Session commands |

---

## Using Postman Environments (Team Setup)

For teams, store credentials in a Postman Environment rather than directly in the collection:

1. Click **Environments** (the eye icon in the top-right) → **Add**.
2. Name it (e.g. "ChargePoint – Production").
3. Add variables: `username`, `password`, `coulombToken`.
4. Click **Save**.
5. Select the environment from the dropdown in the top-right before running requests.

This keeps credentials out of the exported collection JSON.

---

## Troubleshooting

**"ssoEndpoint is empty / requests fail with URL errors"**
Run **Setup > Fetch Global Config** first. The base endpoint URLs must be populated before any other request can work.

**HTTP 401 on authenticated requests**
Your session has expired. Run **Authentication > Login with Password** again to refresh `coulombToken`.

**HTTP 403 with a Datadome URL in the response**
ChargePoint's bot detection has flagged the request. Complete the CAPTCHA at the URL in the response body, then retry the login.

**"userId is empty" when calling home charger endpoints**
Run **Account > Get Account** first — it auto-populates `userId`.

**Start session returns 200 but no session appears**
The start command is asynchronous. Poll **Poll Session Ack** every few seconds until it returns HTTP 200, then run **Get Session Data**.
