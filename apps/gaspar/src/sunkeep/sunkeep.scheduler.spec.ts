import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SunkeepScheduler } from './sunkeep.scheduler.js';

vi.mock('node-cron', () => ({
	default: {
		schedule: vi.fn(() => ({
			start: vi.fn(),
			stop: vi.fn(),
		})),
	},
}));

import cron from 'node-cron';

const mockService = {
	runTick: vi.fn().mockResolvedValue(undefined),
};

describe('SunkeepScheduler', () => {
	let scheduler: SunkeepScheduler;

	beforeEach(() => {
		vi.clearAllMocks();
		scheduler = new SunkeepScheduler(mockService as any);
	});

	it('creates a cron job with 10-minute expression on start()', () => {
		scheduler.start();
		expect(cron.schedule).toHaveBeenCalledWith('*/10 * * * *', expect.any(Function));
	});

	it('fires an immediate tick on start()', () => {
		scheduler.start();
		expect(mockService.runTick).toHaveBeenCalledOnce();
	});

	it('stop() calls job.stop()', () => {
		scheduler.start();
		const job = vi.mocked(cron.schedule).mock.results[0]?.value;
		scheduler.stop();
		expect(job.stop).toHaveBeenCalled();
	});

	it('stop() is a no-op before start()', () => {
		expect(() => scheduler.stop()).not.toThrow();
	});
});
