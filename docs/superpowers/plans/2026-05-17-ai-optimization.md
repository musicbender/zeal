# Zeal Monorepo AI Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CLAUDE.md files to every active app and update the root, plus four project-scoped API reference skills and the turborepo skill, so Claude has accurate authoritative context for every integration in this monorepo.

**Architecture:** Documentation-only — no runtime code changes. Files land in `.claude/skills/` (project skills) and alongside each app's source. Root `CLAUDE.md` gets a full rewrite to reflect the current set of apps and packages.

**Tech Stack:** Markdown, Claude Code skill frontmatter, `npx skills add` for turborepo skill install.

---

## File Map

| Action  | Path                                              |
| ------- | ------------------------------------------------- |
| Install | `.claude/plugins/` (via npx) + `skills-lock.json` |
| Create  | `.claude/skills/tesla-fleet-api.md`               |
| Create  | `.claude/skills/chargepoint.md`                   |
| Create  | `.claude/skills/discord.md`                       |
| Create  | `.claude/skills/worfbot.md`                       |
| Rewrite | `CLAUDE.md`                                       |
| Create  | `apps/gaspar/CLAUDE.md`                           |
| Create  | `apps/worfbot-gateway/CLAUDE.md`                  |
| Create  | `apps/fiendlord-keep-ui/CLAUDE.md`                |
| Create  | `apps/portfolio/CLAUDE.md`                        |

---

## Task 1: Install Turborepo Skill

**Files:**

- Modify: `skills-lock.json` (via npx)

- [ ] **Step 1: Run install**

```bash
npx skills add vercel/turborepo
```

Expected: skill installs into `.claude/plugins/` and `skills-lock.json` gains a `vercel/turborepo` entry.

- [ ] **Step 2: Commit**

```bash
git add skills-lock.json .claude/plugins/
git commit -m "chore: install vercel/turborepo skill"
```

---

## Task 2: Tesla Fleet API Skill

> Note: Tasks 2–4 create files but do not commit individually. The commit happens at the end of Task 5 to group all four skills together.

**Files:**

- Create: `.claude/skills/tesla-fleet-api.md`

- [ ] **Step 1: Create the skills directory and write the file**

Create `.claude/skills/tesla-fleet-api.md`:

```markdown
---
name: tesla-fleet-api
description: Tesla Fleet API reference — auth flow, endpoints, env vars, and TeslaEnergyClient usage in gaspar/sunkeep
---

# Tesla Fleet API

## Auth Flow

Uses OAuth2 with a long-lived refresh token and short-lived access tokens (~8h TTL). RSA key pair: public key hosted at `apps/portfolio/public/.well-known/appspecific/com.tesla.3p.public-key.pem` on patjacobs.com.

### Token refresh

`TeslaEnergyClient.refreshIfNeeded()` is called before every API request. It skips refresh if the cached access token has >60 seconds remaining. Never skip this call.
```

POST https://auth.tesla.com/oauth2/v3/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
client_id=TESLA_CLIENT_ID
client_secret=TESLA_CLIENT_SECRET
refresh_token=TESLA_REFRESH_TOKEN

```

Returns `{ access_token, expires_in }`. Store expiry as `Date.now() + expires_in * 1000`.

## Key Endpoints

Base: `https://fleet-api.prd.na.vn.cloud.tesla.com`

### Live status (called every 10 minutes by SunkeepScheduler)

```

GET /api/1/energy_sites/{energySiteId}/live_status
Authorization: Bearer {accessToken}

```

Response fields mapped to `PowerwallData`:

| API field | PowerwallData field | Transform |
|-----------|---------------------|-----------|
| `percentage_charged` | `batteryPct` | direct |
| `solar_power` | `solarKw` | ÷ 1000 |
| `load_power` | `loadKw` | ÷ 1000 |
| `battery_power` | `batteryKw` | ÷ 1000, nullable |
| `grid_power` | `gridKw` | ÷ 1000, nullable |
| `grid_status` | `gridStatus` | nullable string |

### Site info

