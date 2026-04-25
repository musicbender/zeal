# Navi Discord Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Discord bot ("Navi") that handles `/timezone` and `/add-member` slash commands via HTTP Interactions through a Next.js route handler, backed by Neon Postgres.

**Architecture:** Discord POSTs interactions to `apps/portfolio/app/api/discord/route.ts`, which verifies the signature and delegates to command handlers in `@repo/navi`. Data queries live in `@repo/navi-data`, backed by a shared `@repo/neon-client` connection extracted from the existing `@repo/neon-data` package.

**Tech Stack:** Next.js 16 (App Router), discord-interactions, @neondatabase/serverless, Vitest, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-24-navi-discord-bot-design.md`

---

### Task 1: Extract `@repo/neon-client` from `@repo/neon-data`

Extract the shared Neon connection into its own package so both `portfolio-data` and `navi-data` can depend on it.

**Files:**

- Create: `packages/neon-client/package.json`
- Create: `packages/neon-client/tsconfig.json`
- Create: `packages/neon-client/src/index.ts`
- Modify: `packages/neon-data/src/client.ts` (delete — moved to neon-client)
- Modify: `packages/neon-data/src/activity.ts` (update import)
- Modify: `packages/neon-data/src/rings.ts` (update import)
- Modify: `packages/neon-data/package.json` (add neon-client dep, remove @neondatabase/serverless)

- [ ] **Step 1: Create `packages/neon-client/package.json`**

```json
{
	"name": "@repo/neon-client",
	"version": "0.0.0",
	"private": true,
	"type": "module",
	"exports": {
		".": "./src/index.ts"
	},
	"scripts": {
		"lint": "eslint . --max-warnings 50",
		"typecheck": "tsc --noEmit"
	},
	"dependencies": {
		"@neondatabase/serverless": "^0.10.4",
		"server-only": "0.0.1"
	},
	"devDependencies": {
		"@repo/eslint-config": "workspace:*",
		"@repo/typescript-config": "workspace:*",
		"@types/node": "^22.15.3",
		"eslint": "^9.31.0",
		"typescript": "5.5.4"
	}
}
```

- [ ] **Step 2: Create `packages/neon-client/tsconfig.json`**

```json
{
	"extends": "@repo/typescript-config/base.json",
	"compilerOptions": {
		"outDir": "dist",
		"moduleResolution": "bundler"
	},
	"include": ["src"],
	"exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `packages/neon-client/src/index.ts`**

Move the client code from `packages/neon-data/src/client.ts`:

```ts
import 'server-only';

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let _sql: NeonQueryFunction<false, false> | undefined;

export function sql(): NeonQueryFunction<false, false> {
	if (!_sql) {
		const url = process.env.POSTGRES_URL;
		if (!url) {
			throw new Error('POSTGRES_URL environment variable is not set');
		}
		_sql = neon(url);
	}
	return _sql;
}
```

- [ ] **Step 4: Delete `packages/neon-data/src/client.ts`**

Remove the file entirely — it has been moved to `@repo/neon-client`.

- [ ] **Step 5: Update `packages/neon-data/src/activity.ts` import**

Change line 3 from:

```ts
import { sql } from './client';
```

to:

```ts
import { sql } from '@repo/neon-client';
```

- [ ] **Step 6: Update `packages/neon-data/src/rings.ts` import**

Change line 3 from:

```ts
import { sql } from './client';
```

to:

```ts
import { sql } from '@repo/neon-client';
```

- [ ] **Step 7: Update `packages/neon-data/package.json`**

Add `@repo/neon-client` as a dependency and remove `@neondatabase/serverless` (it's now in neon-client):

```json
{
	"dependencies": {
		"@repo/neon-client": "workspace:*",
		"server-only": "0.0.1"
	}
}
```

- [ ] **Step 8: Install dependencies and verify**

Run: `pnpm install && pnpm typecheck`

Expected: Clean install, no type errors.

- [ ] **Step 9: Commit**

```bash
git add packages/neon-client packages/neon-data
git commit -m "refactor: extract @repo/neon-client from neon-data"
```

---

### Task 2: Rename `@repo/neon-data` to `@repo/portfolio-data`

Rename the package to reflect its actual scope (portfolio queries only, no longer the DB client).

**Files:**

- Modify: `packages/neon-data/package.json` (rename to `@repo/portfolio-data`)
- Modify: `apps/portfolio/package.json` (update dependency)
- Modify: `apps/portfolio/app/api/activity/route.ts` (update import)
- Modify: `apps/portfolio/app/api/activity/[id]/route.ts` (update import)
- Modify: `apps/portfolio/app/api/rings/route.ts` (update import)
- Modify: `apps/portfolio/app/api/rings/[id]/route.ts` (update import)
- Modify: all test files referencing `@repo/neon-data`

- [ ] **Step 1: Rename the directory**

```bash
mv packages/neon-data packages/portfolio-data
```

- [ ] **Step 2: Update `packages/portfolio-data/package.json` name**

Change the `name` field from `"@repo/neon-data"` to `"@repo/portfolio-data"`.

- [ ] **Step 3: Update `apps/portfolio/package.json` dependency**

Replace:

```json
"@repo/neon-data": "workspace:*",
```

with:

```json
"@repo/portfolio-data": "workspace:*",
```

- [ ] **Step 4: Update all imports in `apps/portfolio`**

Find all files importing from `@repo/neon-data` and change to `@repo/portfolio-data`. These are the route handlers and their tests:

- `apps/portfolio/app/api/activity/route.ts` — lines 1-2
- `apps/portfolio/app/api/activity/[id]/route.ts`
- `apps/portfolio/app/api/activity/route.test.ts` — lines 4, 8
- `apps/portfolio/app/api/activity/[id]/route.test.ts`
- `apps/portfolio/app/api/rings/route.ts`
- `apps/portfolio/app/api/rings/[id]/route.ts`
- `apps/portfolio/app/api/rings/route.test.ts`
- `apps/portfolio/app/api/rings/[id]/route.test.ts`

In each file, replace `@repo/neon-data` with `@repo/portfolio-data`.

- [ ] **Step 5: Install and verify**

Run: `pnpm install && pnpm typecheck && pnpm --filter portfolio test`

Expected: Clean install, no type errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/portfolio-data apps/portfolio
git commit -m "refactor: rename @repo/neon-data to @repo/portfolio-data"
```

---

### Task 3: Create `@repo/navi-data` package

The data layer for family member queries.

**Files:**

- Create: `packages/navi-data/package.json`
- Create: `packages/navi-data/tsconfig.json`
- Create: `packages/navi-data/src/types.ts`
- Create: `packages/navi-data/src/dtos.ts`
- Create: `packages/navi-data/src/family-members.ts`
- Create: `packages/navi-data/src/index.ts`
- Create: `packages/navi-data/migrations/001_create_family_members.sql`

- [ ] **Step 1: Create `packages/navi-data/package.json`**

```json
{
	"name": "@repo/navi-data",
	"version": "0.0.0",
	"private": true,
	"type": "module",
	"exports": {
		".": "./src/index.ts",
		"./*": "./src/*.ts"
	},
	"scripts": {
		"lint": "eslint . --max-warnings 50",
		"typecheck": "tsc --noEmit"
	},
	"dependencies": {
		"@repo/neon-client": "workspace:*",
		"server-only": "0.0.1"
	},
	"devDependencies": {
		"@repo/eslint-config": "workspace:*",
		"@repo/typescript-config": "workspace:*",
		"@types/node": "^22.15.3",
		"eslint": "^9.31.0",
		"typescript": "5.5.4"
	}
}
```

- [ ] **Step 2: Create `packages/navi-data/tsconfig.json`**

```json
{
	"extends": "@repo/typescript-config/base.json",
	"compilerOptions": {
		"outDir": "dist",
		"moduleResolution": "bundler"
	},
	"include": ["src"],
	"exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `packages/navi-data/src/types.ts`**

```ts
export interface FamilyMember {
	id: number;
	discord_user_id: string;
	display_name: string;
	timezone: string;
	created_at: Date;
	updated_at: Date;
}
```

- [ ] **Step 4: Create `packages/navi-data/src/dtos.ts`**

```ts
export interface CreateFamilyMemberDto {
	discord_user_id: string;
	display_name: string;
	timezone: string;
}
```

- [ ] **Step 5: Create `packages/navi-data/src/family-members.ts`**

```ts
import 'server-only';

import { sql } from '@repo/neon-client';
import type { CreateFamilyMemberDto } from './dtos';
import type { FamilyMember } from './types';

export async function getAllFamilyMembers(): Promise<FamilyMember[]> {
	const rows = await sql()`
    SELECT * FROM family_members ORDER BY display_name ASC
  `;
	return rows as FamilyMember[];
}

export async function getFamilyMemberByDiscordId(
	discordUserId: string
): Promise<FamilyMember | null> {
	const rows = await sql()`
    SELECT * FROM family_members WHERE discord_user_id = ${discordUserId}
  `;
	return (rows[0] as FamilyMember) ?? null;
}

export async function createFamilyMember(dto: CreateFamilyMemberDto): Promise<FamilyMember> {
	const rows = await sql()`
    INSERT INTO family_members (discord_user_id, display_name, timezone)
    VALUES (${dto.discord_user_id}, ${dto.display_name}, ${dto.timezone})
    RETURNING *
  `;
	return rows[0] as FamilyMember;
}
```

- [ ] **Step 6: Create `packages/navi-data/src/index.ts`**

```ts
export {
	getAllFamilyMembers,
	getFamilyMemberByDiscordId,
	createFamilyMember,
} from './family-members';
export type { FamilyMember } from './types';
export type { CreateFamilyMemberDto } from './dtos';
```

- [ ] **Step 7: Create `packages/navi-data/migrations/001_create_family_members.sql`**

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

- [ ] **Step 8: Install and verify**

Run: `pnpm install && pnpm --filter @repo/navi-data typecheck`

Expected: Clean install, no type errors.

- [ ] **Step 9: Commit**

```bash
git add packages/navi-data
git commit -m "feat: add @repo/navi-data package with family member schema and queries"
```

---

### Task 4: Create `@repo/navi` package — command definitions

The bot business logic package. Start with the command definitions and Discord types.

**Files:**

- Create: `packages/navi/package.json`
- Create: `packages/navi/tsconfig.json`
- Create: `packages/navi/src/discord/types.ts`
- Create: `packages/navi/src/commands/definitions.ts`
- Create: `packages/navi/src/index.ts`

- [ ] **Step 1: Create `packages/navi/package.json`**

```json
{
	"name": "@repo/navi",
	"version": "0.0.0",
	"private": true,
	"type": "module",
	"exports": {
		".": "./src/index.ts"
	},
	"scripts": {
		"lint": "eslint . --max-warnings 50",
		"typecheck": "tsc --noEmit",
		"test": "vitest run",
		"test:watch": "vitest",
		"register-commands": "tsx scripts/register-commands.ts"
	},
	"dependencies": {
		"@repo/navi-data": "workspace:*",
		"discord-interactions": "^4.1.0"
	},
	"devDependencies": {
		"@repo/eslint-config": "workspace:*",
		"@repo/typescript-config": "workspace:*",
		"@types/node": "^22.15.3",
		"eslint": "^9.31.0",
		"tsx": "^4.19.4",
		"typescript": "5.5.4",
		"vitest": "4.0.18"
	}
}
```

- [ ] **Step 2: Create `packages/navi/tsconfig.json`**

```json
{
	"extends": "@repo/typescript-config/base.json",
	"compilerOptions": {
		"outDir": "dist",
		"moduleResolution": "bundler"
	},
	"include": ["src"],
	"exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `packages/navi/src/discord/types.ts`**

Minimal types for Discord interaction objects used by the command handlers:

```ts
export interface DiscordInteraction {
	type: number;
	data?: {
		name: string;
		options?: DiscordCommandOption[];
	};
	member?: {
		user: {
			id: string;
			username: string;
		};
	};
}

export interface DiscordCommandOption {
	name: string;
	type: number;
	value: string;
}

export interface DiscordEmbed {
	title?: string;
	description?: string;
	color?: number;
	fields?: { name: string; value: string; inline?: boolean }[];
	footer?: { text: string };
}
```

- [ ] **Step 4: Create `packages/navi/src/commands/definitions.ts`**

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
			{
				name: 'user',
				type: 6, // USER
				description: 'Discord user to add',
				required: true,
			},
			{
				name: 'name',
				type: 3, // STRING
				description: 'Display name for the family member',
				required: true,
			},
			{
				name: 'timezone',
				type: 3, // STRING
				description: 'IANA timezone (e.g. America/New_York)',
				required: true,
			},
		],
	},
];
```

- [ ] **Step 5: Create `packages/navi/src/index.ts`** (placeholder — exports added in later tasks)

```ts
export { commands } from './commands/definitions';
```

- [ ] **Step 6: Install and verify**

Run: `pnpm install && pnpm --filter @repo/navi typecheck`

Expected: Clean install, no type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/navi
git commit -m "feat: add @repo/navi package with command definitions and Discord types"
```

---

### Task 5: Implement `/timezone` command handler (TDD)

**Files:**

- Create: `packages/navi/src/commands/timezone.ts`
- Create: `packages/navi/src/commands/timezone.test.ts`
- Modify: `packages/navi/src/index.ts` (add export)

- [ ] **Step 1: Write the failing test**

Create `packages/navi/src/commands/timezone.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@repo/navi-data', () => ({
	getAllFamilyMembers: vi.fn(),
}));

