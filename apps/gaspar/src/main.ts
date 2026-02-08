import 'dotenv/config';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastify from 'fastify';
import { registerAppRoutes } from './app.routes';
import { AppService } from './app.service';
import { registerHealthRoutes } from './health/health.routes';
import { PrismaService } from './prisma/prisma.service';
import { registerSensorRoutes } from './sensors/sensors.routes';
import { SensorService } from './sensors/sensors.service';

async function bootstrap() {
  const server = fastify({ logger: true });
  
  // Initialize Prisma
  const prismaService = new PrismaService();
  await prismaService.$connect();

  // Register plugins
  await server.register(fastifyHelmet);
  await server.register(fastifyCors);

  // Initialize services
  const appService = new AppService();
  const sensorService = new SensorService(prismaService);

  // Register routes
  await registerAppRoutes(server, appService);
  await registerHealthRoutes(server);
  await registerSensorRoutes(server, sensorService);

  // Start server
  const port = process.env.PORT || 3000;
  await server.listen({ port: Number(port), host: '0.0.0.0' });
  console.log(`Server running on http://localhost:${port}`);

  // Graceful shutdown
  const signals = ['SIGTERM', 'SIGINT'];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      console.log(`Received ${signal}, shutting down gracefully...`);
      await server.close();
      await prismaService.$disconnect();
      process.exit(0);
    });
  });
}

void bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
