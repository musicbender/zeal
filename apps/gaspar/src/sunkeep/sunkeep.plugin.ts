import { initLogger } from '@repo/logger/server';
import type { FastifyInstance } from 'fastify';
import { ChargePoint } from 'node-chargepoint';
import type { PrismaService } from '../prisma/prisma.service.js';
import { readSunkeepConfig } from './sunkeep.config.js';
import { registerSunkeepRoutes } from './sunkeep.routes.js';
import { SunkeepScheduler } from './sunkeep.scheduler.js';
import { SunkeepService } from './sunkeep.service.js';
import { SunkeepState } from './sunkeep.types.js';
import { TeslaEnergyClient } from './tesla.client.js';

const log = initLogger('sunkeep.plugin');

export async function registerSunkeepPlugin(
	server: FastifyInstance,
	prismaService: PrismaService
): Promise<void> {
	const config = readSunkeepConfig();

	const chargePoint = await ChargePoint.create(config.chargePointUsername);
	await chargePoint.loginWithPassword(config.chargePointPassword);
	log.info('ChargePoint authenticated');

	const powerwall = new TeslaEnergyClient({
		clientId: config.teslaClientId,
		clientSecret: config.teslaClientSecret,
		refreshToken: config.teslaRefreshToken,
		energySiteId: config.teslaEnergySiteId,
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
