import { Badge, Card, Flex, Progress, Text } from '@radix-ui/themes';
import type { SunkeepStatus } from '@repo/magus-data';
import styles from './sunkeep-energy-panel.module.css';

interface SunkeepEnergyPanelProps {
	status: SunkeepStatus | null;
}

function excessColor(kw: number | null): 'green' | 'yellow' | 'red' {
	if (kw == null) return 'gray' as never;
	if (kw >= 1.5) return 'green';
	if (kw >= 0) return 'yellow';
	return 'red';
}

function batteryColor(pct: number | null): 'green' | 'yellow' | 'red' {
	if (pct == null) return 'gray' as never;
	if (pct >= 50) return 'green';
	if (pct >= 20) return 'yellow';
	return 'red';
}

function formatLastPollAt(lastPollAt: string | null): string {
	if (!lastPollAt) return '—';
	return new Date(lastPollAt).toLocaleTimeString();
}

interface StatCardProps {
	label: string;
	value: string;
	unit?: string;
	badge?: { label: string; color: 'green' | 'yellow' | 'red' };
	progress?: { value: number; color: 'green' | 'yellow' | 'red' };
}

function StatCard({ label, value, unit, badge, progress }: StatCardProps) {
	return (
		<Card className={styles.card}>
			<Flex direction="column" gap="2">
				<Text className={styles.label}>{label}</Text>
				<Flex align="baseline" gap="1">
					<Text className={styles.value}>{value}</Text>
					{unit && <Text className={styles.unit}>{unit}</Text>}
					{badge && (
						<Badge color={badge.color} size="1">
							{badge.label}
						</Badge>
					)}
				</Flex>
				{progress && (
					<Progress
						value={progress.value}
						color={progress.color}
						size="1"
						aria-label={`${label}: ${Math.round(progress.value)}%`}
					/>
				)}
			</Flex>
		</Card>
	);
}

export function SunkeepEnergyPanel({ status }: SunkeepEnergyPanelProps) {
	const excessKw = status?.excessKw ?? null;
	const batteryPct = status?.batteryPct ?? null;

	return (
		<Flex direction="column" gap="2">
			<div className={styles.grid}>
				<StatCard
					label="Solar Production"
					value={status?.solarKw?.toFixed(2) ?? '—'}
					unit={status?.solarKw != null ? 'kW' : undefined}
				/>
				<StatCard
					label="Home Load"
					value={status?.loadKw?.toFixed(2) ?? '—'}
					unit={status?.loadKw != null ? 'kW' : undefined}
				/>
				<StatCard
					label="Excess Solar"
					value={status?.excessKw?.toFixed(2) ?? '—'}
					unit={status?.excessKw != null ? 'kW' : undefined}
					badge={
						excessKw != null
							? {
									label: excessKw >= 1.5 ? 'High' : excessKw >= 0 ? 'Low' : 'Negative',
									color: excessColor(excessKw),
								}
							: undefined
					}
				/>
				<StatCard
					label="Battery"
					value={status?.batteryPct?.toFixed(1) ?? '—'}
					unit={status?.batteryPct != null ? '%' : undefined}
					progress={
						batteryPct != null ? { value: batteryPct, color: batteryColor(batteryPct) } : undefined
					}
				/>
			</div>
			<Text className={styles.lastUpdated}>
				Last updated: {formatLastPollAt(status?.lastPollAt ?? null)}
			</Text>
		</Flex>
	);
}
