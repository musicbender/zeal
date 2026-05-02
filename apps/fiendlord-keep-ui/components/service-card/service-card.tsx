import { Card, Flex, Heading, Link, Text } from '@radix-ui/themes';
import type { ServiceConfig, ServiceHealth } from '@repo/magus-data';

import { StatusBadge } from '@/components/status-badge/status-badge';

import styles from './service-card.module.css';

interface ServiceCardProps {
	service: ServiceConfig;
	health: ServiceHealth | null;
}

function formatUptime(seconds: number): string {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const parts: string[] = [];
	if (days > 0) parts.push(`${days}d`);
	if (hours > 0) parts.push(`${hours}h`);
	parts.push(`${minutes}m`);
	return parts.join(' ');
}

export function ServiceCard({ service, health }: ServiceCardProps) {
	const status = health?.status ?? 'unknown';

	return (
		<Card className={styles.card}>
			<Flex direction="column" gap="3">
				<Heading size="4" weight="medium">
					{service.displayName}
				</Heading>

				<StatusBadge status={status} />

				{health?.uptime != null && (
					<Text size="2" color="gray">
						Uptime: {formatUptime(health.uptime)}
					</Text>
				)}

				{health?.message && (
					<Text size="2" color="gray" className={styles.message}>
						{health.message}
					</Text>
				)}

				<Flex gap="3" mt="1">
					<Link href={`/services/${service.name}`} size="2">
						Details
					</Link>
					<Link href={`/logs/${service.name}`} size="2">
						Logs
					</Link>
				</Flex>
			</Flex>
		</Card>
	);
}
