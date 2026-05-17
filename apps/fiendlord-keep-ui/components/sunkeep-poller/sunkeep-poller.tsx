'use client';

import { SunkeepControls } from '@/components/sunkeep-controls/sunkeep-controls';
import { SunkeepEnergyPanel } from '@/components/sunkeep-energy-panel/sunkeep-energy-panel';
import { UpdateIcon } from '@radix-ui/react-icons';
import { IconButton } from '@radix-ui/themes';
import type { SunkeepStatus } from '@repo/magus-data';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './sunkeep-poller.module.css';

interface SunkeepPollerProps {
	initialStatus: SunkeepStatus | null;
	batteryCapacityKwh?: number | null;
}

export function SunkeepPoller({ initialStatus, batteryCapacityKwh }: SunkeepPollerProps) {
	const [status, setStatus] = useState<SunkeepStatus | null>(initialStatus);
	const [refreshing, setRefreshing] = useState(false);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const poll = useCallback(async () => {
		try {
			const res = await fetch('/api/gaspar/sunkeep/status');
			if (res.ok) setStatus(await res.json());
		} catch {
			// keep last known status on error
		}
	}, []);

	const handleRefresh = useCallback(async () => {
		setRefreshing(true);
		try {
			const res = await fetch('/api/gaspar/sunkeep/poll', { method: 'POST' });
			if (res.ok) setStatus(await res.json());
		} catch {
			// keep last known status on error
		} finally {
			setRefreshing(false);
		}
	}, []);

	const startPolling = useCallback(() => {
		if (intervalRef.current) clearInterval(intervalRef.current);
		intervalRef.current = setInterval(poll, 60_000);
	}, [poll]);

	const stopPolling = useCallback(() => {
		if (intervalRef.current) {
			clearInterval(intervalRef.current);
			intervalRef.current = null;
		}
	}, []);

	useEffect(() => {
		startPolling();

		const handleVisibilityChange = () => {
			if (document.hidden) {
				stopPolling();
			} else {
				poll();
				startPolling();
			}
		};

		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			stopPolling();
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	}, [poll, startPolling, stopPolling]);

	return (
		<div className={styles.wrapper}>
			<div className={styles.toolbar}>
				<IconButton
					size="1"
					variant="ghost"
					onClick={handleRefresh}
					disabled={refreshing}
					aria-label="Refresh status"
					className={refreshing ? styles.spinning : undefined}
				>
					<UpdateIcon />
				</IconButton>
			</div>
			<div className={styles.layout}>
				<SunkeepEnergyPanel status={status} batteryCapacityKwh={batteryCapacityKwh} />
				<SunkeepControls status={status} onAction={poll} />
			</div>
		</div>
	);
}
