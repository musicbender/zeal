import { SunkeepEventsTable } from '@/components/sunkeep-events-table/sunkeep-events-table';
import { SunkeepPoller } from '@/components/sunkeep-poller/sunkeep-poller';
import { getApiBaseUrl } from '@/lib/config';
import { initLogger } from '@repo/logger/server';
import type { ChargingEventsPage, SunkeepStatus } from '@repo/magus-data';
import styles from './page.module.css';

const log = initLogger('page/gaspar');

async function getInitialStatus(baseUrl: string): Promise<SunkeepStatus | null> {
	try {
		const res = await fetch(`${baseUrl}/api/gaspar/sunkeep/status`, { next: { revalidate: 0 } });
		if (!res.ok) return null;
		return res.json() as Promise<SunkeepStatus>;
	} catch (err) {
		log.warn({ err }, 'Failed to fetch initial Sunkeep status');
		return null;
	}
}

async function getInitialEvents(baseUrl: string): Promise<ChargingEventsPage | null> {
	try {
		const res = await fetch(`${baseUrl}/api/gaspar/sunkeep/events?page=1&limit=20`, {
			next: { revalidate: 0 },
		});
		if (!res.ok) return null;
		return res.json() as Promise<ChargingEventsPage>;
	} catch (err) {
		log.warn({ err }, 'Failed to fetch initial charging events');
		return null;
	}
}

export default async function GasparPage() {
	const baseUrl = getApiBaseUrl();
	const [initialStatus, initialEvents] = await Promise.allSettled([
		getInitialStatus(baseUrl),
		getInitialEvents(baseUrl),
	]);

	const status = initialStatus.status === 'fulfilled' ? initialStatus.value : null;
	const events = initialEvents.status === 'fulfilled' ? initialEvents.value : null;

	return (
		<div className={styles.page}>
			<h1>Gaspar</h1>
			<section className={styles.section}>
				<h2>Sunkeep</h2>
				<SunkeepPoller initialStatus={status} />
				<h3>Charging Sessions</h3>
				<SunkeepEventsTable initialData={events} />
			</section>
		</div>
	);
}
