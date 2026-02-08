import { PrismaClient } from '@prisma/client';

export class PrismaService {
  private prismaClient: PrismaClient;

  constructor() {
    this.prismaClient = new PrismaClient();
  }

  // Expose Prisma client methods
  get sensor() {
    return this.prismaClient.sensor;
  }

  async $connect(): Promise<void> {
    await this.prismaClient.$connect();
  }

  async $disconnect(): Promise<void> {
    await this.prismaClient.$disconnect();
  }
}