```

GET /api/1/energy_sites/{energySiteId}/site_info
Authorization: Bearer {accessToken}

````

Returns site name, battery capacity (watts → kWh ÷ 1000), backup reserve %, firmware version, battery count.

## Environment Variables

| Var | Description |
|-----|-------------|
| `TESLA_CLIENT_ID` | OAuth app client ID from developer.tesla.com |
| `TESLA_CLIENT_SECRET` | OAuth app client secret |
| `TESLA_REFRESH_TOKEN` | Long-lived refresh token (obtained during one-time OAuth setup) |
| `TESLA_ENERGY_SITE_ID` | Numeric energy site ID — static, obtained once via `GET /api/1/products` |

## Implementation

`apps/gaspar/src/sunkeep/tesla.client.ts` — `TeslaEnergyClient` implements `IPowerwallAdapter`:

```ts
interface IPowerwallAdapter {
  getData(): Promise<PowerwallData>;
}
````

`SunkeepService` depends only on `IPowerwallAdapter` — swap the client by passing a different implementation to its constructor.

## Common Pitfall

Never assume a cached `accessToken` is valid. Always call `refreshIfNeeded()`. The implementation uses a 60-second buffer (`Date.now() < this.tokenExpiresAt - 60_000`) to avoid expiry mid-request.

````

- [ ] **Step 2: Verify the file renders correctly**

```bash
cat .claude/skills/tesla-fleet-api.md
````

Check: frontmatter present, no placeholder text, env var table is complete.

---

## Task 3: ChargePoint Skill

**Files:**

- Create: `.claude/skills/chargepoint.md`

- [ ] **Step 1: Write the file**

Create `.claude/skills/chargepoint.md`:

````markdown
---
name: chargepoint
description: ChargePoint API reference — node-chargepoint client library, auth, key methods, and usage in gaspar sunkeep
---

# ChargePoint

The ChargePoint API is accessed via the `node-chargepoint` npm package. The source lives at `../node-chargepoint` (sibling repo, owned by Pat) — read it for types and method signatures when the npm package types are insufficient.

## Auth

`ChargePoint` uses a session token called `coulombToken`.

**First time (no saved token):**

```ts
const client = await ChargePoint.create(username);
await client.loginWithPassword(password);
console.log(client.coulombToken); // save this as CHARGEPOINT_TOKEN
```
````

**With saved token (preferred):**

```ts
const client = await ChargePoint.create(username, { coulombToken: savedToken });
```

If a request throws `InvalidSession`, the token has expired — catch it and re-authenticate with `loginWithPassword`.

## Environment Variables

| Var                     | Description                                                     |
| ----------------------- | --------------------------------------------------------------- |
| `CHARGEPOINT_USERNAME`  | ChargePoint account email                                       |
| `CHARGEPOINT_PASSWORD`  | ChargePoint account password                                    |
| `CHARGEPOINT_TOKEN`     | Saved coulombToken — pass on startup to avoid re-authenticating |
| `CHARGEPOINT_DEVICE_ID` | Numeric home charger device ID                                  |

## Key Methods

```ts
// Session token (persist between restarts)
client.coulombToken: string | null

// Home charger discovery
const ids = await client.getHomeChargers(): Promise<number[]>

// Status and config
await client.getHomeChargerStatus(chargerId: number): Promise<HomeChargerStatus>
await client.getHomeChargerConfig(chargerId: number): Promise<HomeChargerConfiguration>

// Amperage control (integer amps only — clamp and round before calling)
await client.setAmperageLimit(chargerId: number, amperage: number): Promise<void>

// Sessions
await client.startChargingSession(deviceId: number, options?: StartSessionOptions): Promise<ChargingSession>
await client.getChargingSession(sessionId: number): Promise<ChargingSession>
await client.getUserChargingStatus(): Promise<UserChargingStatus | null>
```

## Usage in Zeal

`apps/gaspar/src/sunkeep/` — sunkeep uses ChargePoint to start/stop the home charger and set amperage based on available solar power. Entry point is `sunkeep.plugin.ts`, which constructs the `ChargePoint` client and passes it to `SunkeepService`.

## Common Pitfalls

- Call `getUserChargingStatus()` before `startChargingSession()` — ChargePoint errors if a session is already active.
- `setAmperageLimit()` takes integer amps. Always `Math.round()` before calling.
- `InvalidSession` means the coulombToken expired — catch and re-authenticate.
- Source types: `../node-chargepoint/src/types.ts` has all response shapes.

````

- [ ] **Step 2: Verify**

```bash
cat .claude/skills/chargepoint.md
````

---

## Task 4: Discord Skill

**Files:**

- Create: `.claude/skills/discord.md`

- [ ] **Step 1: Write the file**

Create `.claude/skills/discord.md`:

````markdown
---
name: discord
description: Discord.js v14 reference — intents, event flow, and how worfbot-gateway connects to @repo/worfbot
---

