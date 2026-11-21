# Development

## Setup

```bash
git clone https://github.com/musicbender/node-chargepoint.git
cd node-chargepoint
pnpm install
```

## Type checking

```bash
pnpm typecheck
```

## Tests

```bash
pnpm test
```

Tests use [Vitest](https://vitest.dev/) and [MSW](https://mswjs.io/) to intercept `fetch` calls. No real network traffic is made during tests.

## E2E Tests

An optional E2E suite runs against the live ChargePoint API using a real home charger. It requires valid credentials and is not run as part of `pnpm test`.

### Setup

Create a `.env.e2e` file in the project root (it is gitignored):

```
CP_USERNAME=your-chargepoint-email@example.com
CP_PASSWORD=your-chargepoint-password

# After first run, paste the printed token here to avoid re-logging in:
# CP_TOKEN=
```

> **Tip:** `coulomb_sess` tokens contain special characters (`#`, `?`). Always wrap the value in
> double quotes when exporting to your shell:
> ```bash
> export CP_TOKEN="abc...#D???"
> ```

### Run (read-only — safe with charger in any state)

```bash
pnpm test:e2e
```

On first run the session token is printed. Paste it into `CP_TOKEN` in `.env.e2e` to skip
password re-authentication on subsequent runs.

### Run with mutation tests

Schedule, amperage limit, LED brightness — each test restores original values:

```bash
E2E_MUTATIONS=true pnpm test:e2e
```

The following operations are intentionally excluded from the automated suite due to their
disruptive nature: `restartHomeCharger()`, `startChargingSession()`, `stopChargingSession()`.
Use the CLI to invoke these manually.

## Build

```bash
pnpm build
```

Produces `dist/index.js` (ESM), `dist/index.cjs` (CommonJS), and `dist/index.d.ts` (type declarations) via [tsup](https://tsup.egoist.dev/).

## Commands reference

| Command | Purpose |
|---|---|
| `pnpm typecheck` | TypeScript strict type checking |
| `pnpm test` | Run all tests |
| `pnpm build` | Build CJS + ESM + `.d.ts` |
| `pnpm prepublishOnly` | Build + typecheck (runs automatically before `pnpm publish`) |
