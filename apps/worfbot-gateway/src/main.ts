import { initLogger } from '@repo/logger/server';
import { findMatchingQuote } from '@repo/worfbot';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';
import { createServer } from 'node:http';

const log = initLogger('worfbot-gateway');

// MESSAGE_CONTENT is a privileged intent.
// Enable it in Discord Developer Portal:
// Applications → [your app] → Bot → Privileged Gateway Intents → Message Content Intent
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
	],
});

// In-memory rate limit: one reply per user per calendar day.
// Resets on process restart — acceptable for a single Railway instance.
const repliedToday = new Map<string, string>(); // userId → YYYY-MM-DD

function todayString(): string {
	return new Date().toISOString().slice(0, 10);
}

client.on(Events.ClientReady, () => {
	log.info({ tag: client.user?.tag }, 'Worfbot Gateway ready');
});

client.on(Events.MessageCreate, async (message) => {
	if (message.author.bot) return;

	const quote = findMatchingQuote(message.content);
	if (!quote) return;

	const today = todayString();
	const skipRateLimit = process.env.SKIP_RATE_LIMIT === 'true';

	if (!skipRateLimit) {
		if (repliedToday.get(message.author.id) === today) return;
		repliedToday.set(message.author.id, today);
	}

	await message.reply(quote);
});

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) throw new Error('DISCORD_BOT_TOKEN is required');
client.login(token);

const healthPort = process.env.HEALTH_PORT ? parseInt(process.env.HEALTH_PORT) : 3001;
createServer((req, res) => {
	if (req.url === '/health' && req.method === 'GET') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
	} else {
		res.writeHead(404);
		res.end();
	}
}).listen(healthPort, '0.0.0.0', () => {
	log.info({ port: healthPort }, 'Health check listening');
});
