# Zeal Monorepo AI Optimization Design

**Date:** 2026-05-17
**Status:** Approved
**Feature:** Optimize the zeal monorepo for Claude Code via CLAUDE.md files and project-scoped skills

---

## Goal

Reduce repeated context-setting when working in this monorepo by giving Claude authoritative, project-scoped reference material: updated CLAUDE.md files at the root and per-app level, and custom skills for the external APIs this project integrates with.

---

## Approach

Approach A (Targeted) was selected:

- Update root CLAUDE.md to cover all apps and packages
- Add CLAUDE.md to each of the four active apps, including workflow definitions
- Add four project-scoped API reference skills to `.claude/skills/`
- Install turborepo skill via `npx skills add vercel/turborepo`
- Skip package-level CLAUDE.md (root coverage is sufficient for simple packages)
- Skip nextjs/radix-ui skills (Vercel plugin covers Next.js; radix-ui is well-covered by Claude's training)

---

## File Structure

```
zeal/
├── CLAUDE.md                                    ← updated
├── .claude/
│   └── skills/
│       ├── tesla-fleet-api.md                   ← new
│       ├── chargepoint.md                       ← new
│       ├── discord.md                           ← new
│       └── worfbot.md                           ← new
├── apps/
│   ├── gaspar/CLAUDE.md                         ← new
│   ├── worfbot-gateway/CLAUDE.md                ← new
│   ├── fiendlord-keep-ui/CLAUDE.md              ← new
│   └── portfolio/CLAUDE.md                      ← new
└── skills-lock.json                             ← updated via npx skills add vercel/turborepo
```

Skills in `.claude/skills/` are markdown files with frontmatter (name, description, type) and are invocable via the Skill tool. The turborepo skill installs from GitHub into `.claude/plugins/`.

---

## Root CLAUDE.md Updates

### Apps section additions

| App                      | Description                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/worfbot-gateway`   | Discord bot gateway. Thin wrapper that bootstraps `@repo/worfbot` and connects to Discord via Discord.js.                                        |
| `apps/fiendlord-keep-ui` | Next.js homelab dashboard (port 3002). Radix UI Themes. Displays service health and magus stats for Pi-hosted services. Uses `@repo/magus-data`. |
| `apps/portfolio`         | Next.js on Vercel at patjacobs.com. Hygraph CMS for content. Hosts Tesla OAuth callback at `/api/tesla/callback`.                                |
| `apps/portfolio-e2e`     | Playwright e2e tests for portfolio.                                                                                                              |

### Packages section additions

| Package              | Description                                                                             |
| -------------------- | --------------------------------------------------------------------------------------- |
| `@repo/worfbot`      | Discord bot logic: slash commands, keyword matcher, theme. Consumed by worfbot-gateway. |
| `@repo/worfbot-data` | Data types for worfbot.                                                                 |
| `@repo/neon-client`  | Neon serverless Postgres client wrapper (server-only).                                  |
| `@repo/neon-data`    | Data access layer for Neon DB.                                                          |
| `@repo/magus-data`   | Types for homelab service stats (MagusStats, ServiceHealth).                            |
| `@repo/remote-data`  | Remote data fetching utilities including Hygraph client.                                |
| `@repo/logger`       | Shared structured logger.                                                               |
| `@repo/utils`        | Shared utility functions.                                                               |
| `@repo/constants`    | Shared constants.                                                                       |

### New: External Integrations section

Brief pointers to where each integration lives and which skill covers it:

- **Tesla Fleet API** → `apps/gaspar/src/sunkeep/tesla.client.ts` (see `.claude/skills/tesla-fleet-api.md`)
- **ChargePoint** → `apps/gaspar/src/sunkeep/` via `node-chargepoint` at `../node-chargepoint` (see `.claude/skills/chargepoint.md`)
- **Discord** → `apps/worfbot-gateway` + `@repo/worfbot` (see `.claude/skills/discord.md` and `.claude/skills/worfbot.md`)
- **Hygraph CMS** → `@repo/remote-data/src/hygraph.ts`

### New: Skills section

List of project skills and when to invoke them.

### Monorepo workflow additions

- **Adding a new app or package**: turbo pipeline entry in `turbo.json`, pnpm workspace registration in `pnpm-workspace.yaml`, extend appropriate tsconfig base from `@repo/typescript-config`

---

## App-Level CLAUDE.md Files

### `apps/gaspar/CLAUDE.md`

- What it is: Fastify REST API running on Raspberry Pi (port 3000). Prisma ORM with Neon Postgres in prod, SQLite locally.
- Key modules: `sensors/` (CRUD), `sunkeep/` (solar automation — Tesla + ChargePoint)
- App-specific dev commands (filter commands, prisma workflows)
- **Prisma workflow**: run `prisma:generate` after schema changes; prod migrations run on the Pi via SSH
- **Adding a Fastify plugin/route**: plugin registration pattern, where to register
- **Endpoint workflow**: when adding or changing an endpoint — design/plan first → implement → run tests (`pnpm --filter gaspar test`) → update `docs/postman/gaspar.postman_collection.json`
- References: `tesla-fleet-api` and `chargepoint` skills

### `apps/worfbot-gateway/CLAUDE.md`

- What it is: thin gateway that bootstraps `@repo/worfbot` and connects to Discord
- Discord.js version and intents in use
- **Adding a slash command**: create command in `@repo/worfbot/src/commands/` → register in index → **run `register-commands` script** (mandatory — pushes command registration to Discord API; skipping this means the command never appears in Discord)
- References: `discord` and `worfbot` skills

### `apps/fiendlord-keep-ui/CLAUDE.md`

- What it is: Next.js homelab dashboard (port 3002) using Radix UI Themes
- Displays service health cards and magus stats for Pi-hosted services
- **Adding a service**: add entry to `SERVICE_REGISTRY` in `lib/services.ts`
- Connects to gaspar API and other services via base URL from `lib/config.ts`

### `apps/portfolio/CLAUDE.md`

- Next.js app deployed to Vercel at patjacobs.com
- Hygraph CMS for content via `@repo/remote-data`
- Hosts Tesla OAuth callback at `/api/tesla/callback` (one-time setup flow documented in `tesla-fleet-api` skill)
- Deploy: push to main triggers Vercel deployment automatically

---

## Skills

### `.claude/skills/tesla-fleet-api.md`

Content covers:

- RSA key pair auth, OAuth2 with refresh tokens (~8h TTL)
- How `TeslaEnergyClient` manages token refresh (`refreshIfNeeded()` must be called before requests)
- Key endpoints: `live_status`, `energy_site_id` lookup
- Implementation location: `apps/gaspar/src/sunkeep/tesla.client.ts`
- Env vars: `TESLA_PRIVATE_KEY`, `TESLA_ENERGY_SITE_ID`, `TESLA_REFRESH_TOKEN`
- Common pitfall: access tokens expire — never assume a cached token is valid

### `.claude/skills/chargepoint.md`

Content covers:

- The client library is `../node-chargepoint` (sibling repo, owned by Pat) — reference its source for types/methods
- Auth: `ChargePoint.create(username, options)` async factory; `coulombToken` persists the session
- Key operations: home charger status, start/stop session, set amperage
- Where it's used in zeal: `apps/gaspar/src/sunkeep/`
- Env vars: `CHARGEPOINT_USERNAME`, `CHARGEPOINT_TOKEN`

### `.claude/skills/discord.md`

Content covers:

- Discord.js version in use and configured intents
- Slash command vs message command distinction
- How events flow from worfbot-gateway into `@repo/worfbot`
- Pointer to `worfbot` skill for command-specific patterns

### `.claude/skills/worfbot.md`

Content covers:

- What worfbot is: Discord bot for home automation and entertainment
- Command structure in `@repo/worfbot/src/commands/`
- Step-by-step: how to add a new slash command (including the mandatory `register-commands` step)
- Keyword matcher: how it works, how to add new keywords

### Turborepo skill

Installed via:

```bash
npx skills add vercel/turborepo
```

Lands in `.claude/plugins/` and is tracked in `skills-lock.json`.

---

## Out of Scope

- Package-level CLAUDE.md files (root coverage sufficient)
- nextjs skill (Vercel plugin covers this)
- radix-ui skill (well-covered by Claude's training)
- Instructions files / custom slash commands
