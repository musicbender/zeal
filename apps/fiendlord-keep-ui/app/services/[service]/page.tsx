import { StatusBadge } from '@/components/status-badge/status-badge';
import { UptimeBar } from '@/components/uptime-bar/uptime-bar';
import { getApiBaseUrl } from '@/lib/config';
import { getServiceByName } from '@/lib/services';
import type { ServiceHealth } from '@repo/magus-data';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default async function ServicePage({ params }: { params: Promise<{ service: string }> }) {
	const { service: serviceName } = await params;
	const serviceConfig = getServiceByName(serviceName);
	if (!serviceConfig) notFound();

	const baseUrl = getApiBaseUrl();

	const healthRes = await fetch(`${baseUrl}/api/services/${serviceName}`, {
		next: { revalidate: 0 },
	});

	const health: ServiceHealth | null = healthRes.ok
		? ((await healthRes.json()) as ServiceHealth)
		: null;

	const uptimeChecks = health ? [{ status: health.status, timestamp: health.checkedAt }] : [];

	return (
		<div>
			<h1>{serviceConfig.displayName}</h1>
			<StatusBadge status={health?.status ?? 'unknown'} />
			{health?.message && <p>{health.message}</p>}
			<UptimeBar checks={uptimeChecks} />
			<Link href={`/logs/${serviceName}`}>View Logs</Link>
		</div>
	);
}
