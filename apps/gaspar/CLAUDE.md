# Gaspar

Fastify REST API running on a Raspberry Pi (port 3000). Manages smart home sensors and the sunkeep solar charging automation (Tesla + ChargePoint).

## Commands

```bash
pnpm --filter gaspar dev              # Dev server (tsx --watch)
pnpm --filter gaspar test             # Unit tests (vitest)
pnpm --filter gaspar test:e2e         # Integration tests (vitest)
pnpm --filter gaspar prisma:generate  # Regenerate Prisma client after schema change
pnpm --filter gaspar prisma:migrate   # Apply migrations locally
```

## Structure

```
src/
  main.ts               # Bootstrap: registers plugins, cors, helmet, and routes
  app.routes.ts         # Root route (GET /)
  app.service.ts
  health/               # Health check route
  prisma/               # PrismaService wrapper
  sensors/              # Sensor CRUD (routes, service)
  sunkeep/              # Solar charging automation
    sunkeep.plugin.ts   # Fastify plugin — entry point, constructs clients
    sunkeep.routes.ts   # REST endpoints (/sunkeep, /sunkeep/enable, /sunkeep/disable)
    sunkeep.service.ts  # Core automation logic
    sunkeep.scheduler.ts  # 10-minute polling loop
    sunkeep.config.ts   # Reads env vars into SunkeepConfig
    sunkeep.types.ts    # Interfaces: IPowerwallAdapter, PowerwallData, SunkeepConfig
    tesla.client.ts     # TeslaEnergyClient — implements IPowerwallAdapter
```

## Adding a Fastify Route or Plugin

New feature = new plugin file. Follow the pattern from `sunkeep.plugin.ts`:

1. Create `src/<feature>/<feature>.plugin.ts` exporting `async function register<Feature>Plugin(server: FastifyInstance, ...deps)`
2. Create `src/<feature>/<feature>.routes.ts` for route handlers
3. Register in `src/main.ts`:

```ts
import { registerMyFeaturePlugin } from './my-feature/my-feature.plugin.js';
// ...
await registerMyFeaturePlugin(server, prismaService);
```

Do not add routes directly to `main.ts` — keep them in plugin files.

## Endpoint Workflow

When adding or changing an endpoint:

1. Write a design/plan first (use `superpowers:writing-plans` if non-trivial)
2. Implement the change
3. Run tests: `pnpm --filter gaspar test`
4. Update the Postman collection: `docs/postman/gaspar.postman_collection.json`

## Prisma Workflow

```bash
# After changing prisma/schema.prisma:
pnpm --filter gaspar prisma:generate  # Always run this first — updates the Prisma client

# Apply migrations locally:
pnpm --filter gaspar prisma:migrate

# Production (Pi): SSH in and run migrations there.
# Never run prod migrations from a dev machine.
```

## Environment Variables

| Var                     | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`          | Neon Postgres URL in prod; `file:./prisma/dev.db` locally    |
| `TESLA_CLIENT_ID`       | Tesla OAuth app client ID                                    |
| `TESLA_CLIENT_SECRET`   | Tesla OAuth app client secret                                |
| `TESLA_REFRESH_TOKEN`   | Long-lived refresh token                                     |
| `TESLA_ENERGY_SITE_ID`  | Numeric energy site ID (static)                              |
| `CHARGEPOINT_USERNAME`  | ChargePoint account email                                    |
| `CHARGEPOINT_PASSWORD`  | ChargePoint account password                                 |
| `CHARGEPOINT_TOKEN`     | Saved coulombToken (optional — re-authenticates if missing)  |
| `CHARGEPOINT_DEVICE_ID` | Numeric home charger device ID                               |
| `SUNKEEP_ENABLED`       | Set to `false` to disable automation (default: enabled)      |
| `SUNKEEP_SOE_THRESHOLD` | Battery % threshold before automation starts (default: `95`) |
| `SOLAR_WINDOW_START`    | Start of solar window (default: `06:00`)                     |
| `SOLAR_WINDOW_END`      | End of solar window (default: `20:00`)                       |

## Skills

- Tesla Fleet API: invoke `tesla-fleet-api` skill
- ChargePoint: invoke `chargepoint` skill
