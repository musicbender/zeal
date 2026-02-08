import { CreateSensorDto, UpdateSensorDto } from '@repo/gaspar-data';
import { FastifyInstance } from 'fastify';
import { SensorService } from './sensors.service';

export async function registerSensorRoutes(
  server: FastifyInstance,
  sensorService: SensorService,
) {
  server.post<{ Body: CreateSensorDto }>('/sensors', async (request, reply) => {
    try {
      const sensor = await sensorService.create(request.body);
      return reply.status(201).send(sensor);
    } catch (error) {
      return reply.status(400).send({ error: 'Failed to create sensor' });
    }
  });

  server.get('/sensors', async () => {
    return sensorService.findAll();
  });

  server.get<{ Params: { id: string } }>('/sensors/:id', async (request) => {
    const { id } = request.params;
    const sensor = await sensorService.findOne(id);
    if (!sensor) {
      throw { statusCode: 404, message: 'Sensor not found' };
    }
    return sensor;
  });

  server.patch<{ Params: { id: string }; Body: UpdateSensorDto }>(
    '/sensors/:id',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const updated = await sensorService.update(id, request.body as UpdateSensorDto);
        return reply.send(updated);
      } catch (error) {
        return reply.status(400).send({ error: 'Failed to update sensor' });
      }
    },
  );

  server.delete<{ Params: { id: string } }>(
    '/sensors/:id',
    async (request, reply) => {
      try {
        const { id } = request.params;
        await sensorService.remove(id);
        return reply.status(204).send();
      } catch (error) {
        return reply.status(400).send({ error: 'Failed to delete sensor' });
      }
    },
  );
}
