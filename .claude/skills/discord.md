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
