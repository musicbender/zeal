import { Pool } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import type { PrismaClient as PrismaClientType } from '@prisma/client';
import prismaPackage from '@prisma/client';

const { PrismaClient } = prismaPackage;

export class PrismaService {
	private prismaClient: PrismaClientType;

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

	get setting() {
		return this.prismaClient.setting;
	}

	async $disconnect(): Promise<void> {
		await this.prismaClient.$disconnect();
	}
}
