import type { ServiceStatus } from '@repo/magus-data';

import styles from './uptime-bar.module.css';

interface UptimeCheck {
	status: ServiceStatus;
	timestamp: string;
}

interface UptimeBarProps {
	checks: UptimeCheck[];
}

const STATUS_COLOR: Record<ServiceStatus, string> = {
	healthy: styles.blockHealthy as string,
	degraded: styles.blockDegraded as string,
	down: styles.blockDown as string,
	unknown: styles.blockUnknown as string,
};

function formatTimestamp(ts: string): string {
	const d = new Date(ts);
	return d.toLocaleString();
}

export function UptimeBar({ checks }: UptimeBarProps) {
	const visible = checks.slice(-90);

	return (
		<div className={styles.bar}>
			{visible.map((check) => (
				<div
					key={`${check.timestamp}-${check.status}`}
					className={`${styles.block} ${STATUS_COLOR[check.status]}`}
					title={`${formatTimestamp(check.timestamp)} — ${check.status}`}
					aria-label={`${formatTimestamp(check.timestamp)}: ${check.status}`}
				/>
			))}
			{visible.length === 0 && <div className={`${styles.block} ${styles.blockUnknown}`} />}
		</div>
	);
}
