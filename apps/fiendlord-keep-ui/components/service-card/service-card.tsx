import { Card, Flex, Heading, Link, Text } from '@radix-ui/themes';
import type { ServiceConfig, ServiceHealth } from '@repo/magus-data';

import { StatusBadge } from '@/components/status-badge/status-badge';
import { formatUptime } from '@/lib/format';

import styles from './service-card.module.css';

interface ServiceCardProps {
	service: ServiceConfig;
	health: ServiceHealth | null;
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
					<Link
						href={`/services/${service.name}`}
						size="2"
						aria-label={`Details for ${service.displayName}`}
					>
						Details
					</Link>
					<Link
						href={`/logs/${service.name}`}
						size="2"
						aria-label={`Logs for ${service.displayName}`}
					>
						Logs
					</Link>
				</Flex>
			</Flex>
		</Card>
	);
}
