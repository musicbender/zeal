# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

This is a **Turborepo monorepo** using **pnpm** as the package manager.

```bash
pnpm dev              # Run all apps/packages in dev mode
pnpm build            # Build all packages and apps
pnpm test             # Run Jest tests across all packages
pnpm test:e2e         # Run end-to-end tests
pnpm lint             # ESLint across all packages
pnpm typecheck        # TypeScript type checking
pnpm format           # Prettier formatting
```

### Gaspar (backend) specific commands

```bash
pnpm --filter gaspar dev          # Run backend only (tsx --watch)
pnpm --filter gaspar test         # Run backend tests only
pnpm --filter gaspar test:e2e     # Run backend e2e tests
pnpm --filter gaspar prisma:generate  # Generate Prisma client
pnpm --filter gaspar prisma:migrate   # Run database migrations
```

## Architecture

**Monorepo structure:** Turborepo with pnpm workspaces. Node v24.12.0 (.nvmrc). All packages use ES modules (`"type": "module"`).

### Apps

- **`apps/gaspar`** — Fastify REST API (port 3000). Uses Prisma ORM with SQLite (`prisma/dev.db`). Handles CRUD for smart home sensors. Plugins: `@fastify/helmet`, `@fastify/cors`.
- **`apps/web`** — Next.js 16 frontend with React 19. App Router. Currently has disabled scripts (in development). Connects to gaspar API.

### Shared Packages

- **`@repo/types`** — Domain enums: `Room` (LIVING_ROOM, BEDROOM, etc.) and `SensorType` (BED_OCCUPANCY, MOTION, CONTACT, TEMPERATURE)
- **`@repo/gaspar-data`** — NestJS-style DTOs and entity classes for Sensor. Uses `@nestjs/mapped-types` for DTO inheritance. Shared between gaspar and web.
- **`@repo/ui`** — React component library (Button, Card, Code)
- **`@repo/eslint-config`** — Shared ESLint configs (base, library, next-js, nest-js, prettier-base, react-internal)
- **`@repo/jest-config`** — Shared Jest configs (base, nest, next)
- **`@repo/typescript-config`** — Shared tsconfig bases (base, nestjs, nextjs, react-library)

### Dependency Flow

```
web → @repo/ui, @repo/gaspar-data
gaspar → @repo/gaspar-data, @repo/types
@repo/gaspar-data → @repo/types
```

### Database

Prisma v5 with neon postgres. Schema at `apps/gaspar/prisma/schema.prisma`. The `Sensor` model has: id (UUID), name, type, isActive, activeSince, room, createdAt, updatedAt. `DATABASE_URL` is set in root `.env`.

### API Endpoints (gaspar)

- `GET /` — Health check
- `GET /health` — Health route
- `POST /sensors` — Create sensor
- `GET /sensors` — List all sensors
- `GET /sensors/:id` — Get sensor
- `PATCH /sensors/:id` — Update sensor
- `DELETE /sensors/:id` — Delete sensor

## Code Style

- **Prettier:** Single quotes, trailing commas (es5), 2-space indent, 100 char print width, `prettier-plugin-organize-imports`
- **TypeScript:** Strict mode enabled across all packages
- **EditorConfig:** UTF-8, LF line endings, 2-space tabs
