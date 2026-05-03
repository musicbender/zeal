import { beforeEach, describe, expect, it } from 'vitest';

describe('client logger', () => {
	beforeEach(() => {
		delete (globalThis as Record<string | symbol, unknown>)[Symbol.for('@repo/logger/client')];
	});

	it('exports a logger with the standard methods', async () => {
		const { logger } = await import('../client.js');
		expect(typeof logger.info).toBe('function');
		expect(typeof logger.warn).toBe('function');
		expect(typeof logger.error).toBe('function');
		expect(typeof logger.debug).toBe('function');
		expect(typeof logger.fatal).toBe('function');
		expect(typeof logger.trace).toBe('function');
		expect(typeof logger.child).toBe('function');
	});

	it('returns the same instance on repeated imports (singleton)', async () => {
		const { logger: a } = await import('../client.js');
		const { logger: b } = await import('../client.js');
		expect(a).toBe(b);
	});

	it('does not throw when logging', async () => {
		const { logger } = await import('../client.js');
		expect(() => logger.info('test message')).not.toThrow();
		expect(() => logger.info({ foo: 'bar' }, 'with object')).not.toThrow();
	});

	it('initLogger returns a RepoLogger-compatible object', async () => {
		const { initLogger } = await import('../client.js');
		const log = initLogger('TestComponent');
		expect(typeof log.info).toBe('function');
	});

	it('initLogger returns the same instance for the same name (cache)', async () => {
		const { initLogger } = await import('../client.js');
		expect(initLogger('SameComponent')).toBe(initLogger('SameComponent'));
	});

	it('initLogger returns different instances for different names', async () => {
		const { initLogger } = await import('../client.js');
		expect(initLogger('CompA')).not.toBe(initLogger('CompB'));
	});
});
