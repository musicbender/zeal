import { describe, expect, it, vi } from 'vitest';

vi.mock('../quotes.json', () => ({
	default: ['Honor is everything.', 'Today is a good day to die.'],
}));

import type { DiscordInteraction } from '../discord/types';
import { handleQuote } from './quote';

const mockInteraction: DiscordInteraction = {
	type: 2,
	data: { name: 'quote' },
};

describe('handleQuote', () => {
	it('returns a message containing a quote from the list', async () => {
		const response = await handleQuote(mockInteraction);
		const body = await response.json();

		expect(body.type).toBe(4);
		const content: string = body.data.content;
		const isKnownQuote = ['Honor is everything.', 'Today is a good day to die.'].some((q) =>
			content.includes(q)
		);
		expect(isKnownQuote).toBe(true);
	});

	it('picks randomly from the list', async () => {
		vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99);

		const res1 = await handleQuote(mockInteraction);
		const res2 = await handleQuote(mockInteraction);

		const body1 = await res1.json();
		const body2 = await res2.json();

		expect(body1.data.content).toContain('Honor is everything.');
		expect(body2.data.content).toContain('Today is a good day to die.');

		vi.restoreAllMocks();
	});
});
