import { initLogger } from '@repo/logger/server';
import { createEmbed } from '@repo/worfbot/theme';

const log = initLogger('cron/video-chat');

const CHANNEL_ID = '798427261971202049';
const MEET_LINK = 'https://meet.google.com/rra-mtmz-khi';

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
	log.info('Cron triggered');
	const secret = process.env.CRON_SECRET;
	const auth = req.headers.get('authorization');

	if (!secret || auth !== `Bearer ${secret}`) {
		return new Response('Unauthorized', { status: 401 });
	}

	const force = new URL(req.url).searchParams.get('force') === 'true';

	// GitHub Actions cron fires at 21:15/22:15 UTC (early to offset queue delay),
	// arriving at the endpoint around 3 PM LA time.
	// Only proceed when it's actually 3 PM in Los Angeles (or force=true for testing).
	if (!force && getLAHour() !== 15) {
		log.info('Cron skipped due to not being 3pm LA time');
		return Response.json({ skipped: true });
	}

	const token = process.env.DISCORD_BOT_TOKEN;
	const discordRes = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
		method: 'POST',
		headers: {
			Authorization: `Bot ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			content: '@everyone',
			allowed_mentions: { parse: ['everyone'] },
			embeds: [
				createEmbed('announcement')
					.setTitle('⚔️ Family Council')
					.setDescription(
						`The hour of the family council is upon us. Warriors do not linger. They assemble.`
					)
					.toJSON(),
			],
			components: [
				{
					type: 1,
					components: [
						{
							type: 2,
							style: 5,
							label: 'Join Family Chat',
							url: MEET_LINK,
						},
					],
				},
			],
		}),
	});

	if (!discordRes.ok) {
		const error = await discordRes.text();
		log.error({ status: discordRes.status, error }, 'Discord API error');
		return Response.json({ error, status: discordRes.status }, { status: 500 });
	}

	log.info({ channelId: CHANNEL_ID }, 'Video chat announcement sent');
	return Response.json({ ok: true });
}
