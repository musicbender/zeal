import { MagusStatsGrid } from '@/components/magus-stats-grid/magus-stats-grid';
import { ServiceCard } from '@/components/service-card/service-card';
import { getApiBaseUrl } from '@/lib/config';
import { SERVICE_REGISTRY } from '@/lib/services';
import type { MagusStats, ServiceHealth } from '@repo/magus-data';

import styles from './page.module.css';

async function getMagusStats(baseUrl: string): Promise<MagusStats | null> {
	try {
		const res = await fetch(`${baseUrl}/api/magus-stats`, { next: { revalidate: 0 } });
		if (!res.ok) return null;
		return res.json() as Promise<MagusStats>;
	} catch {
		return null;
	}
}

async function getServiceHealth(baseUrl: string, name: string): Promise<ServiceHealth | null> {
	try {
		const res = await fetch(`${baseUrl}/api/services/${name}`, { next: { revalidate: 0 } });
		if (!res.ok) return null;
		return res.json() as Promise<ServiceHealth>;
	} catch {
		return null;
	}
}

export default async function HomePage() {
	const baseUrl = getApiBaseUrl();
	const results = await Promise.allSettled([
		getMagusStats(baseUrl),
		...SERVICE_REGISTRY.map((s) => getServiceHealth(baseUrl, s.name)),
	]);

	const stats = results[0].status === 'fulfilled' ? (results[0].value as MagusStats | null) : null;
	const serviceHealths = results
		.slice(1)
		.map((r) => (r.status === 'fulfilled' ? (r.value as ServiceHealth | null) : null));

	return (
		<div>
			<h1>Fiendlord Keep</h1>
			{stats && <MagusStatsGrid stats={stats} />}
			<section>
				<h2>Services</h2>
				<div className={styles.servicesGrid}>
					{SERVICE_REGISTRY.map((service, i) => (
						<ServiceCard key={service.name} service={service} health={serviceHealths[i] ?? null} />
					))}
				</div>
			</section>
		</div>
	);
}