import { getAllFamilyMembers } from '@repo/navi-data';
import type { DiscordInteraction } from '../discord/types';
import { handleTimezone } from './timezone';

const mockInteraction: DiscordInteraction = {
	type: 2,
	data: { name: 'timezone' },
};

afterEach(() => {
	vi.clearAllMocks();
});

describe('handleTimezone', () => {
	it('returns a message when no family members exist', async () => {
		vi.mocked(getAllFamilyMembers).mockResolvedValueOnce([]);

		const response = await handleTimezone(mockInteraction);
		const body = await response.json();

		expect(body.type).toBe(4); // CHANNEL_MESSAGE_WITH_SOURCE
		expect(body.data.content).toContain('No family members');
	});

	it('groups family members by timezone', async () => {
		vi.mocked(getAllFamilyMembers).mockResolvedValueOnce([
			{
				id: 1,
				discord_user_id: '111',
				display_name: 'Pat',
				timezone: 'America/New_York',
				created_at: new Date(),
				updated_at: new Date(),
			},
			{
				id: 2,
				discord_user_id: '222',
				display_name: 'Jordan',
				timezone: 'America/New_York',
				created_at: new Date(),
				updated_at: new Date(),
			},
			{
				id: 3,
				discord_user_id: '333',
				display_name: 'Alex',
				timezone: 'Europe/London',
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		const response = await handleTimezone(mockInteraction);
		const body = await response.json();

		expect(body.type).toBe(4);
		expect(body.data.embeds).toHaveLength(1);
		const embed = body.data.embeds[0];
		expect(embed.fields).toHaveLength(2); // two timezone groups
		// America/New_York group should contain both Pat and Jordan
		const nyField = embed.fields.find((f: { value: string }) => f.value.includes('Pat'));
		expect(nyField.value).toContain('Jordan');
		// Europe/London group should contain Alex
		const londonField = embed.fields.find((f: { value: string }) => f.value.includes('Alex'));
		expect(londonField).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @repo/navi test`

Expected: FAIL — `handleTimezone` is not exported.

- [ ] **Step 3: Implement `packages/navi/src/commands/timezone.ts`**

```ts
import { getAllFamilyMembers } from '@repo/navi-data';
import type { FamilyMember } from '@repo/navi-data';
import type { DiscordEmbed, DiscordInteraction } from '../discord/types';

function formatTimeForTimezone(timezone: string): string {
	return new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		hour: 'numeric',
		minute: '2-digit',
		weekday: 'short',
		hour12: true,
	}).format(new Date());
}

function groupByTimezone(members: FamilyMember[]): Map<string, FamilyMember[]> {
	const groups = new Map<string, FamilyMember[]>();
	for (const member of members) {
		const group = groups.get(member.timezone) ?? [];
		group.push(member);
		groups.set(member.timezone, group);
	}
	return groups;
}

export async function handleTimezone(_interaction: DiscordInteraction): Promise<Response> {
	const members = await getAllFamilyMembers();

	if (members.length === 0) {
		return Response.json({
			type: 4,
			data: {
				content: 'No family members registered yet! Use `/add-member` to add someone.',
			},
		});
	}

	const groups = groupByTimezone(members);
	const fields: DiscordEmbed['fields'] = [];

	for (const [timezone, group] of groups) {
		const time = formatTimeForTimezone(timezone);
		const names = group.map((m) => m.display_name).join(', ');
		fields.push({
			name: `${timezone} \u2014 ${time}`,
			value: names,
			inline: false,
		});
	}

	return Response.json({
		type: 4,
		data: {
			embeds: [
				{
					title: '\uD83C\uDF0D Family Timezones',
					fields,
					color: 0x5865f2,
				},
			],
		},
	});
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @repo/navi test`

Expected: All tests PASS.

- [ ] **Step 5: Update `packages/navi/src/index.ts`**

```ts
export { commands } from './commands/definitions';
export { handleTimezone } from './commands/timezone';
```

- [ ] **Step 6: Commit**

```bash
git add packages/navi/src/commands/timezone.ts packages/navi/src/commands/timezone.test.ts packages/navi/src/index.ts
git commit -m "feat: implement /timezone command handler with tests"
```

---

### Task 6: Implement `/add-member` command handler (TDD)

**Files:**

- Create: `packages/navi/src/commands/add-member.ts`
- Create: `packages/navi/src/commands/add-member.test.ts`
- Modify: `packages/navi/src/index.ts` (add export)

- [ ] **Step 1: Write the failing test**

Create `packages/navi/src/commands/add-member.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@repo/navi-data', () => ({
	getFamilyMemberByDiscordId: vi.fn(),
	createFamilyMember: vi.fn(),
}));

import { createFamilyMember, getFamilyMemberByDiscordId } from '@repo/navi-data';
import type { DiscordInteraction } from '../discord/types';
import { handleAddMember } from './add-member';

function makeInteraction(
	options: { name: string; type: number; value: string }[]
): DiscordInteraction {
	return {
		type: 2,
		data: {
			name: 'add-member',
			options,
		},
	};
}

afterEach(() => {
	vi.clearAllMocks();
});

describe('handleAddMember', () => {
	it('creates a family member and returns success', async () => {
		vi.mocked(getFamilyMemberByDiscordId).mockResolvedValueOnce(null);
		vi.mocked(createFamilyMember).mockResolvedValueOnce({
			id: 1,
			discord_user_id: '12345',
			display_name: 'Pat',
			timezone: 'America/New_York',
			created_at: new Date(),
			updated_at: new Date(),
		});

		const response = await handleAddMember(
			makeInteraction([
				{ name: 'user', type: 6, value: '12345' },
				{ name: 'name', type: 3, value: 'Pat' },
				{ name: 'timezone', type: 3, value: 'America/New_York' },
			])
		);
		const body = await response.json();

		expect(body.type).toBe(4);
		expect(body.data.content).toContain('Pat');
		expect(createFamilyMember).toHaveBeenCalledWith({
			discord_user_id: '12345',
			display_name: 'Pat',
			timezone: 'America/New_York',
		});
	});

	it('returns ephemeral error for invalid timezone', async () => {
		const response = await handleAddMember(
			makeInteraction([
				{ name: 'user', type: 6, value: '12345' },
				{ name: 'name', type: 3, value: 'Pat' },
				{ name: 'timezone', type: 3, value: 'Fake/Timezone' },
			])
		);
		const body = await response.json();

		expect(body.type).toBe(4);
		expect(body.data.flags).toBe(64); // EPHEMERAL
		expect(body.data.content).toContain('Invalid timezone');
		expect(createFamilyMember).not.toHaveBeenCalled();
	});

	it('returns ephemeral error for duplicate user', async () => {
		vi.mocked(getFamilyMemberByDiscordId).mockResolvedValueOnce({
			id: 1,
			discord_user_id: '12345',
			display_name: 'Pat',
			timezone: 'America/New_York',
			created_at: new Date(),
			updated_at: new Date(),
		});

		const response = await handleAddMember(
			makeInteraction([
				{ name: 'user', type: 6, value: '12345' },
				{ name: 'name', type: 3, value: 'Pat' },
				{ name: 'timezone', type: 3, value: 'America/New_York' },
			])
		);
		const body = await response.json();

		expect(body.type).toBe(4);
		expect(body.data.flags).toBe(64);
		expect(body.data.content).toContain('already registered');
		expect(createFamilyMember).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @repo/navi test`

Expected: FAIL — `handleAddMember` is not exported.

- [ ] **Step 3: Implement `packages/navi/src/commands/add-member.ts`**

```ts
import { createFamilyMember, getFamilyMemberByDiscordId } from '@repo/navi-data';
import type { DiscordInteraction } from '../discord/types';

function getOptionValue(interaction: DiscordInteraction, name: string): string | undefined {
	return interaction.data?.options?.find((o) => o.name === name)?.value;
}

function isValidTimezone(tz: string): boolean {
	try {
		Intl.DateTimeFormat(undefined, { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

function ephemeral(content: string): Response {
	return Response.json({
		type: 4,
		data: { content, flags: 64 },
	});
}

export async function handleAddMember(interaction: DiscordInteraction): Promise<Response> {
	const userId = getOptionValue(interaction, 'user');
	const displayName = getOptionValue(interaction, 'name');
	const timezone = getOptionValue(interaction, 'timezone');

	if (!userId || !displayName || !timezone) {
		return ephemeral('Missing required options.');
	}

	if (!isValidTimezone(timezone)) {
		return ephemeral(
			`Invalid timezone "${timezone}". Use an IANA timezone like \`America/New_York\` or \`Europe/London\`.`
		);
	}

	const existing = await getFamilyMemberByDiscordId(userId);
	if (existing) {
		return ephemeral(`<@${userId}> is already registered as "${existing.display_name}".`);
	}

	const member = await createFamilyMember({
		discord_user_id: userId,
		display_name: displayName,
		timezone,
	});

	const currentTime = new Intl.DateTimeFormat('en-US', {
		timeZone: member.timezone,
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
	}).format(new Date());

	return Response.json({
		type: 4,
		data: {
			content: `Added **${member.display_name}** (<@${member.discord_user_id}>) with timezone \`${member.timezone}\`. Their current time is **${currentTime}**.`,
		},
	});
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @repo/navi test`

Expected: All tests PASS.

- [ ] **Step 5: Update `packages/navi/src/index.ts`**

```ts
export { commands } from './commands/definitions';
export { handleTimezone } from './commands/timezone';
export { handleAddMember } from './commands/add-member';
```

- [ ] **Step 6: Commit**

```bash
git add packages/navi/src/commands/add-member.ts packages/navi/src/commands/add-member.test.ts packages/navi/src/index.ts
git commit -m "feat: implement /add-member command handler with tests"
```

---

### Task 7: Create Discord route handler with signature verification (TDD)

**Files:**

- Create: `apps/portfolio/app/api/discord/route.ts`
- Create: `apps/portfolio/app/api/discord/route.test.ts`
- Modify: `apps/portfolio/package.json` (add `@repo/navi` + `discord-interactions` deps)

- [ ] **Step 1: Add dependencies to `apps/portfolio/package.json`**

Add to `dependencies`:

```json
"@repo/navi": "workspace:*",
"discord-interactions": "^4.1.0"
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test**

Create `apps/portfolio/app/api/discord/route.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('discord-interactions', () => ({
	verifyKey: vi.fn(),
}));

vi.mock('@repo/navi', () => ({
	handleTimezone: vi.fn(),
	handleAddMember: vi.fn(),
}));

import { verifyKey } from 'discord-interactions';
import { handleAddMember, handleTimezone } from '@repo/navi';
import { POST } from './route';

const PUBLIC_KEY = 'test-public-key';

function makeRequest(body: unknown, signature = 'valid-sig', timestamp = '12345'): Request {
	return new Request('http://localhost/api/discord', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-signature-ed25519': signature,
			'x-signature-timestamp': timestamp,
		},
		body: JSON.stringify(body),
	});
}

describe('POST /api/discord', () => {
	beforeEach(() => {
		process.env.DISCORD_PUBLIC_KEY = PUBLIC_KEY;
	});

	afterEach(() => {
		delete process.env.DISCORD_PUBLIC_KEY;
		vi.clearAllMocks();
	});

	it('returns 401 when signature verification fails', async () => {
		vi.mocked(verifyKey).mockReturnValueOnce(false);

		const res = await POST(makeRequest({ type: 1 }));
		expect(res.status).toBe(401);
	});

	it('responds to PING with type 1', async () => {
		vi.mocked(verifyKey).mockReturnValueOnce(true);

		const res = await POST(makeRequest({ type: 1 }));
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.type).toBe(1);
	});

	it('dispatches timezone command', async () => {
		vi.mocked(verifyKey).mockReturnValueOnce(true);
		vi.mocked(handleTimezone).mockResolvedValueOnce(
			Response.json({ type: 4, data: { content: 'timezones' } })
		);

		const interaction = { type: 2, data: { name: 'timezone' } };
		await POST(makeRequest(interaction));

		expect(handleTimezone).toHaveBeenCalledWith(interaction);
	});

	it('dispatches add-member command', async () => {
		vi.mocked(verifyKey).mockReturnValueOnce(true);
		vi.mocked(handleAddMember).mockResolvedValueOnce(
			Response.json({ type: 4, data: { content: 'added' } })
		);

		const interaction = { type: 2, data: { name: 'add-member' } };
		await POST(makeRequest(interaction));

		expect(handleAddMember).toHaveBeenCalledWith(interaction);
	});

	it('returns 400 for unknown command', async () => {
		vi.mocked(verifyKey).mockReturnValueOnce(true);

		const res = await POST(makeRequest({ type: 2, data: { name: 'unknown' } }));
		expect(res.status).toBe(400);
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter portfolio test -- app/api/discord/route.test.ts`

Expected: FAIL — route module does not exist.

- [ ] **Step 4: Implement `apps/portfolio/app/api/discord/route.ts`**

```ts
import { verifyKey } from 'discord-interactions';
import { handleAddMember, handleTimezone } from '@repo/navi';

const commandHandlers: Record<string, (interaction: unknown) => Promise<Response>> = {
	timezone: handleTimezone,
	'add-member': handleAddMember,
};

export async function POST(req: Request): Promise<Response> {
	const body = await req.text();
	const signature = req.headers.get('x-signature-ed25519') ?? '';
	const timestamp = req.headers.get('x-signature-timestamp') ?? '';
	const publicKey = process.env.DISCORD_PUBLIC_KEY ?? '';

	const isValid = verifyKey(body, signature, timestamp, publicKey);
	if (!isValid) {
		return new Response('Invalid signature', { status: 401 });
	}

	const interaction = JSON.parse(body);

	// PING verification handshake
	if (interaction.type === 1) {
		return Response.json({ type: 1 });
	}

	// APPLICATION_COMMAND
	if (interaction.type === 2) {
		const commandName = interaction.data?.name;
		const handler = commandHandlers[commandName];
		if (handler) {
			return handler(interaction);
		}
		return new Response('Unknown command', { status: 400 });
	}

	return new Response('Unhandled interaction type', { status: 400 });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter portfolio test -- app/api/discord/route.test.ts`

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/portfolio/app/api/discord apps/portfolio/package.json
git commit -m "feat: add Discord interactions route handler with signature verification"
```

---

### Task 8: Create command registration script

**Files:**

- Create: `packages/navi/scripts/register-commands.ts`

- [ ] **Step 1: Create `packages/navi/scripts/register-commands.ts`**

```ts
import { commands } from '../src/commands/definitions';

const APP_ID = process.env.DISCORD_APP_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!APP_ID || !BOT_TOKEN) {
	console.error('Missing DISCORD_APP_ID or DISCORD_BOT_TOKEN environment variables');
	process.exit(1);
}

const url = `https://discord.com/api/v10/applications/${APP_ID}/commands`;

const response = await fetch(url, {
	method: 'PUT',
	headers: {
		'Content-Type': 'application/json',
		Authorization: `Bot ${BOT_TOKEN}`,
	},
	body: JSON.stringify(commands),
});

if (response.ok) {
	const data = await response.json();
	console.log(`Registered ${data.length} command(s):`);
	for (const cmd of data) {
		console.log(`  /${cmd.name} — ${cmd.description}`);
	}
} else {
	const error = await response.text();
	console.error(`Failed to register commands (${response.status}):`, error);
	process.exit(1);
}
```

- [ ] **Step 2: Verify the script compiles**

Run: `pnpm --filter @repo/navi typecheck`

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/navi/scripts/register-commands.ts
git commit -m "feat: add Discord slash command registration script"
```

---

### Task 9: Add environment variables to `turbo.json`

**Files:**

- Modify: `turbo.json`

- [ ] **Step 1: Add Discord env vars to `turbo.json` globalEnv**

Add these three entries to the `globalEnv` array:

```
"DISCORD_APP_ID",
"DISCORD_BOT_TOKEN",
"DISCORD_PUBLIC_KEY"
```

- [ ] **Step 2: Commit**

```bash
git add turbo.json
git commit -m "chore: add Discord environment variables to turbo.json"
```

---

### Task 10: Run the database migration

**Prerequisite:** User has set `POSTGRES_URL` pointing to their Neon database.

- [ ] **Step 1: Run the migration SQL against Neon**

Either via the Neon console SQL editor or via `psql`:

```bash
psql "$POSTGRES_URL" -f packages/navi-data/migrations/001_create_family_members.sql
```

Expected: `CREATE TABLE` output.

- [ ] **Step 2: Verify the table exists**

```bash
psql "$POSTGRES_URL" -c "\d family_members"
```

Expected: Table schema with columns `id`, `discord_user_id`, `display_name`, `timezone`, `created_at`, `updated_at`.

---

### Task 11: End-to-end verification

- [ ] **Step 1: Run full type check**

Run: `pnpm typecheck`

Expected: No type errors across all packages.

- [ ] **Step 2: Run all tests**

Run: `pnpm test`

Expected: All tests pass.

- [ ] **Step 3: Set up Discord Application**

Follow these steps in the Discord Developer Portal (https://discord.com/developers/applications):

1. Click "New Application", name it "Navi"
2. Go to **Bot** tab > click "Reset Token" > copy the token → set as `DISCORD_BOT_TOKEN`
3. Go to **General Information** > copy Application ID → set as `DISCORD_APP_ID` and Public Key → set as `DISCORD_PUBLIC_KEY`
4. Go to **OAuth2** > URL Generator > select scope `applications.commands` > use generated URL to invite Navi to your server

- [ ] **Step 4: Register slash commands**

```bash
DISCORD_APP_ID=<your-app-id> DISCORD_BOT_TOKEN=<your-token> pnpm --filter @repo/navi register-commands
```

Expected: Output showing 2 registered commands.

- [ ] **Step 5: Deploy and set Interactions Endpoint URL**

Deploy to Vercel, then in the Discord Developer Portal under **General Information**, set the Interactions Endpoint URL to:

```
https://your-domain.vercel.app/api/discord
```

Discord will send a PING to verify — the route handler responds automatically.

- [ ] **Step 6: Test in Discord**

1. Use `/add-member` to add a family member
2. Use `/timezone` to see the timezone embed
3. Try `/add-member` with an invalid timezone — expect ephemeral error
4. Try `/add-member` with a duplicate user — expect ephemeral error
