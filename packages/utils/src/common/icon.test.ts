import { describe, expect, it } from 'vitest';
import { generateIcon } from './icon';

describe('generateIcon', () => {
	it('returns an object with a rects array', () => {
		const icon = generateIcon('test');
		expect(icon).toHaveProperty('rects');
		expect(Array.isArray(icon.rects)).toBe(true);
	});

	it('generates between 2 and 4 rects', () => {
		const icon = generateIcon('test');
		expect(icon.rects.length).toBeGreaterThanOrEqual(2);
		expect(icon.rects.length).toBeLessThanOrEqual(4);
	});

	it('each rect has x, y, w, h, and fill properties', () => {
		const icon = generateIcon('test');
		for (const rect of icon.rects) {
			expect(rect).toHaveProperty('x');
			expect(rect).toHaveProperty('y');
			expect(rect).toHaveProperty('w');
			expect(rect).toHaveProperty('h');
			expect(rect).toHaveProperty('fill');
			expect(typeof rect.fill).toBe('string');
		}
	});

	it('is deterministic for the same seed', () => {
		const a = generateIcon('myproject');
		const b = generateIcon('myproject');
		expect(a).toEqual(b);
	});

	it('produces different icons for different seeds', () => {
		const a = generateIcon('project-a');
		const b = generateIcon('project-b');
		expect(a).not.toEqual(b);
	});
});
