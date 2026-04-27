import type { DiscordInteraction } from '../discord/types';
import quotes from '../quotes.json';
import { createEmbed } from '../theme';

export async function handleQuote(_: DiscordInteraction): Promise<Response> {
	const quote = quotes[Math.floor(Math.random() * quotes.length)];
	const embed = createEmbed('neutral').setDescription(`*"${quote}"*`);
	return Response.json({
		type: 4,
		data: { embeds: [embed.toJSON()] },
	});
}
