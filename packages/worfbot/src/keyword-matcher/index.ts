import quotes from '../quotes.json';
import { triggers } from './triggers';

export function findMatchingQuote(message: string): string | null {
	for (const { keywords, quoteIndex, triggerMessage, gifUrl } of triggers) {
		for (const keyword of keywords) {
			if (new RegExp(`\\b${keyword}\\b`, 'i').test(message)) {
				if (triggerMessage) {
					return triggerMessage;
				}

				if (gifUrl) {
					return gifUrl;
				}

				if (quoteIndex !== undefined) {
					return quotes[quoteIndex] ?? null;
				}
			}
		}
	}

	return null;
}
