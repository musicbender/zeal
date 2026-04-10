import { describe, expect, it } from 'vitest';
import { hashString } from './strings';

describe('hashString', () => {
	it('returns a number', () => {
		expect(typeof hashString('test')).toBe('number');
	});

	it('returns a non-negative number', () => {
		expect(hashString('test')).toBeGreaterThanOrEqual(0);
	});

	it('is deterministic for the same input', () => {
		expect(hashString('hello')).toBe(hashString('hello'));
	});

	it('produces different hashes for different inputs', () => {
		expect(hashString('abc')).not.toBe(hashString('xyz'));
	});

	it('handles empty string', () => {
		expect(hashString('')).toBe(0);
	});
});
