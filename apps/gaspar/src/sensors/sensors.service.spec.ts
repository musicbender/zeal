import { PrismaService } from '../prisma/prisma.service';
import { SensorService } from './sensors.service';

describe('SensorService', () => {
  let service: SensorService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    prismaService = new PrismaService();
    service = new SensorService(prismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
