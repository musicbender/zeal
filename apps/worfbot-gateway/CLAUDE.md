# Worfbot Gateway

Discord bot gateway running on the Raspberry Pi. Thin app that bootstraps `@repo/worfbot` and connects it to Discord using discord.js 14.

## Commands

```bash
pnpm --filter worfbot-gateway dev    # Dev server (tsx)
pnpm --filter worfbot-gateway build  # Build for production
```

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
3. Wire the handler in `apps/worfbot-gateway/src/main.ts` — add a new `Events.InteractionCreate` handler (this does not exist yet; it must be added):

```ts
client.on(Events.InteractionCreate, async (interaction) => {
	if (!interaction.isChatInputCommand()) return;
	if (interaction.commandName === 'my-command') {
		await handleMyCommand(interaction);
	}
});
```

4. **Register with Discord** (mandatory every time commands change):

```bash
pnpm --filter @repo/worfbot register-commands
```

See the `worfbot` skill for the full step-by-step with code examples.

## Environment Variables

| Var                 | Description                                      |
| ------------------- | ------------------------------------------------ |
| `DISCORD_BOT_TOKEN` | Bot token from Discord Developer Portal          |
| `DISCORD_APP_ID`    | Application ID (needed for command registration) |

## Skills

- Discord intents and events: invoke `discord` skill
- Command patterns and keyword triggers: invoke `worfbot` skill
