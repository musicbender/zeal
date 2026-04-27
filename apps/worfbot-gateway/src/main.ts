import { findMatchingQuote } from '@repo/worfbot';
import { Client, Events, GatewayIntentBits } from 'discord.js';

// MESSAGE_CONTENT is privileged — enable in Discord Developer Portal:
// Applications → [your app] → Bot → Privileged Gateway Intents → Message Content Intent
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
	],
});

const repliedToday = new Map<string, string>(); // userId → YYYY-MM-DD

function todayString(): string {
	return new Date().toISOString().slice(0, 10);
}

client.on(Events.ClientReady, () => {
	console.log(`Worfbot Gateway ready — logged in as ${client.user?.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
	if (message.author.bot) return;
	const quote = findMatchingQuote(message.content);
	if (!quote) return;
	const today = todayString();
	if (repliedToday.get(message.author.id) === today) return;
	repliedToday.set(message.author.id, today);
	await message.reply(quote);
});

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) throw new Error('DISCORD_BOT_TOKEN is required');
client.login(token);
