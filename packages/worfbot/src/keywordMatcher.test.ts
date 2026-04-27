import { describe, expect, it, vi } from 'vitest';

vi.mock('./quotes.json', () => ({
	default: Array.from({ length: 20 }, (_, i) => `Quote ${i}`),
}));

vi.mock('./keyword-triggers.json', () => ({
	default: {
		triggers: [{ keyword: 'procrastinate', quoteIndex: 19 }],
	},
}));

import { findMatchingQuote } from './keywordMatcher';

describe('findMatchingQuote', () => {
	it('matches the trigger keyword', () => {
		expect(findMatchingQuote('I procrastinate all the time')).toBe('Quote 19');
	});

	it('is case-insensitive', () => {
		expect(findMatchingQuote('PROCRASTINATE')).toBe('Quote 19');
	});

	it('does not match when keyword appears as a prefix (unprocrastinated)', () => {
		expect(findMatchingQuote('unprocrastinated')).toBeNull();
	});

	it('does not match when keyword appears as a root (procrastinating)', () => {
		expect(findMatchingQuote('procrastinating')).toBeNull();
	});

	it('returns null for unrelated messages', () => {
		expect(findMatchingQuote('honor is everything')).toBeNull();
	});
});
