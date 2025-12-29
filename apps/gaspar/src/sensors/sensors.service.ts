import { Injectable } from '@nestjs/common';
import { CreateSensorDto, Sensor, UpdateSensorDto } from '@repo/gaspar-data';
import { randomUUID } from 'node:crypto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
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

  findOne(id: number) {
    return this.prisma.sensor.findUnique({
      where: { id },   
    });
  }

  update(id: number, updateSensorDto: UpdateSensorDto) {
    return this.prisma.sensor.update({
      where: { id },
      data: updateSensorDto,
    });
  }

  remove(id: number) {
    return this.prisma.sensor.delete({
      where: { id },
    });
  }
}
