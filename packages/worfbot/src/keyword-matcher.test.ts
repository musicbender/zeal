import { describe, expect, it, vi } from 'vitest';

vi.mock('./quotes.json', () => ({
	default: Array.from({ length: 20 }, (_, i) => `quote-${i}`),
}));

vi.mock('./keyword-triggers.json', () => ({
	default: {
		triggers: [{ keyword: 'procrastinate', quoteIndex: 19 }],
	},
}));

import { findMatchingQuote } from './keyword-matcher';

describe('findMatchingQuote', () => {
	it('returns the mapped quote when keyword matches', () => {
		expect(findMatchingQuote('I procrastinate all the time')).toBe('quote-19');
	});

	it('matches case-insensitively', () => {
		expect(findMatchingQuote('PROCRASTINATE now')).toBe('quote-19');
	});

	it('does not match when keyword is a prefix (procrastinating)', () => {
		expect(findMatchingQuote('I am procrastinating again')).toBeNull();
	});

	it('does not match when keyword is embedded without leading boundary', () => {
		expect(findMatchingQuote('unprocrastinated')).toBeNull();
	});

	it('returns null for an unrelated message', () => {
		expect(findMatchingQuote('today is a good day')).toBeNull();
	});
});
