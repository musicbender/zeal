import { LogViewer } from '@/components/log-viewer/log-viewer';
import { getApiBaseUrl } from '@/lib/config';
import { getServiceByName } from '@/lib/services';
import type { LogEntry } from '@repo/magus-data';
import { notFound } from 'next/navigation';

export default async function LogsPage({ params }: { params: Promise<{ service: string }> }) {
	const { service: serviceName } = await params;
	const serviceConfig = getServiceByName(serviceName);
	if (!serviceConfig) notFound();

	const baseUrl = getApiBaseUrl();

	let initialLogs: LogEntry[] = [];
	try {
		const res = await fetch(`${baseUrl}/api/logs/${serviceName}?limit=200`, {
			next: { revalidate: 0 },
		});
		if (res.ok) initialLogs = (await res.json()) as LogEntry[];
	} catch {
		// logs unavailable
	}

	return (
		<div>
			<h1>Logs — {serviceConfig.displayName}</h1>
			<LogViewer initialLogs={initialLogs} service={serviceName} />
		</div>
	);
}
