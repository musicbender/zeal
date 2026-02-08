import { FastifyInstance } from 'fastify';
import { AppService } from './app.service';

export async function registerAppRoutes(
  server: FastifyInstance,
  appService: AppService,
) {
  server.get('/', async () => {
    return { message: appService.getHello() };
  });
}
