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