# Discord

## Version

**discord.js 14.26.3** — use v14 API docs. Import from `discord.js`.

## Gateway Setup

`apps/worfbot-gateway/src/main.ts` bootstraps the client:

```ts
import { Client, Events, GatewayIntentBits } from 'discord.js';

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent, // privileged — see note below
	],
});
```
````

**MessageContent is a privileged intent.** Must be enabled in Discord Developer Portal:
Applications → [your app] → Bot → Privileged Gateway Intents → Message Content Intent.
Without it, the bot connects but receives empty message content.

## Event Flow

```
Discord → Events.MessageCreate  → findMatchingQuote() → message.reply()
Discord → Events.InteractionCreate → isChatInputCommand() → slash command handler
```

Check `interaction.isChatInputCommand()` before handling interactions — other interaction types (buttons, modals) share the same event.

## Slash Commands

Defined in `@repo/worfbot/src/commands/definitions.ts`. Registered via `pnpm --filter @repo/worfbot register-commands`. See `worfbot` skill for the full workflow.

## Environment Variables

| Var                      | Description                                            |
| ------------------------ | ------------------------------------------------------ |
| `DISCORD_TOKEN`          | Bot token from Discord Developer Portal                |
| `DISCORD_APPLICATION_ID` | Application ID (needed for slash command registration) |

## Key Types (discord.js v14)

```ts
ChatInputCommandInteraction; // slash command — use for command handlers
Message; // message event
GatewayIntentBits; // enum for intent flags
Events; // enum for event names (Events.MessageCreate, Events.InteractionCreate)
```

Internal lightweight types used by `@repo/worfbot`: `DiscordInteraction`, `DiscordEmbed` — see `packages/worfbot/src/discord/types.ts`.

````

- [ ] **Step 2: Verify**

```bash
cat .claude/skills/discord.md
````

---

## Task 5: Worfbot Skill

**Files:**

- Create: `.claude/skills/worfbot.md`

- [ ] **Step 1: Write the file**

Create `.claude/skills/worfbot.md`:

````markdown
---
name: worfbot
description: Worfbot command structure, how to add slash commands and keyword triggers — project-specific Discord bot patterns
---

# Worfbot

Discord bot for family use. Responds to slash commands and keyword-triggered messages with Worf quotes (Star Trek: TNG).

## Architecture

- `@repo/worfbot` (`packages/worfbot/`) — all bot logic: commands, keyword matcher, quotes JSON
- `apps/worfbot-gateway/` — bootstraps `@repo/worfbot`, connects to Discord

## Existing Slash Commands

| Command       | Description                                                                  |
| ------------- | ---------------------------------------------------------------------------- |
| `/timezone`   | Show current local times for all family members                              |
| `/quote`      | Receive a random Worf quote                                                  |
| `/add-member` | Add a family member with their IANA timezone (options: user, name, timezone) |

## Adding a New Slash Command

**All four steps are required. Step 4 is mandatory — without it the command never appears in Discord.**

**Step 1: Add to definitions**

`packages/worfbot/src/commands/definitions.ts`:

```ts
{
  name: 'my-command',
  description: 'What it does',
  options: [
    {
      name: 'input',
      type: 3, // STRING
      description: 'Some input',
      required: true,
    },
  ],
}
```
````

Option types: `3` = STRING, `4` = INTEGER, `5` = BOOLEAN, `6` = USER.

**Step 2: Create the handler**

`packages/worfbot/src/commands/my-command.ts`:

```ts
import type { ChatInputCommandInteraction } from 'discord.js';

export async function handleMyCommand(interaction: ChatInputCommandInteraction): Promise<void> {
	const input = interaction.options.getString('input', true);
	await interaction.reply({ content: `You said: ${input}` });
}
```

**Step 3: Wire in the gateway**

`apps/worfbot-gateway/src/main.ts`, inside the `Events.InteractionCreate` handler:

```ts
if (interaction.isChatInputCommand()) {
	if (interaction.commandName === 'my-command') {
		await handleMyCommand(interaction);
	}
}
```

**Step 4: Register with Discord (mandatory)**

```bash
pnpm --filter @repo/worfbot register-commands
```

This pushes the command list to the Discord API. Run it every time commands are added or changed. Without this step the command never appears in Discord even after deploy.

## Adding a Keyword Trigger

`packages/worfbot/src/keyword-matcher/triggers.ts` — add an entry:

```ts
{
  keywords: ['my-keyword', 'alternate-keyword'],
  quoteIndex: 42,            // use a specific quote from quotes.json, OR
  triggerMessage: 'Custom reply text',   // return a fixed string, OR
  gifUrl: 'https://...',     // return a gif URL
}
```

Matching uses case-insensitive word-boundary regex: `\bkeyword\b`. Only one of `quoteIndex`, `triggerMessage`, or `gifUrl` is used per trigger (checked in that order).

````

- [ ] **Step 2: Verify**

```bash
cat .claude/skills/worfbot.md
````

