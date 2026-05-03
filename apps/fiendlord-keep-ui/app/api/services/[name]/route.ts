import { execFile } from 'child_process';
import { promisify } from 'util';

import { initLogger } from '@repo/logger/server';
import type { ServiceHealth } from '@repo/magus-data';
import { NextResponse } from 'next/server';

const log = initLogger('api/services');

import { getServiceByName } from '@/lib/services';

const execFileAsync = promisify(execFile);

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
		log.warn({ port, err }, 'HTTP health check failed');
		return {
			status: 'down',
			message,
			checkedAt: new Date().toISOString(),
		};
	} finally {
		clearTimeout(timeout);
	}
}

async function checkSystemdHealth(systemdUnit: string): Promise<ServiceHealth> {
	try {
		const { stdout } = await execFileAsync('systemctl', [
			'list-units',
			'--state=active',
			'--no-legend',
			`${systemdUnit}.*`,
		]);
		const isActive = stdout.trim().length > 0;
		return {
			status: isActive ? 'healthy' : 'down',
			message: isActive ? undefined : 'systemd unit is not active',
			checkedAt: new Date().toISOString(),
		};
	} catch (err) {
		log.warn({ systemdUnit, err }, 'systemd health check failed');
		return { status: 'down', message: 'systemd check failed', checkedAt: new Date().toISOString() };
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
			health = await checkSystemdHealth(serviceConfig.systemdUnit);
		} else {
			// homebridge-config-ui-x requires bearer token authentication
			const isHomebridge = serviceConfig.name === 'homebridge';
			health = await checkHttpHealth(serviceConfig.port, isHomebridge);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		log.error({ name, err }, 'Unexpected error during health check');
		health = {
			status: 'unknown',
			message,
			checkedAt: new Date().toISOString(),
		};
	}

	return NextResponse.json(health);
}
