import { MagusStatsGrid } from '@/components/magus-stats-grid/magus-stats-grid';
import { ServiceCard } from '@/components/service-card/service-card';
import { SERVICE_REGISTRY } from '@/lib/services';
import type { MagusStats, ServiceHealth } from '@repo/magus-data';

import styles from './page.module.css';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3002';

async function getMagusStats(): Promise<MagusStats | null> {
	try {
		const res = await fetch(`${BASE_URL}/api/magus-stats`, { next: { revalidate: 0 } });
		if (!res.ok) return null;
		return res.json() as Promise<MagusStats>;
	} catch {
		return null;
	}
}

async function getServiceHealth(name: string): Promise<ServiceHealth | null> {
	try {
		const res = await fetch(`${BASE_URL}/api/services/${name}`, { next: { revalidate: 0 } });
		if (!res.ok) return null;
		return res.json() as Promise<ServiceHealth>;
	} catch {
		return null;
	}
}

export default async function HomePage() {
	const [stats, ...serviceHealths] = await Promise.all([
		getMagusStats(),
		...SERVICE_REGISTRY.map((s) => getServiceHealth(s.name)),
	]);

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
