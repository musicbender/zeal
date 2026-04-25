# Navi Discord Bot — Design Spec

## Context

The Jacobs family needs a Discord bot ("Navi") to coordinate across time zones. This is the foundational feature for a family Discord bot that will live in the zeal monorepo. The bot uses Discord's HTTP Interactions model — Discord POSTs to a Next.js route handler when slash commands are used. No persistent process or Gateway connection needed for this phase.

## Scope

Two slash commands:

- `/timezone` — displays all family members grouped by IANA timezone with current local times
- `/add-member` — registers a family member with their Discord user ID, display name, and timezone

Plus: Discord signature verification, command registration script, database schema, and package scaffolding.

## Architecture

### Package Structure

Four new/modified packages:

```
packages/
├── neon-client/           # NEW — extracted from neon-data
│   └── src/
│       ├── index.ts       # exports sql()
│       └── client.ts      # Neon connection (moved from neon-data)
│
├── portfolio-data/        # RENAMED from neon-data
│   └── src/
│       ├── index.ts       # re-exports activity, rings
│       ├── activity.ts    # unchanged
│       ├── rings.ts       # unchanged
│       ├── types.ts       # unchanged
│       └── dtos.ts        # unchanged
│
├── navi-data/             # NEW — family member data layer
│   └── src/
│       ├── index.ts       # re-exports queries, types, dtos
│       ├── family-members.ts  # query functions
│       ├── types.ts       # FamilyMember interface
│       └── dtos.ts        # CreateFamilyMemberDto
│
└── navi/                  # NEW — bot business logic
    ├── src/
    │   ├── index.ts       # public exports
    │   ├── commands/
    │   │   ├── timezone.ts      # /timezone handler
    │   │   ├── add-member.ts    # /add-member handler
    │   │   └── definitions.ts   # slash command JSON definitions
    │   └── discord/
    │       └── types.ts         # Discord interaction type helpers
    ├── scripts/
    │   └── register-commands.ts # standalone tsx script
    └── package.json
```

### Dependency Graph

```
apps/portfolio (route handler)
  └── @repo/navi (command handlers)
       └── @repo/navi-data (DB queries)
            └── @repo/neon-client (connection)

apps/portfolio (existing features)
  └── @repo/portfolio-data (activity, rings)
       └── @repo/neon-client (connection)
```

### Route Handler

Location: `apps/portfolio/app/api/discord/route.ts`

This is a thin orchestration layer:

```ts
import { verifyKey } from 'discord-interactions';
import { handleTimezone, handleAddMember } from '@repo/navi';

export async function POST(req: Request): Promise<Response> {
	// 1. Read raw body + signature headers
	// 2. Verify via verifyKey() — return 401 if invalid
	// 3. PING (type 1) → return { type: 1 }
	// 4. APPLICATION_COMMAND (type 2) → dispatch by command name
	//    - "timezone" → handleTimezone(interaction)
	//    - "add-member" → handleAddMember(interaction)
	// 5. Unknown → return 400
}
```

## Library Choice

**`discord-interactions`** (npm) — purpose-built for HTTP interactions. Provides:

- `verifyKey(rawBody, signature, timestamp, publicKey)` for signature verification
- `InteractionType` and `InteractionResponseType` enums
- ~5KB, zero transitive dependencies

When Gateway support is needed later, `discord.js` can be added alongside — they are not mutually exclusive.

## Database Schema

Single table in the existing Neon Postgres database:

