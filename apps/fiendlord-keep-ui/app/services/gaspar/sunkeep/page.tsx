import { SunkeepEventsTable } from '@/components/sunkeep-events-table/sunkeep-events-table';
import { SunkeepMetaPanel } from '@/components/sunkeep-meta-panel/sunkeep-meta-panel';
import { SunkeepPoller } from '@/components/sunkeep-poller/sunkeep-poller';
import { getApiBaseUrl } from '@/lib/config';
import { initLogger } from '@repo/logger/server';
import type { ChargingEventsPage, SunkeepMeta, SunkeepStatus } from '@repo/magus-data';
import styles from './page.module.css';

const log = initLogger('page/sunkeep');

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

async function getMeta(baseUrl: string): Promise<SunkeepMeta | null> {
	try {
		const res = await fetch(`${baseUrl}/api/gaspar/sunkeep/meta`, { next: { revalidate: 60 } });
		if (!res.ok) return null;
		return res.json() as Promise<SunkeepMeta>;
	} catch (err) {
		log.warn({ err }, 'Failed to fetch Sunkeep meta');
		return null;
	}
}

export default async function SunkeepPage() {
	const baseUrl = getApiBaseUrl();
	const [initialStatus, initialEvents, meta] = await Promise.allSettled([
		getInitialStatus(baseUrl),
		getInitialEvents(baseUrl),
		getMeta(baseUrl),
	]);

	const status = initialStatus.status === 'fulfilled' ? initialStatus.value : null;
	const events = initialEvents.status === 'fulfilled' ? initialEvents.value : null;
	const metaData = meta.status === 'fulfilled' ? meta.value : null;

	return (
		<div className={styles.page}>
			<h1>Sunkeep</h1>
			<SunkeepPoller initialStatus={status} />
			{metaData && <SunkeepMetaPanel meta={metaData} />}
			<h2>Charging Sessions</h2>
			<SunkeepEventsTable initialData={events} />
		</div>
	);
}
