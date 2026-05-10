import { Pool } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';

export class PrismaService {
	private prismaClient: PrismaClient;

	constructor() {
		const pool = new Pool({ connectionString: process.env.DATABASE_URL });
		const adapter = new PrismaNeon(pool);
		this.prismaClient = new PrismaClient({ adapter });
	}

	get sensor() {
		return this.prismaClient.sensor;
	}

	get chargingEvent() {
		return this.prismaClient.chargingEvent;
	}

	async $disconnect(): Promise<void> {
		await this.prismaClient.$disconnect();
	}
}
