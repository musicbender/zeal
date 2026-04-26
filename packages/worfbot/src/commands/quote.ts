import type { DiscordInteraction } from '../discord/types';
import quotes from '../quotes.json';

export async function handleQuote(_interaction: DiscordInteraction): Promise<Response> {
	const quote = quotes[Math.floor(Math.random() * quotes.length)];
	return Response.json({
		type: 4,
		data: { content: `"${quote}"` },
	});
}
