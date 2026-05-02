import { cpuTemperature, currentLoad, fsSize, mem, time } from 'systeminformation';

import type { MagusStats } from '@repo/magus-data';
import { NextResponse } from 'next/server';

export async function GET() {
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
}
