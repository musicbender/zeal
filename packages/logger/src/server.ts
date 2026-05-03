import pino from 'pino';
import type { RepoLogger } from './types.js';

const GLOBAL_KEY = Symbol.for('@repo/logger/server');

function createServerLogger(): RepoLogger {
	const isVercel = !!process.env.VERCEL;
	const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV !== 'production' ? 'debug' : 'info');

	const transport = !isVercel
		? {
				target: 'pino-pretty',
				options: {
					colorize: true,
					translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
					ignore: 'pid,hostname',
					singleLine: false,
				},
			}
		: undefined;

	return pino({ level, transport }) as unknown as RepoLogger;
}

const key = GLOBAL_KEY as unknown as string;
if (!(globalThis as Record<string, unknown>)[key]) {
	(globalThis as Record<string, unknown>)[key] = createServerLogger();
}

export const logger: RepoLogger = (globalThis as Record<string, unknown>)[key] as RepoLogger;