```sql
CREATE TABLE family_members (
  id              SERIAL PRIMARY KEY,
  discord_user_id VARCHAR(20) NOT NULL UNIQUE,
  display_name    VARCHAR(100) NOT NULL,
  timezone        VARCHAR(50) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- `discord_user_id`: Discord snowflake IDs are up to 19 digits, VARCHAR(20) gives margin
- `timezone`: IANA timezone string (e.g. `America/New_York`, `Europe/London`)
- `UNIQUE` on `discord_user_id` prevents duplicate entries per user

Schema managed via a SQL migration file at `packages/navi-data/migrations/001_create_family_members.sql`. Run manually against Neon via `psql` or the Neon console.

## Data Layer (`@repo/navi-data`)

```ts
// types.ts
interface FamilyMember {
  id: number;
  discordUserId: string;
  displayName: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

// dtos.ts
interface CreateFamilyMemberDto {
  discordUserId: string;
  displayName: string;
  timezone: string;
}

// family-members.ts
getAllFamilyMembers(): Promise<FamilyMember[]>
getFamilyMemberByDiscordId(discordUserId: string): Promise<FamilyMember | null>
createFamilyMember(dto: CreateFamilyMemberDto): Promise<FamilyMember>
```

Dependencies: `@repo/neon-client`, `server-only`

## Command Handlers (`@repo/navi`)

### `/timezone`

1. Call `getAllFamilyMembers()` from `@repo/navi-data`
2. Group by `timezone` field
3. For each timezone group, format current local time using `Intl.DateTimeFormat`
4. Return a Discord embed:

```
--- Current Family Times ---

America/New_York (Eastern) — 3:42 PM
  Pat, Jordan

Europe/London (GMT) — 8:42 PM
  Alex

Asia/Tokyo (JST) — 4:42 AM (tomorrow)
  Sam
```

Returns `InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE` with an embed object.

If no family members exist, returns a friendly message suggesting `/add-member`.

### `/add-member`

Command options:

- `user` (USER type, required) — the Discord user to add
- `name` (STRING, required) — display name
- `timezone` (STRING, required) — IANA timezone string

Handler:

1. Validate timezone string against `Intl.supportedValuesOf('timeZone')`
2. Check for duplicate via `getFamilyMemberByDiscordId()`
3. Call `createFamilyMember()`
4. Return success message with the member's current local time

Error cases:

- Invalid timezone → ephemeral error message with suggestion
- Duplicate user → ephemeral message saying they're already registered
- DB error → ephemeral generic error message

### Command Definitions (`definitions.ts`)

Exports the slash command JSON array for registration:

```ts
export const commands = [
	{
		name: 'timezone',
		description: 'Show current local times for all family members',
	},
	{
		name: 'add-member',
		description: 'Add a family member with their timezone',
		options: [
			{ name: 'user', type: 6, description: 'Discord user', required: true },
			{ name: 'name', type: 3, description: 'Display name', required: true },
			{
				name: 'timezone',
				type: 3,
				description: 'IANA timezone (e.g. America/New_York)',
				required: true,
			},
		],
	},
];
```

## Command Registration Script

`packages/navi/scripts/register-commands.ts`

A standalone script run via `tsx`:

```bash
pnpm --filter navi register-commands
```

Uses `fetch` to PUT to `https://discord.com/api/v10/applications/{APP_ID}/commands` with the command definitions. Reads `DISCORD_APP_ID` and `DISCORD_BOT_TOKEN` from environment.

## Environment Variables

Three new variables added to `turbo.json` globalEnv and managed via `vercel env`:

| Variable             | Purpose                                 |
| -------------------- | --------------------------------------- |
| `DISCORD_PUBLIC_KEY` | Signature verification in route handler |
| `DISCORD_APP_ID`     | Command registration + API calls        |
| `DISCORD_BOT_TOKEN`  | Command registration (Bot auth header)  |

## Discord Developer Portal Setup

Instructions for the user (not automated):

1. Go to https://discord.com/developers/applications
2. Click "New Application", name it "Navi"
3. Go to Bot tab → click "Reset Token" → copy the bot token (`DISCORD_BOT_TOKEN`)
4. Go to General Information → copy Application ID (`DISCORD_APP_ID`) and Public Key (`DISCORD_PUBLIC_KEY`)
5. Go to OAuth2 → URL Generator:
   - Scopes: `applications.commands` (slash commands)
   - No bot permissions needed for HTTP-only interactions
6. Use the generated URL to invite Navi to your Discord server
7. After deploying, set the Interactions Endpoint URL to `https://your-domain.vercel.app/api/discord`
8. Discord will send a PING to verify — the route handler responds automatically

## Verification Plan

1. **Unit tests**: Test command handlers with mocked data layer
2. **Signature verification**: Test with known-good and known-bad signatures
3. **Manual E2E**: Deploy to Vercel preview → set as interactions endpoint → use `/timezone` and `/add-member` in Discord
4. **Edge cases**: Empty member list, duplicate add, invalid timezone string
