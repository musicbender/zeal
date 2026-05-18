# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

This is a **Turborepo monorepo** using **pnpm** as the package manager.

```bash
pnpm dev              # Run all apps/packages in dev mode
pnpm build            # Build all packages and apps
pnpm test             # Run tests across all packages
pnpm test:e2e         # Run end-to-end tests
pnpm lint             # ESLint across all packages
pnpm typecheck        # TypeScript type checking
pnpm format           # Prettier formatting
```

### App-specific commands

```bash
# gaspar (backend API)
pnpm --filter gaspar dev              # Run backend only (tsx --watch)
pnpm --filter gaspar test             # Run backend tests (vitest)
pnpm --filter gaspar test:e2e         # Run backend integration tests
pnpm --filter gaspar prisma:generate  # Generate Prisma client after schema change
pnpm --filter gaspar prisma:migrate   # Apply migrations locally

# worfbot (Discord bot commands)
pnpm --filter @repo/worfbot register-commands  # Register slash commands with Discord API — required after adding/changing commands

# fiendlord-keep-ui (homelab dashboard)
pnpm --filter fiendlord-keep-ui dev   # Next.js dev server on port 3002
```

## Architecture

**Monorepo structure:** Turborepo with pnpm workspaces. Node v24.12.0 (.nvmrc). All packages use ES modules (`"type": "module"`).

### Apps

- **`apps/gaspar`** — Fastify REST API (port 3000) running on Raspberry Pi. Prisma ORM with Neon Postgres in prod, SQLite locally. Sensors CRUD + sunkeep (solar charging automation via Tesla + ChargePoint). See `apps/gaspar/CLAUDE.md`.
- **`apps/worfbot-gateway`** — Discord bot gateway (port 3001). Thin wrapper that bootstraps `@repo/worfbot` and connects to Discord via discord.js. Runs on the Pi. See `apps/worfbot-gateway/CLAUDE.md`.
- **`apps/fiendlord-keep-ui`** — Next.js homelab dashboard (port 3002). Radix UI Themes. Displays service health and magus stats for Pi-hosted services. See `apps/fiendlord-keep-ui/CLAUDE.md`.
- **`apps/portfolio`** — Next.js app deployed to Vercel at patjacobs.com. Hygraph CMS for content. Hosts Tesla OAuth callback. See `apps/portfolio/CLAUDE.md`.
- **`apps/portfolio-e2e`** — Playwright end-to-end tests for portfolio.

### Shared Packages

- **`@repo/types`** — Domain enums: `Room` (LIVING_ROOM, BEDROOM, etc.) and `SensorType` (BED_OCCUPANCY, MOTION, CONTACT, TEMPERATURE)
- **`@repo/gaspar-data`** — DTOs and entity classes for Sensor. Uses `@nestjs/mapped-types` for DTO inheritance. Shared between gaspar and frontend apps.
- **`@repo/worfbot`** — Discord bot logic: slash commands, keyword matcher, Worf quotes. Consumed by worfbot-gateway and portfolio.
- **`@repo/worfbot-data`** — Data types for worfbot.
- **`@repo/magus-data`** — Types for homelab service stats (`MagusStats`, `ServiceHealth`, `ServiceConfig`). Used by fiendlord-keep-ui.
- **`@repo/neon-client`** — Neon serverless Postgres client wrapper (server-only).
- **`@repo/neon-data`** — Data access layer for Neon DB.
- **`@repo/remote-data`** — Remote data fetching utilities including Hygraph CMS client.
- **`@repo/portfolio-data`** — Data types and utilities for portfolio.
- **`@repo/ui`** — React component library (Button, Card, Code).
- **`@repo/logger`** — Shared structured logger (pino-based).
- **`@repo/utils`** — Shared utility functions.
- **`@repo/constants`** — Shared constants.
- **`@repo/eslint-config`** — Shared ESLint configs (base, library, next-js, nest-js, prettier-base, react-internal).
- **`@repo/typescript-config`** — Shared tsconfig bases (base, nestjs, nextjs, react-library).

### External Integrations

- **Tesla Fleet API** → `apps/gaspar/src/sunkeep/tesla.client.ts` · see `.claude/skills/tesla-fleet-api.md`
- **ChargePoint** → `apps/gaspar/src/sunkeep/` via `node-chargepoint` npm package · source at `../node-chargepoint` · see `.claude/skills/chargepoint.md`
- **Discord** → `apps/worfbot-gateway` + `@repo/worfbot` · see `.claude/skills/discord.md` + `.claude/skills/worfbot.md`
- **Hygraph CMS** → `@repo/remote-data/src/hygraph.ts`

### Database

Prisma v5 with Neon Postgres in production. SQLite locally (`prisma/dev.db`). Schema at `apps/gaspar/prisma/schema.prisma`. `DATABASE_URL` is set in root `.env`.

The `Sensor` model: id (UUID), name, type, isActive, activeSince, room, createdAt, updatedAt.

### API Endpoints (gaspar)

- `GET /` — Health check
- `GET /health` — Health route
- `POST /sensors` — Create sensor
- `GET /sensors` — List all sensors
- `GET /sensors/:id` — Get sensor
- `PATCH /sensors/:id` — Update sensor
- `DELETE /sensors/:id` — Delete sensor
- `GET /sunkeep` — Sunkeep status
- `POST /sunkeep/enable` — Enable automation
- `POST /sunkeep/disable` — Disable automation

## Monorepo Workflows

### Adding a new app or package

Four places to update:

1. `pnpm-workspace.yaml` — add path glob if the new app/package is in a new location
2. `turbo.json` — add pipeline entries for the new app's scripts
3. New `tsconfig.json` — extend the appropriate base from `@repo/typescript-config`
4. New `package.json` — set `"type": "module"`, add `@repo/eslint-config` and `@repo/typescript-config` as devDependencies

## Project Skills

Project-specific reference skills in `.claude/skills/`. Invoke via the Skill tool when working with the relevant integration:

| Skill             | When to use                                                |
| ----------------- | ---------------------------------------------------------- |
| `tesla-fleet-api` | Tesla energy data, auth flow, or `sunkeep/tesla.client.ts` |
| `chargepoint`     | ChargePoint home charger integration in sunkeep            |
| `discord`         | Discord bot setup, intents, or event handling              |
| `worfbot`         | Adding slash commands or keyword triggers                  |

## Code Style

- **Prettier:** Single quotes, trailing commas (es5), 2-space indent, 100 char print width, `prettier-plugin-organize-imports`
- **TypeScript:** Strict mode enabled across all packages
- **EditorConfig:** UTF-8, LF line endings, 2-space tabs
