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

async function authenticateWithPassword(chargePoint: ChargePoint, password: string): Promise<void> {
	await chargePoint.loginWithPassword(password);
	log.info(
		{ coulombToken: chargePoint.coulombToken },
		'ChargePoint authenticated — save CHARGEPOINT_TOKEN to skip future logins'
	);
}

export async function registerSunkeepPlugin(
	server: FastifyInstance,
	prismaService: PrismaService
): Promise<void> {
	const config = readSunkeepConfig();
	const chargePoint = await ChargePoint.create(config.chargePointUsername, {
		coulombToken: config.chargePointToken,
	});

	try {
		if (config.chargePointToken) {
			// Validate the stored token is still alive; fall back to password if it's stale.
			try {
				await chargePoint.getAccount();
				log.info('ChargePoint authenticated via token');
			} catch (err) {
				if (!(err instanceof InvalidSession)) throw err;
				log.warn('Stored CHARGEPOINT_TOKEN is expired — falling back to password login');
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

	const storedToken = await prismaService.setting
		.findUnique({ where: { key: 'tesla_refresh_token' } })
		.then((s) => s?.value ?? null)
		.catch(() => null);

	const persistToken = async (token: string) => {
		await prismaService.setting.upsert({
			where: { key: 'tesla_refresh_token' },
			update: { value: token },
			create: { key: 'tesla_refresh_token', value: token },
		});
	};

	const powerwall = new TeslaEnergyClient({
		clientId: config.teslaClientId,
		clientSecret: config.teslaClientSecret,
		refreshToken: storedToken ?? config.teslaRefreshToken,
		energySiteId: config.teslaEnergySiteId,
		onTokenRotated: persistToken,
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
