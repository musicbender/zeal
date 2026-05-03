import { LogViewer } from '@/components/log-viewer/log-viewer';
import { StatusBadge } from '@/components/status-badge/status-badge';
import { UptimeBar } from '@/components/uptime-bar/uptime-bar';
import { getApiBaseUrl } from '@/lib/config';
import { getServiceByName } from '@/lib/services';
import type { LogEntry, ServiceHealth } from '@repo/magus-data';
import { notFound } from 'next/navigation';

export default async function ServicePage({ params }: { params: Promise<{ service: string }> }) {
	const { service: serviceName } = await params;
	const serviceConfig = getServiceByName(serviceName);
	if (!serviceConfig) notFound();

	const baseUrl = getApiBaseUrl();

	const [healthRes, logsRes] = await Promise.allSettled([
		fetch(`${baseUrl}/api/services/${serviceName}`, { next: { revalidate: 0 } }),
		fetch(`${baseUrl}/api/logs/${serviceName}?limit=20`, { next: { revalidate: 0 } }),
	]);

	const health: ServiceHealth | null =
		healthRes.status === 'fulfilled' && healthRes.value.ok
			? ((await healthRes.value.json()) as ServiceHealth)
			: null;

	const recentLogs: LogEntry[] =
		logsRes.status === 'fulfilled' && logsRes.value.ok
			? ((await logsRes.value.json()) as LogEntry[])
			: [];

	const uptimeChecks = health ? [{ status: health.status, timestamp: health.checkedAt }] : [];

	return (
		<div>
			<h1>{serviceConfig.displayName}</h1>
			<StatusBadge status={health?.status ?? 'unknown'} />
			{health?.message && <p>{health.message}</p>}
			<UptimeBar checks={uptimeChecks} />
			<section>
				<h2>Recent Logs</h2>
				<LogViewer initialLogs={recentLogs} service={serviceName} />
			</section>
		</div>
	);
}
