'use client';

import { SunkeepControls } from '@/components/sunkeep-controls/sunkeep-controls';
import { SunkeepEnergyPanel } from '@/components/sunkeep-energy-panel/sunkeep-energy-panel';
import type { SunkeepStatus } from '@repo/magus-data';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './sunkeep-poller.module.css';

interface SunkeepPollerProps {
	initialStatus: SunkeepStatus | null;
}

export function SunkeepPoller({ initialStatus }: SunkeepPollerProps) {
	const [status, setStatus] = useState<SunkeepStatus | null>(initialStatus);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const poll = useCallback(async () => {
		try {
			const res = await fetch('/api/gaspar/sunkeep/status');
			if (res.ok) setStatus(await res.json());
		} catch {
			// keep last known status on error
		}
	}, []);

	const startPolling = useCallback(() => {
		if (intervalRef.current) clearInterval(intervalRef.current);
		intervalRef.current = setInterval(poll, 30_000);
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
		<div className={styles.layout}>
			<SunkeepEnergyPanel status={status} />
			<SunkeepControls status={status} onAction={poll} />
		</div>
	);
}
