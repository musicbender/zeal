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
