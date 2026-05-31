import fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '../../__generated__/test-client/index.js';
import { registerSunkeepRoutes } from '../../sunkeep/sunkeep.routes.js';
import type { SunkeepService } from '../../sunkeep/sunkeep.service.js';
import type { SunkeepConfig } from '../../sunkeep/sunkeep.types.js';

export const TEST_CONFIG: SunkeepConfig = {
	chargePointUsername: 'test@example.com',
	chargePointPassword: 'password',
	chargePointDeviceId: 42,
	teslaClientId: 'client-id',
	teslaClientSecret: 'client-secret',
	teslaRefreshToken: 'refresh-token',
	teslaEnergySiteId: '12345',
	solarWindowStart: '00:00',
	solarWindowEnd: '23:59',
	sunkeepEnabled: true,
	soeThreshold: 95,
};

export async function buildTestApp(
	service: SunkeepService,
	prisma: PrismaClient
): Promise<FastifyInstance> {
	const app = fastify({ logger: false });
	await registerSunkeepRoutes(app, service, prisma as any);
	await app.ready();
	return app;
}

export async function cleanDb(prisma: PrismaClient): Promise<void> {
	await prisma.chargingEvent.deleteMany();
	await prisma.setting.deleteMany();
}
