import { Badge } from '@radix-ui/themes';
import type { ServiceStatus } from '@repo/magus-data';

import styles from './status-badge.module.css';

interface StatusBadgeProps {
	status: ServiceStatus;
	size?: 'sm' | 'md';
}

const STATUS_CONFIG: Record<
	ServiceStatus,
	{ color: 'green' | 'yellow' | 'red' | 'gray'; label: string }
> = {
	healthy: { color: 'green', label: 'Healthy' },
	degraded: { color: 'yellow', label: 'Degraded' },
	down: { color: 'red', label: 'Down' },
	unknown: { color: 'gray', label: 'Unknown' },
};

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
	const { color, label } = STATUS_CONFIG[status];

	return (
		<Badge color={color} variant="soft" size={size === 'sm' ? '1' : '2'} className={styles.badge}>
			<span className={styles.dot} />
			{label}
		</Badge>
	);
}
