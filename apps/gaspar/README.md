# Gaspar

Fastify REST API for smart home automation. Handles sensor management and solar-powered car charging via the Sunkeep service.

## Getting Started

```bash
pnpm --filter gaspar dev
```

Server runs at [localhost:3000](http://localhost:3000).

## Architecture

Gaspar is a Fastify 5 service with two domains:

- **Sensors** — CRUD for smart home sensors (motion, temperature, contact, bed occupancy)
- **Sunkeep** — Background automation that charges a car using excess solar power

Data is persisted to Neon Postgres via Prisma 5.

## Commands

```bash
pnpm --filter gaspar dev              # Dev server with hot reload
pnpm --filter gaspar build            # Production build
pnpm --filter gaspar start            # Run built output
pnpm --filter gaspar test             # Run tests
pnpm --filter gaspar test:integration # Run integration tests
pnpm --filter gaspar typecheck        # Type check
pnpm --filter gaspar prisma:generate  # Regenerate Prisma client
pnpm --filter gaspar prisma:migrate   # Run pending migrations
```

## Environment Variables

| Variable       | Required | Default                       | Description                     |
| -------------- | -------- | ----------------------------- | ------------------------------- |
| `DATABASE_URL` | Yes      | —                             | Neon Postgres connection string |
| `PORT`         | No       | `3000`                        | Server port                     |
| `LOG_LEVEL`    | No       | `debug` (dev) / `info` (prod) | Pino log level                  |

### Sunkeep env vars

| Variable                | Default | Description                                          |
| ----------------------- | ------- | ---------------------------------------------------- |
| `CHARGEPOINT_USERNAME`  | —       | ChargePoint account email                            |
| `CHARGEPOINT_PASSWORD`  | —       | ChargePoint account password                         |
| `CHARGEPOINT_DEVICE_ID` | —       | Numeric device ID of the home charger                |
| `TESLA_CLIENT_ID`       | —       | App client ID from developer.tesla.com               |
| `TESLA_CLIENT_SECRET`   | —       | App client secret                                    |
| `TESLA_REFRESH_TOKEN`   | —       | Refresh token from one-time OAuth setup              |
| `TESLA_ENERGY_SITE_ID`  | —       | Numeric energy site ID from Tesla Fleet API          |
| `SOLAR_WINDOW_START`    | `06:00` | Local time — no API calls before this hour (`HH:MM`) |
| `SOLAR_WINDOW_END`      | `20:00` | Local time — no API calls after this hour (`HH:MM`)  |
| `SUNKEEP_ENABLED`       | `true`  | Start polling automatically on server boot           |
| `SUNKEEP_SOE_THRESHOLD` | `95`    | Minimum battery % to allow charging (0–100)          |

See [docs/sunkeep.md](docs/sunkeep.md) for full Sunkeep documentation.

## API

| Method   | Path                    | Description                        |
| -------- | ----------------------- | ---------------------------------- |
| `GET`    | `/`                     | Root health check                  |
| `GET`    | `/health`               | Health check with timestamp        |
| `POST`   | `/sensors`              | Create sensor                      |
| `GET`    | `/sensors`              | List all sensors                   |
| `GET`    | `/sensors/:id`          | Get sensor by ID                   |
| `PATCH`  | `/sensors/:id`          | Update sensor                      |
| `DELETE` | `/sensors/:id`          | Delete sensor                      |
| `GET`    | `/sunkeep/status`       | Sunkeep automation status          |
| `POST`   | `/sunkeep/enable`       | Enable automation                  |
| `POST`   | `/sunkeep/disable`      | Disable automation                 |
| `POST`   | `/sunkeep/charge/start` | Manually start a charging session  |
| `POST`   | `/sunkeep/charge/stop`  | Manually stop a charging session   |
| `GET`    | `/sunkeep/events`       | Charging event history (paginated) |
| `GET`    | `/sunkeep/events/:id`   | Single charging event              |

## Service Docs

- [docs/sensors.md](docs/sensors.md) — Sensor API reference and data model
- [docs/sunkeep.md](docs/sunkeep.md) — Sunkeep automation logic, endpoints, and configuration
