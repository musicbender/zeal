import { isServer } from '@repo/utils/common/is-server';
import type { RepoLogger } from './types.js';

const mod = isServer ? await import('./server.js') : await import('./client.js');

export const logger: RepoLogger = mod.logger;
export const initLogger: (name: string) => RepoLogger = mod.initLogger;
export type { RepoLogger };
