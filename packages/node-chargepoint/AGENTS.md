# AGENTS.md

This file documents conventions for AI agents working on this codebase.

## Project overview

`node-chargepoint` is a Node.js 24 / TypeScript port of
[python-chargepoint](https://github.com/mbillow/python-chargepoint) (MIT). It is an async
wrapper around the ChargePoint EV charging network's private API, publishable on npm.

## Essential commands

```bash
npm install          # install dependencies
npm run typecheck    # tsc --noEmit (zero errors required before committing)
npm test             # vitest run (all 37 tests must pass)
npm run build        # tsup — produces dist/ (CJS + ESM + .d.ts)
```

Run **typecheck → test → build** in that order before every commit. All three must succeed.

## Repository layout

```
src/
  constants.ts      DISCOVERY_API URL and USER_AGENT string
  exceptions.ts     Error class hierarchy (APIError → CommunicationError → …)
  types.ts          All TypeScript interfaces (30+ types, camelCase, no runtime validation)
  global-config.ts  fetchGlobalConfig() — calls the discovery endpoint
  session.ts        ChargingSession class + sendCommand() polling helper
  client.ts         ChargePoint class — all public API methods + _request()
  cli.ts            Commander-based CLI (compiled to dist/cli.cjs)
  index.ts          Public barrel exports (re-exports from the files above)
tests/
  fixtures/         JSON snapshots of real API response shapes
  handlers.ts       MSW request handlers — one per logical API endpoint group
  setup.ts          MSW server lifecycle (beforeAll / afterEach / afterAll)
  client.test.ts    ChargePoint class integration tests
  session.test.ts   ChargingSession polling and refresh tests
```

## Architecture decisions

### HTTP — native fetch, no library
Node 24 ships `fetch` globally. All HTTP calls go through `ChargePoint._request()` in
`src/client.ts`. Do not add `axios`, `node-fetch`, or any other HTTP client.

### Cookies — manual, no library
The ChargePoint API only requires one cookie: `coulomb_sess` on `.chargepoint.com`.
`_request()` extracts it from `Set-Cookie` response headers with a regex and stores it as
a plain string. Do not add `tough-cookie` or any cookie library.

### Types — interfaces only, no runtime validation
All types in `src/types.ts` are plain TypeScript interfaces. There is no Zod, class-validator,
or Pydantic equivalent. Validation happens at compile time only. If the API returns unexpected
shapes, the code will silently ignore unknown fields.

### One runtime dependency
`commander` (for the CLI bin). The library itself (`src/index.ts` exports) has zero runtime
dependencies. Do not add runtime dependencies to the library entry point without a strong reason.

### camelCase everywhere
The ChargePoint API returns camelCase JSON. TypeScript interfaces mirror that directly — no
transformation layer. The exception is the session detail endpoint (`driver-bff/v1/sessions/`)
which returns snake_case; `ChargingSession._apply()` handles that mapping manually.

### Module resolution — NodeNext
All relative imports inside `src/` and `tests/` must use `.js` extensions:
```typescript
import { sendCommand } from './session.js';   // correct
import { sendCommand } from './session';       // wrong — fails under NodeNext
```
tsup resolves `.js` → `.ts` at build time; TypeScript resolves them for type-checking.

## Key patterns

### Adding a new API method
1. Add the TypeScript return type to `src/types.ts` if needed.
2. Add the async method to `ChargePoint` in `src/client.ts`. Follow the existing pattern:
   - Construct the URL from `this.globalConfig.endpoints.*`
   - Call `this._request(method, url, init?)`
   - Check `!response.ok` and throw `CommunicationError` if needed
   - Parse and return `(await response.json()) as YourType`
3. Export the new type from `src/index.ts`.
4. Add an MSW handler in `tests/handlers.ts` and a fixture JSON in `tests/fixtures/` if the
   endpoint returns data.
5. Add a test in `tests/client.test.ts`.

### Adding a new error condition
Extend the hierarchy in `src/exceptions.ts`. Always call
`Object.setPrototypeOf(this, new.target.prototype)` in the constructor — this is required for
`instanceof` checks to work correctly when the code is compiled to CommonJS.

### Polling loop (start/stop sessions)
`sendCommand()` in `src/session.ts` polls the `/session/ack` endpoint up to 20 times with a
3-second sleep between attempts. Use `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(3000)`
in tests to avoid real 60-second waits. Attach `.catch()` immediately to the promise under test
to suppress `PromiseRejectionHandledWarning` from Node.js.

### Circular dependency (session ↔ client)
`session.ts` uses `import type { ChargePoint } from './client.js'` — a type-only import. This
avoids a circular runtime dependency. Do not change it to a value import.

## Testing conventions

- **Vitest + MSW** — MSW intercepts native `fetch`; `nock` does NOT work here (it patches the
  `http` module, not `fetch`).
- **Per-test overrides** — use `server.use(http.get(...))` inside a test to override specific
  handlers. `server.resetHandlers()` (called by `afterEach` in `setup.ts`) restores defaults.
- **Error tests** — test `InvalidSession` by returning HTTP 401, `DatadomeCaptcha` by returning
  HTTP 403 with a body containing a `url` field whose value includes `datadome`, `LoginError`
  by returning a non-401 non-2xx from the SSO login endpoint.
- **Fixtures** — keep fixture JSON files in `tests/fixtures/`. They document the actual API
  response shapes and are the ground truth for type interface coverage.

## What NOT to do

- Do not add `zod`, `yup`, or other runtime validation libraries to the library.
- Do not add `tough-cookie` or any cookie management library.
- Do not use `axios` or `node-fetch`; use native `fetch`.
- Do not use `assert { type: 'json' }` for JSON imports — TypeScript 5.3+ requires
  `with { type: 'json' }`.
- Do not push to `main` directly. Develop on feature branches.
- Do not skip `npm run typecheck` before committing. The type system is the primary
  correctness guarantee for API response parsing.
