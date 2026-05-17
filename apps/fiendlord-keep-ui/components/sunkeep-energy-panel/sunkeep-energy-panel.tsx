import { Badge, Card, Flex, Progress, Text } from '@radix-ui/themes';
import type { SunkeepStatus } from '@repo/magus-data';
import styles from './sunkeep-energy-panel.module.css';

interface SunkeepEnergyPanelProps {
	status: SunkeepStatus | null;
	batteryCapacityKwh?: number | null;
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

function formatTime(iso: string | null): string {
	if (!iso) return '—';
	return new Date(iso).toLocaleTimeString();
}

function formatTimeRemaining(hours: number): string {
	const h = Math.floor(hours);
	const m = Math.round((hours - h) * 60);
	if (h === 0) return `~${m}m`;
	return m === 0 ? `~${h}h` : `~${h}h ${m}m`;
}

interface StatCardProps {
	label: string;
	value: string;
	unit?: string;
	badge?: { label: string; color: 'green' | 'yellow' | 'red' };
	progress?: { value: number; color: 'green' | 'yellow' | 'red' };
	danger?: boolean;
	note?: string;
}

function StatCard({ label, value, unit, badge, progress, danger, note }: StatCardProps) {
	return (
		<Card className={styles.card}>
			<Flex direction="column" gap="2">
				<Text className={styles.label}>{label}</Text>
				<Flex align="baseline" gap="1">
					<Text className={styles.value} color={danger ? 'red' : undefined}>
						{value}
					</Text>
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
				{note && (
					<Text size="1" color="gray">
						{note}
					</Text>
				)}
			</Flex>
		</Card>
	);
}

function batteryRateLabel(kw: number | null): string {
	if (kw == null) return '—';
	if (kw > 0.05) return `+${kw.toFixed(2)}`;
	if (kw < -0.05) return kw.toFixed(2);
	return '0.00';
}

function batteryRateBadge(
	kw: number | null
): { label: string; color: 'green' | 'yellow' | 'red' } | undefined {
	if (kw == null) return undefined;
	if (kw < -0.05) return { label: 'Charging', color: 'green' };
	if (kw > 0.05) return { label: 'Discharging', color: 'yellow' };
	return { label: 'Idle', color: 'yellow' };
}

const VOLTAGE = 240;

export function SunkeepEnergyPanel({ status, batteryCapacityKwh }: SunkeepEnergyPanelProps) {
	const excessKw = status?.excessKw ?? null;
	const batteryPct = status?.batteryPct ?? null;
	const batteryKw = status?.batteryKw ?? null;
	const gridKw = status?.gridKw ?? null;
	const loadKw = status?.loadKw ?? null;
	const carKw =
		status?.activeSession != null ? (status.activeSession.currentAmps * VOLTAGE) / 1000 : 0;
	const houseKw = loadKw != null ? loadKw - carKw : null;

	const batteryNote = (() => {
		if (batteryPct == null || batteryKw == null || !batteryCapacityKwh) return undefined;
		if (batteryKw < -0.05) {
			// charging — time to full
			const hoursToFull = (((100 - batteryPct) / 100) * batteryCapacityKwh) / Math.abs(batteryKw);
			return `${formatTimeRemaining(hoursToFull)} to full`;
		}
		if (batteryKw > 0.05) {
			// discharging — time to empty
			const hoursToEmpty = ((batteryPct / 100) * batteryCapacityKwh) / batteryKw;
			return `${formatTimeRemaining(hoursToEmpty)} to empty`;
		}
		return undefined;
	})();

	const isTeslaStale =
		status?.lastTeslaAt != null &&
		Date.now() - new Date(status.lastTeslaAt).getTime() > 5 * 60 * 1000;

	return (
		<Flex direction="column" gap="3">
			<div className={styles.grid}>
				<StatCard
					label="Solar Production"
					value={status?.solarKw?.toFixed(2) ?? '—'}
					unit={status?.solarKw != null ? 'kW' : undefined}
				/>
				<StatCard
					label="Total Load"
					value={loadKw?.toFixed(2) ?? '—'}
					unit={loadKw != null ? 'kW' : undefined}
				/>
				<StatCard
					label="House Load"
					value={houseKw?.toFixed(2) ?? '—'}
					unit={houseKw != null ? 'kW' : undefined}
				/>
				<StatCard
					label="Car Load"
					value={status != null ? carKw.toFixed(2) : '—'}
					unit={status != null ? 'kW' : undefined}
				/>
				<StatCard
					label="Excess Solar"
					value={excessKw?.toFixed(2) ?? '—'}
					unit={excessKw != null ? 'kW' : undefined}
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
					value={batteryPct?.toFixed(1) ?? '—'}
					unit={batteryPct != null ? '%' : undefined}
					progress={
						batteryPct != null ? { value: batteryPct, color: batteryColor(batteryPct) } : undefined
					}
					note={batteryNote}
				/>
				<StatCard
					label="Battery Rate"
					value={batteryRateLabel(batteryKw)}
					unit={batteryKw != null ? 'kW' : undefined}
					badge={batteryRateBadge(batteryKw)}
				/>
				<StatCard
					label="Grid Draw"
					value={gridKw?.toFixed(2) ?? '—'}
					unit={gridKw != null ? 'kW' : undefined}
					danger={gridKw != null && gridKw > 0.05}
				/>
				{status?.gridStatus != null && <StatCard label="Grid Status" value={status.gridStatus} />}
			</div>
			<Flex gap="4" className={styles.footer}>
				<Text className={styles.lastUpdated}>Polled: {formatTime(status?.lastPollAt ?? null)}</Text>
				{status?.lastTeslaAt != null && (
					<Flex align="center" gap="1">
						<Text className={styles.lastUpdated}>Tesla: {formatTime(status.lastTeslaAt)}</Text>
						{isTeslaStale && (
							<Text size="1" color="yellow">
								⚠ Stale
							</Text>
						)}
					</Flex>
				)}
			</Flex>
		</Flex>
	);
}
