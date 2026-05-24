import { initLogger } from '@repo/logger/server';
import type { FastifyInstance } from 'fastify';
import {
	ChargePoint,
	CommunicationError,
	DatadomeCaptcha,
	InvalidSession,
	LoginError,
} from 'node-chargepoint';
import type { PrismaService } from '../prisma/prisma.service.js';
import { readSunkeepConfig } from './sunkeep.config.js';
import { registerSunkeepRoutes } from './sunkeep.routes.js';
import { SunkeepScheduler } from './sunkeep.scheduler.js';
import { SunkeepService } from './sunkeep.service.js';
import { SunkeepState } from './sunkeep.types.js';
import { TeslaEnergyClient } from './tesla.client.js';

const log = initLogger('sunkeep.plugin');

const CP_TOKEN_KEY = 'chargepoint_coulomb_token';
const TESLA_TOKEN_KEY = 'tesla_refresh_token';

async function readSetting(prisma: PrismaService, key: string): Promise<string | null> {
	return prisma.setting
		.findUnique({ where: { key } })
		.then((s: { value: string } | null) => s?.value ?? null)
		.catch(() => null);
}

async function upsertSetting(prisma: PrismaService, key: string, value: string): Promise<void> {
	await prisma.setting.upsert({
		where: { key },
		update: { value },
		create: { key, value },
	});
}

async function authenticateWithPassword(chargePoint: ChargePoint, password: string): Promise<void> {
	await chargePoint.loginWithPassword(password);
	log.info('ChargePoint authenticated via password — token will be persisted automatically');
}

export async function registerSunkeepPlugin(
	server: FastifyInstance,
	prismaService: PrismaService
): Promise<void> {
	const config = readSunkeepConfig();

	// Read both persisted tokens up-front so clients can be constructed with them.
	const [storedCpToken, storedTeslaToken] = await Promise.all([
		readSetting(prismaService, CP_TOKEN_KEY),
		readSetting(prismaService, TESLA_TOKEN_KEY),
	]);

	const chargePoint = await ChargePoint.create(config.chargePointUsername, {
		coulombToken: storedCpToken ?? config.chargePointToken,
		onTokenRotated: (token) => {
			upsertSetting(prismaService, CP_TOKEN_KEY, token).catch((err: unknown) => {
				log.warn({ err }, 'Failed to persist rotated ChargePoint token');
			});
		},
	});

	const effectiveToken = storedCpToken ?? config.chargePointToken;
	try {
		if (effectiveToken) {
			// Validate the stored token is still alive; fall back to password if it's stale.
			try {
				await chargePoint.getAccount();
				log.info('ChargePoint authenticated via token');
			} catch (err) {
				if (!(err instanceof InvalidSession)) throw err;
				log.warn('Stored ChargePoint token is expired — falling back to password login');
				await authenticateWithPassword(chargePoint, config.chargePointPassword);
			}
		} else {
			await authenticateWithPassword(chargePoint, config.chargePointPassword);
		}
	} catch (err) {
		if (err instanceof DatadomeCaptcha) {
			log.error(
				{ err },
				'ChargePoint bot protection triggered — set CHARGEPOINT_TOKEN to bypass login'
			);
		} else if (err instanceof LoginError) {
			log.error({ err }, 'ChargePoint login failed');
		} else if (err instanceof CommunicationError) {
			log.error({ err }, `ChargePoint API error ${err.statusCode}`);
		} else {
			log.error({ err }, 'ChargePoint unexpected error');
		}
		return;
	}

	const powerwall = new TeslaEnergyClient({
		clientId: config.teslaClientId,
		clientSecret: config.teslaClientSecret,
		refreshToken: storedTeslaToken ?? config.teslaRefreshToken,
		energySiteId: config.teslaEnergySiteId,
		onTokenRotated: (token) => upsertSetting(prismaService, TESLA_TOKEN_KEY, token),
	});

	const service = new SunkeepService(chargePoint, powerwall, prismaService, config);
	const scheduler = new SunkeepScheduler(service);

	if (config.sunkeepEnabled) {
		service.enable();
	}

	server.addHook('onReady', async () => {
		scheduler.start();
		log.info('Sunkeep plugin ready');
	});

	server.addHook('onClose', async () => {
		scheduler.stop();
		if (service.getStatus().state === SunkeepState.CHARGING) {
			log.warn('Server shutting down during active charge session — stopping session');
			await service.manualStopSession();
		}
	});

	await registerSunkeepRoutes(server, service, prismaService);
}
