import { beforeEach, describe, expect, it } from 'vitest';

describe('server logger', () => {
	beforeEach(() => {
		delete (globalThis as Record<string | symbol, unknown>)[Symbol.for('@repo/logger/server')];
	});

	it('exports a logger with info, warn, error, debug, fatal, trace, child methods', async () => {
		const { logger } = await import('../server.js');
		expect(typeof logger.info).toBe('function');
		expect(typeof logger.warn).toBe('function');
		expect(typeof logger.error).toBe('function');
		expect(typeof logger.debug).toBe('function');
		expect(typeof logger.fatal).toBe('function');
		expect(typeof logger.trace).toBe('function');
		expect(typeof logger.child).toBe('function');
	});

	it('returns the same instance on repeated imports (singleton)', async () => {
		const { logger: a } = await import('../server.js');
		const { logger: b } = await import('../server.js');
		expect(a).toBe(b);
	});

	it('child logger returns a RepoLogger-compatible object', async () => {
		const { logger } = await import('../server.js');
		const child = logger.child({ service: 'gaspar' });
		expect(typeof child.info).toBe('function');
	});

	it('initLogger returns a RepoLogger-compatible object', async () => {
		const { initLogger } = await import('../server.js');
		const log = initLogger('TestModule');
		expect(typeof log.info).toBe('function');
	});

	it('initLogger returns the same instance for the same name (cache)', async () => {
		const { initLogger } = await import('../server.js');
		expect(initLogger('SameModule')).toBe(initLogger('SameModule'));
	});

	it('initLogger returns different instances for different names', async () => {
		const { initLogger } = await import('../server.js');
		expect(initLogger('ModuleA')).not.toBe(initLogger('ModuleB'));
	});
});
