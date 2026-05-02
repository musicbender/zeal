import { Card, Flex, Progress, Text } from '@radix-ui/themes';
import type { MagusStats } from '@repo/magus-data';

import styles from './magus-stats-grid.module.css';

interface MagusStatsGridProps {
	stats: MagusStats;
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

function progressColor(pct: number): 'green' | 'yellow' | 'red' {
	if (pct >= 90) return 'red';
	if (pct >= 70) return 'yellow';
	return 'green';
}

interface StatCardProps {
	label: string;
	value: string;
	percent?: number;
}

function StatCard({ label, value, percent }: StatCardProps) {
	return (
		<Card className={styles.statCard}>
			<Flex direction="column" gap="2">
				<Text size="1" color="gray" weight="medium" className={styles.label}>
					{label}
				</Text>
				<Text size="4" weight="bold">
					{value}
				</Text>
				{percent != null && (
					<Progress
						value={percent}
						color={progressColor(percent)}
						size="1"
						className={styles.progress}
					/>
				)}
			</Flex>
		</Card>
	);
}

export function MagusStatsGrid({ stats }: MagusStatsGridProps) {
	return (
		<div className={styles.grid}>
			<StatCard label="CPU" value={`${stats.cpuPercent.toFixed(1)}%`} percent={stats.cpuPercent} />
			<StatCard label="RAM" value={`${stats.ramPercent.toFixed(1)}%`} percent={stats.ramPercent} />
			<StatCard
				label="Disk"
				value={`${stats.diskPercent.toFixed(1)}%`}
				percent={stats.diskPercent}
			/>
			<StatCard label="Temp" value={`${stats.tempCelsius.toFixed(1)}°C`} />
			<StatCard label="Uptime" value={formatUptime(stats.uptimeSeconds)} />
		</div>
	);
}
