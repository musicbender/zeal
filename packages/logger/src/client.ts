import pino from 'pino';
import type { RepoLogger } from './types.js';

const GLOBAL_KEY = Symbol.for('@repo/logger/client');

function createClientLogger(): RepoLogger {
	const level = process.env.NODE_ENV !== 'production' ? 'debug' : 'info';

	return pino({
		level,
		browser: {
			write: {
				fatal: (obj) => console.error('[FATAL]', (obj as { msg?: string }).msg ?? obj, obj),
				error: (obj) => console.error('[ERROR]', (obj as { msg?: string }).msg ?? obj, obj),
				warn: (obj) => console.warn('[WARN]', (obj as { msg?: string }).msg ?? obj, obj),
				info: (obj) => console.info('[INFO]', (obj as { msg?: string }).msg ?? obj, obj),
				debug: (obj) => console.debug('[DEBUG]', (obj as { msg?: string }).msg ?? obj, obj),
				trace: (obj) => console.debug('[TRACE]', (obj as { msg?: string }).msg ?? obj, obj),
			},
		},
	}) as unknown as RepoLogger;
}

const key = GLOBAL_KEY as unknown as string;
if (!(globalThis as Record<string, unknown>)[key]) {
	(globalThis as Record<string, unknown>)[key] = createClientLogger();
}

export const logger: RepoLogger = (globalThis as Record<string, unknown>)[key] as RepoLogger;
