import { initLogger } from '@repo/logger/server';
import type { FastifyInstance } from 'fastify';
import type { SunkeepService } from './sunkeep.service.js';

const log = initLogger('sunkeep.routes');

interface IPrismaChargingEvent {
	findMany(args: {
		skip: number;
		take: number;
		orderBy: { startedAt: 'asc' | 'desc' };
	}): Promise<unknown[]>;
	findUnique(args: { where: { id: string } }): Promise<unknown | null>;
	count(): Promise<number>;
}

interface IPrisma {
	chargingEvent: IPrismaChargingEvent;
}

export async function registerSunkeepRoutes(
	server: FastifyInstance,
	service: SunkeepService,
	prisma: IPrisma
) {
	server.get('/sunkeep/status', async () => service.getStatus());

	server.post('/sunkeep/enable', async () => {
		service.enable();
		return service.getStatus();
	});

	server.post('/sunkeep/disable', async (_req, reply) => {
		try {
			await service.disable();
			return service.getStatus();
		} catch (err) {
			log.error({ err }, 'Disable failed');
			return reply.status(500).send({ error: 'Failed to disable Sunkeep' });
		}
	});

	server.post('/sunkeep/charge/start', async (_req, reply) => {
		try {
			await service.manualStartSession();
			return service.getStatus();
		} catch (err) {
			log.error({ err }, 'Manual charge start failed');
			return reply.status(500).send({ error: 'Failed to start charging session' });
		}
	});

	server.post('/sunkeep/charge/stop', async (_req, reply) => {
		try {
			await service.manualStopSession();
			return service.getStatus();
		} catch (err) {
			log.error({ err }, 'Manual charge stop failed');
			return reply.status(500).send({ error: 'Failed to stop charging session' });
		}
	});

	server.post<{ Body: { amps: unknown } }>('/sunkeep/charge/amps', async (request, reply) => {
		const { amps } = request.body;
		if (typeof amps !== 'number' || !Number.isInteger(amps) || amps < 8 || amps > 32) {
			return reply.status(400).send({ error: 'amps must be an integer between 8 and 32' });
		}
		try {
			await service.lockAmps(amps);
			return service.getStatus();
		} catch (err) {
			log.error({ err }, 'Lock amps failed');
			return reply.status(500).send({ error: 'Failed to lock amps' });
		}
	});

	server.delete('/sunkeep/charge/amps', async () => {
		service.unlockAmps();
		return service.getStatus();
	});

	server.get<{ Querystring: { page?: string; limit?: string } }>(
		'/sunkeep/events',
		async (request) => {
			const page = Math.max(1, Number(request.query.page ?? 1));
			const limit = Math.min(100, Math.max(1, Number(request.query.limit ?? 20)));
			const skip = (page - 1) * limit;

			const [events, total] = await Promise.all([
				prisma.chargingEvent.findMany({
					skip,
					take: limit,
					orderBy: { startedAt: 'desc' },
				}),
				prisma.chargingEvent.count(),
			]);

			return { events, total, page, limit };
		}
	);

	server.get<{ Params: { id: string } }>('/sunkeep/events/:id', async (request, reply) => {
		const event = await prisma.chargingEvent.findUnique({
			where: { id: request.params.id },
		});
		if (!event) {
			reply.code(404);
			return { error: 'Charging event not found' };
		}
		return event;
	});
}
