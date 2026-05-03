import { describe, expect, it } from 'vitest';

describe('common logger', () => {
	it('exports logger and initLogger', async () => {
		const { logger, initLogger } = await import('../common.js');
		expect(typeof logger.info).toBe('function');
		expect(typeof initLogger).toBe('function');
	});

	it('resolves to server logger in node environment', async () => {
		const { isServer } = await import('@repo/utils/common/is-server');
		expect(isServer).toBe(true);

		const { logger: commonLogger } = await import('../common.js');
		const { logger: serverLogger } = await import('../server.js');
		expect(commonLogger).toBe(serverLogger);
	});

	it('initLogger returns a named child logger', async () => {
		const { initLogger } = await import('../common.js');
		const log = initLogger('CommonTest');
		expect(typeof log.info).toBe('function');
	});
});