- [ ] **Step 3: Commit all four skills**

```bash
git add .claude/skills/
git commit -m "feat: add project-scoped API reference skills (Tesla, ChargePoint, Discord, worfbot)"
```

---

## Task 6: Update Root CLAUDE.md

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace the full file contents**

Rewrite `CLAUDE.md` with the following (preserves all existing accurate content, adds missing apps/packages/integrations, adds skills section and monorepo workflow):

````markdown
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
````

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

````

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update root CLAUDE.md with all apps, packages, integrations, and skills"
````

---

## Task 7: Gaspar App CLAUDE.md

**Files:**

- Create: `apps/gaspar/CLAUDE.md`

- [ ] **Step 1: Write the file**

Create `apps/gaspar/CLAUDE.md`:

````markdown
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
````

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

````

- [ ] **Step 2: Commit**

```bash
git add apps/gaspar/CLAUDE.md
git commit -m "docs: add apps/gaspar/CLAUDE.md with structure, workflows, and env vars"
````

---

## Task 8: Worfbot Gateway CLAUDE.md

**Files:**

- Create: `apps/worfbot-gateway/CLAUDE.md`

- [ ] **Step 1: Write the file**

Create `apps/worfbot-gateway/CLAUDE.md`:

````markdown
# Worfbot Gateway

Discord bot gateway running on the Raspberry Pi. Thin app that bootstraps `@repo/worfbot` and connects it to Discord using discord.js 14.

## Commands

```bash
pnpm --filter worfbot-gateway dev    # Dev server (tsx)
pnpm --filter worfbot-gateway build  # Build for production
```
````

## Structure

```
src/
  main.ts   # Bootstraps Discord client, registers event handlers, starts HTTP health server
```

All bot logic lives in `@repo/worfbot` (`packages/worfbot/`). The gateway only handles Discord connectivity — do not add business logic here.

## Adding a Slash Command

**All four steps are required. Skip step 4 and the command never appears in Discord.**

1. Add definition to `packages/worfbot/src/commands/definitions.ts`
2. Create handler in `packages/worfbot/src/commands/my-command.ts`
3. Wire the handler in `apps/worfbot-gateway/src/main.ts` under `Events.InteractionCreate`:

```ts
if (interaction.isChatInputCommand()) {
	if (interaction.commandName === 'my-command') {
		await handleMyCommand(interaction);
	}
}
```

4. **Register with Discord** (mandatory every time commands change):

```bash
pnpm --filter @repo/worfbot register-commands
```

See the `worfbot` skill for the full step-by-step with code examples.

## Environment Variables

| Var                      | Description                                      |
| ------------------------ | ------------------------------------------------ |
| `DISCORD_TOKEN`          | Bot token from Discord Developer Portal          |
| `DISCORD_APPLICATION_ID` | Application ID (needed for command registration) |

## Skills

- Discord intents and events: invoke `discord` skill
- Command patterns and keyword triggers: invoke `worfbot` skill

````

- [ ] **Step 2: Commit**

```bash
git add apps/worfbot-gateway/CLAUDE.md
git commit -m "docs: add apps/worfbot-gateway/CLAUDE.md with command workflow"
````

---

## Task 9: Fiendlord Keep UI CLAUDE.md

**Files:**

- Create: `apps/fiendlord-keep-ui/CLAUDE.md`

- [ ] **Step 1: Write the file**

Create `apps/fiendlord-keep-ui/CLAUDE.md`:

````markdown
# Fiendlord Keep UI

Next.js homelab dashboard running on the Raspberry Pi (port 3002). Displays live service health and system stats for all Pi-hosted services. Built with Radix UI Themes.

## Commands

```bash
pnpm --filter fiendlord-keep-ui dev    # Dev server with Turbopack on port 3002
pnpm --filter fiendlord-keep-ui build  # Production build
pnpm --filter fiendlord-keep-ui test   # Unit tests (vitest)
```
````

