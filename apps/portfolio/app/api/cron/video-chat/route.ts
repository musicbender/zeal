const CHANNEL_ID = '798427261971202049';
const MEET_LINK = 'https://meet.google.com/rra-mtmz-khi';
const MESSAGE =
	`@everyone — The hour of the family council is upon us. ` +
	`Warriors do not linger. They assemble. Join the war room without delay: ${MEET_LINK}`;

function getLAHour(): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: 'America/Los_Angeles',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(new Date());
	return parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0');
}

export async function GET(req: Request): Promise<Response> {
	const secret = process.env.CRON_SECRET;
	const auth = req.headers.get('authorization');

	if (!secret || auth !== `Bearer ${secret}`) {
		return new Response('Unauthorized', { status: 401 });
	}

	const force = new URL(req.url).searchParams.get('force') === 'true';

	// Cron fires at both 22:00 and 23:00 UTC to cover PST and PDT.
	// Only proceed when it's actually 3 PM in Los Angeles (or force=true for testing).
	if (!force && getLAHour() !== 15) {
		return Response.json({ skipped: true });
	}

	const token = process.env.DISCORD_BOT_TOKEN;
	await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
		method: 'POST',
		headers: {
			Authorization: `Bot ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			content: MESSAGE,
			allowed_mentions: { parse: ['everyone'] },
		}),
	});

	return Response.json({ ok: true });
}
