import { initLogger } from '@repo/logger/server';
import cron from 'node-cron';
import type { SunkeepService } from './sunkeep.service.js';

const log = initLogger('sunkeep.scheduler');

export class SunkeepScheduler {
	private job: ReturnType<typeof cron.schedule> | null = null;

	constructor(private readonly service: SunkeepService) {}

	start(): void {
		this.job = cron.schedule('*/10 * * * *', () => {
			this.service.runTick().catch((err) => {
				log.error({ err }, 'Unhandled error in Sunkeep tick');
			});
		});
		log.info('Sunkeep scheduler started (every 10 minutes)');
	}

	stop(): void {
		this.job?.stop();
		this.job = null;
		log.info('Sunkeep scheduler stopped');
	}
}