## Structure

```
app/
  layout.tsx          # Root layout — wraps in Radix <Theme> provider
  page.tsx            # Home — service health grid + magus stats
  logs/               # Log viewer page
  magus-stats/        # System stats page
  gaspar/             # Embedded gaspar sunkeep dashboard
  api/                # API routes (proxy to Pi services)
  services/           # Per-service page sections
lib/
  config.ts           # getApiBaseUrl() — resolves base URL for Pi API calls
  services.ts         # SERVICE_REGISTRY — defines all monitored services
  format.ts           # Formatting utilities
  sidebar-store.ts    # Sidebar UI state
components/
  service-card/       # Health card for a single service
  magus-stats-poller/ # Client component that polls for system stats
```

## Adding a New Service to the Dashboard

Add an entry to `SERVICE_REGISTRY` in `lib/services.ts`:

```ts
import type { ServiceConfig } from '@repo/magus-data';

// Add to the SERVICE_REGISTRY array:
{
  name: 'my-service',          // kebab-case identifier used in routing
  displayName: 'My Service',   // shown in the UI
  port: 3003,                  // optional — used for health check ping
  systemdUnit: 'my-service',   // systemd unit name for status checks
  color: 'blue',               // Radix UI color token
  subPages: [],                // optional: [{ name: 'slug', displayName: 'Label' }]
}
```

Available Radix color tokens: `teal`, `purple`, `orange`, `gray`, `blue`, `green`, `red`, `yellow`, `indigo`, `cyan`.

## Key Dependencies

- **Radix UI Themes** (`@radix-ui/themes`) — primary UI library. Use Radix theme tokens for color and spacing rather than custom CSS where possible.
- **`@repo/magus-data`** — types: `MagusStats`, `ServiceHealth`, `ServiceConfig`
- **`@repo/ui`** — shared primitive components (Button, Card, Code)

## Environment Variables

| Var                        | Description                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | Base URL for Pi API calls. Set to Pi address in prod; defaults to localhost in dev. |

````

- [ ] **Step 2: Commit**

```bash
git add apps/fiendlord-keep-ui/CLAUDE.md
git commit -m "docs: add apps/fiendlord-keep-ui/CLAUDE.md with service registry workflow"
````

---

## Task 10: Portfolio CLAUDE.md

**Files:**

- Create: `apps/portfolio/CLAUDE.md`

- [ ] **Step 1: Write the file**

Create `apps/portfolio/CLAUDE.md`:

````markdown
# Portfolio

Next.js app deployed to Vercel at patjacobs.com. Personal portfolio with Hygraph CMS for content. Also hosts the one-time Tesla OAuth callback endpoint used during initial Fleet API setup.

## Commands

```bash
pnpm --filter portfolio dev    # Pulls env from Vercel then starts next dev --turbopack
pnpm --filter portfolio build  # Production build
pnpm --filter portfolio test   # Unit tests (vitest)
```
````

## Structure

```
app/
  layout.tsx          # Root layout
  page.tsx            # Home page (server component)
  home-page.tsx       # Home page content
  projects/           # Projects section
  tesla/              # Tesla integration display pages
  actions/            # Server actions
  api/
    tesla/
      callback/       # Tesla OAuth callback — one-time setup endpoint
globals.css
```

## Deployment

Push to `main` triggers automatic Vercel deployment — no manual step needed.

Environment variables are managed via `vercel env` CLI or the Vercel dashboard. The dev script (`scripts/pull-env.sh`) pulls them locally before starting the dev server.

## Content

All editorial content comes from Hygraph CMS via `@repo/remote-data/src/hygraph.ts`. There are no local content files.

## Tesla OAuth Callback

`app/api/tesla/callback/` handles the one-time OAuth redirect during initial Fleet API setup. This is a static, rarely-touched endpoint. Do not modify without reading the `tesla-fleet-api` skill first.

## Key Dependencies

- **`@repo/remote-data`** — Hygraph CMS client (server-only)
- **`@repo/portfolio-data`** — Portfolio-specific data types
- **`@repo/worfbot`** — Worf quotes used on the site
- **`@flags-sdk/vercel`** — Feature flags
- **`@radix-ui/themes`** — UI components

````

- [ ] **Step 2: Commit**

```bash
git add apps/portfolio/CLAUDE.md
git commit -m "docs: add apps/portfolio/CLAUDE.md with deployment and CMS notes"
````
