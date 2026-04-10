import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@prisma/client/extension', () => {
	return {
		PrismaClient: class {
			sensor = {};
			$connect = vi.fn();
			$disconnect = vi.fn();
		},
	};
});

import { PrismaService } from '../prisma/prisma.service';
import { SensorService } from './sensors.service';

describe('SensorService', () => {
	let service: SensorService;
	let prismaService: PrismaService;

	beforeEach(() => {
		prismaService = new PrismaService();
		service = new SensorService(prismaService);
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});
});
