'use client';

import { SunkeepControls } from '@/components/sunkeep-controls/sunkeep-controls';
import { SunkeepEnergyPanel } from '@/components/sunkeep-energy-panel/sunkeep-energy-panel';
import type { SunkeepStatus } from '@repo/magus-data';
import { useCallback, useEffect, useState } from 'react';
import styles from './sunkeep-poller.module.css';

interface SunkeepPollerProps {
	initialStatus: SunkeepStatus | null;
}

export function SunkeepPoller({ initialStatus }: SunkeepPollerProps) {
	const [status, setStatus] = useState<SunkeepStatus | null>(initialStatus);

	const poll = useCallback(async () => {
		try {
			const res = await fetch('/api/gaspar/sunkeep/status');
			if (res.ok) setStatus(await res.json());
		} catch {
			// keep last known status on error
		}
	}, []);

	useEffect(() => {
		const interval = setInterval(poll, 30_000);
		return () => clearInterval(interval);
	}, [poll]);

	return (
		<div className={styles.layout}>
			<SunkeepEnergyPanel status={status} />
			<SunkeepControls status={status} onAction={poll} />
		</div>
	);
}
