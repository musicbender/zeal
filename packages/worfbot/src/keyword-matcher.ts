import triggers from './keyword-triggers.json';
import quotes from './quotes.json';

export function findMatchingQuote(message: string): string | null {
	for (const { keyword, quoteIndex } of triggers.triggers) {
		if (new RegExp(`\\b${keyword}\\b`, 'i').test(message)) {
			return quotes[quoteIndex] ?? null;
		}
	}
	return null;
}
