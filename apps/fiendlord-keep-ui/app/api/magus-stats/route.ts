import { cpuTemperature, currentLoad, fsSize, mem, time } from 'systeminformation';

import { initLogger } from '@repo/logger/server';
import type { MagusStats } from '@repo/magus-data';
import { NextResponse } from 'next/server';

const log = initLogger('api/magus-stats');

export async function GET() {
	try {
		const [load, memory, temp, sysTime, disks] = await Promise.all([
			currentLoad(),
			mem(),
			cpuTemperature(),
			time(),
			fsSize(),
		]);

		const stats: MagusStats = {
			cpuPercent: load.currentLoad,
			ramPercent: (memory.used / memory.total) * 100,
			tempCelsius: temp.main ?? 0,
			uptimeSeconds: sysTime.uptime,
			diskPercent: disks[0] ? (disks[0].used / disks[0].size) * 100 : 0,
		};

		return NextResponse.json(stats);
	} catch (err) {
		log.error({ err }, 'Failed to read system stats');
		return NextResponse.json({ error: 'Failed to read system stats' }, { status: 500 });
	}
}
