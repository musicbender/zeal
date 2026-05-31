import { Writable } from 'node:stream';
import pino from 'pino';
import type { RepoLogger } from './types.js';

const GLOBAL_KEY = Symbol.for('@repo/logger/server');

// pino numeric level → systemd-journal syslog priority prefix.
// journald parses <N> prefixes from stdout when JOURNAL_STREAM is set and
// assigns the correct PRIORITY instead of treating all stdout output as INFO.
const SYSLOG_PREFIX: Record<number, string> = {
	10: '<7>', // trace → debug
	20: '<7>', // debug → debug
	30: '<6>', // info → informational
	40: '<4>', // warn → warning
	50: '<3>', // error → error
	60: '<2>', // fatal → critical
};

function makeJournaldStream(): Writable {
	return new Writable({
		write(chunk: Buffer, _enc: BufferEncoding, cb: () => void): void {
			const line = chunk.toString().trimEnd();
			if (line) {
				try {
					const { level } = JSON.parse(line) as { level: number };
					process.stdout.write(`${SYSLOG_PREFIX[level] ?? '<6>'}${line}\n`);
				} catch {
					process.stdout.write(`${line}\n`);
				}
			}
			cb();
		},
	});
}

function createServerLogger(): RepoLogger {
	const isVercel = !!process.env.VERCEL;
	const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV !== 'production' ? 'debug' : 'info');
	const isJournald = !isVercel && !!process.env.JOURNAL_STREAM;
	const isDev = process.env.NODE_ENV !== 'production';

	if (isJournald) {
		// Running under systemd: prefix each JSON line with the syslog level marker
		// so journald assigns correct PRIORITY. Takes priority over pino-pretty so
		// the Pi's log viewer sees ERROR/WARN instead of INFO for everything.
		return pino({ level }, makeJournaldStream()) as unknown as RepoLogger;
	}

	if (isDev && !isVercel) {
		return pino({
			level,
			transport: {
				target: 'pino-pretty',
				options: {
					colorize: true,
					translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
					ignore: 'pid,hostname',
					singleLine: false,
				},
			},
		}) as unknown as RepoLogger;
	}

	return pino({ level }) as unknown as RepoLogger;
}

const key = GLOBAL_KEY as unknown as string;
if (!(globalThis as Record<string, unknown>)[key]) {
	(globalThis as Record<string, unknown>)[key] = createServerLogger();
}

export const logger: RepoLogger = (globalThis as Record<string, unknown>)[key] as RepoLogger;

const childCache = new Map<string, RepoLogger>();

// Call at module level (top of file) to get a named child logger.
// All log lines from the child will include a `name` field.
export function initLogger(name: string): RepoLogger {
	if (!childCache.has(name)) childCache.set(name, logger.child({ name }));
	return childCache.get(name)!;
}
