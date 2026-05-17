'use client';

import { Badge, Text } from '@radix-ui/themes';
import type { ChargingEventSummary, ChargingEventsPage } from '@repo/magus-data';
import { useState } from 'react';
import styles from './sunkeep-events-table.module.css';

interface SunkeepEventsTableProps {
	initialData: ChargingEventsPage | null;
}

function formatDate(iso: string): string {
	return new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(new Date(iso));
}

function formatDuration(startedAt: string, stoppedAt: string | null): string {
	if (!stoppedAt) return 'Running';
	const minutes = Math.round(
		(new Date(stoppedAt).getTime() - new Date(startedAt).getTime()) / 60_000
	);
	if (minutes < 60) return `${minutes}m`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const STOP_REASON_LABELS: Record<string, string> = {
	solar_dropped: 'Solar dropped',
	night_safety: 'Night safety',
	battery_depleted: 'Battery low',
	unplugged: 'Unplugged',
	manual: 'Manual',
	error: 'Error',
};

function EventRow({ event }: { event: ChargingEventSummary }) {
	const isRunning = event.stoppedAt === null;
	const duration = formatDuration(event.startedAt, event.stoppedAt);
	const energy = event.energyKwh != null ? `${event.energyKwh.toFixed(2)} kWh` : '—';
	const peakSolar = event.peakSolarKw != null ? `${event.peakSolarKw.toFixed(1)} kW` : '—';
	const amps =
		event.endAmps != null ? `${event.startAmps}→${event.endAmps}A` : `${event.startAmps}A`;
	const reasonLabel = event.stopReason
		? (STOP_REASON_LABELS[event.stopReason] ?? event.stopReason)
		: '—';

	return (
		<tr>
			<td className={styles.td}>{formatDate(event.startedAt)}</td>
			<td className={styles.td}>
				{isRunning ? <span className={styles.running}>{duration}</span> : duration}
			</td>
			<td className={styles.td}>{energy}</td>
			<td className={styles.td}>{peakSolar}</td>
			<td className={styles.td}>{amps}</td>
			<td className={styles.td}>
				{event.stopReason ? (
					<Badge color={event.stopReason === 'error' ? 'red' : 'gray'} size="1" variant="soft">
						{reasonLabel}
					</Badge>
				) : (
					reasonLabel
				)}
			</td>
		</tr>
	);
}

export function SunkeepEventsTable({ initialData }: SunkeepEventsTableProps) {
	const [data] = useState<ChargingEventsPage | null>(initialData);

	if (data === null) {
		return <Text color="gray">Unable to load charging history.</Text>;
	}

	if (data.events.length === 0) {
		return <Text color="gray">No charging sessions yet.</Text>;
	}

	return (
		<div className={styles.container}>
			<div className={styles.meta}>
				<Text size="1" color="gray">
					Showing {data.events.length} of {data.total} sessions
				</Text>
			</div>
			<table className={styles.table}>
				<thead>
					<tr>
						<th className={styles.th}>Started</th>
						<th className={styles.th}>Duration</th>
						<th className={styles.th}>Energy</th>
						<th className={styles.th}>Peak Solar</th>
						<th className={styles.th}>Amps</th>
						<th className={styles.th}>Reason</th>
					</tr>
				</thead>
				<tbody>
					{data.events.map((event) => (
						<EventRow key={event.id} event={event} />
					))}
				</tbody>
			</table>
		</div>
	);
}
