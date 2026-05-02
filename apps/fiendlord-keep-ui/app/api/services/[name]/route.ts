import { execSync } from 'child_process';

import type { ServiceHealth } from '@repo/magus-data';
import { NextResponse } from 'next/server';

import { getServiceByName } from '@/lib/services';

async function checkHttpHealth(port: number, isHomebridge: boolean): Promise<ServiceHealth> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 3000);

	const headers: HeadersInit = {};
	if (isHomebridge) {
		const apiKey = process.env.HOMEBRIDGE_API_KEY;
		if (apiKey) {
			headers['Authorization'] = `Bearer ${apiKey}`;
		}
	}

	try {
		const res = await fetch(`http://localhost:${port}/health`, {
			signal: controller.signal,
			headers,
		});

		if (res.ok) {
			return { status: 'healthy', checkedAt: new Date().toISOString() };
		}

		return {
			status: 'degraded',
			message: `HTTP ${res.status}`,
			checkedAt: new Date().toISOString(),
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return {
			status: 'down',
			message,
			checkedAt: new Date().toISOString(),
		};
	} finally {
		clearTimeout(timeout);
	}
}

function checkSystemdHealth(systemdUnit: string): ServiceHealth {
	try {
		const output = execSync(`systemctl is-active ${systemdUnit}.* 2>/dev/null || echo inactive`, {
			encoding: 'utf8',
		}).trim();

		if (output === 'active') {
			return { status: 'healthy', checkedAt: new Date().toISOString() };
		}

		return {
			status: 'down',
			message: `systemd unit is ${output}`,
			checkedAt: new Date().toISOString(),
		};
	} catch {
		return {
			status: 'unknown',
			message: 'Could not query systemd',
			checkedAt: new Date().toISOString(),
		};
	}
}

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
	const { name } = await params;
	const serviceConfig = getServiceByName(name);

	if (!serviceConfig) {
		return NextResponse.json({ error: 'Service not found' }, { status: 404 });
	}

	let health: ServiceHealth;

	try {
		if (!serviceConfig.port) {
			// No HTTP endpoint — use systemd check (e.g. github-runner)
			health = checkSystemdHealth(serviceConfig.systemdUnit);
		} else {
			const isHomebridge = serviceConfig.name === 'homebridge';
			health = await checkHttpHealth(serviceConfig.port, isHomebridge);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		health = {
			status: 'unknown',
			message,
			checkedAt: new Date().toISOString(),
		};
	}

	return NextResponse.json(health);
}
