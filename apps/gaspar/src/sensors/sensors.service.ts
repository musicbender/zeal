import { CreateSensorDto, Sensor, UpdateSensorDto } from '@repo/gaspar-data';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export class SensorService {
  constructor(private prisma: PrismaService) {}

  create(createSensorDto: CreateSensorDto) {
    const newSensor: Sensor = {
      id: randomUUID(),
      isActive: false,
      activeSince: null,
      ...createSensorDto,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    return this.prisma.sensor.create({
      data: newSensor,
    });
  }

  findAll() {
    return this.prisma.sensor.findMany();
  }

  findOne(id: string) {
    return this.prisma.sensor.findUnique({
      where: { id },   
    });
  }

  update(id: string, updateSensorDto: UpdateSensorDto) {
    return this.prisma.sensor.update({
      where: { id },
      data: updateSensorDto,
    });
  }

  remove(id: string) {
    return this.prisma.sensor.delete({
      where: { id },
    });
  }
}
