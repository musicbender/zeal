import { CreateSensorDto, UpdateSensorDto } from '@repo/gaspar-data';
import { PrismaService } from '../prisma/prisma.service';

export class SensorService {
  constructor(private prisma: PrismaService) {}

  create(createSensorDto: CreateSensorDto) {
    return this.prisma.sensor.create({
      data: {
        name: createSensorDto.name,
        type: createSensorDto.type,
        room: createSensorDto.room,
        isActive: false,
      },
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
