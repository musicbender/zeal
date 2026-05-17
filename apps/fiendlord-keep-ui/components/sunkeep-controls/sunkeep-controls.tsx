'use client';

import { Badge, Button, Card, Flex, Separator, Text } from '@radix-ui/themes';
import type { SunkeepStatus } from '@repo/magus-data';
import { useEffect, useState } from 'react';
import styles from './sunkeep-controls.module.css';

interface SunkeepControlsProps {
	status: SunkeepStatus | null;
	onAction: () => Promise<void>;
}

function stateColor(
	state: SunkeepStatus['state'] | undefined
): 'green' | 'yellow' | 'red' | 'gray' {
	switch (state) {
		case 'CHARGING':
			return 'green';
		case 'WAITING':
			return 'yellow';
		case 'ERROR':
			return 'red';
		default:
			return 'gray';
	}
}

export function SunkeepControls({ status, onAction }: SunkeepControlsProps) {
	const [loading, setLoading] = useState(false);
	const [ampInput, setAmpInput] = useState(status?.lockedAmps?.toString() ?? '');
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (status?.lockedAmps != null) {
			setAmpInput(status.lockedAmps.toString());
		}
	}, [status?.lockedAmps]);

	const handleEnable = async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch('/api/gaspar/sunkeep/enable', { method: 'POST' });
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError((data as { error?: string }).error ?? 'Action failed');
			} else {
				await onAction();
			}
		} catch {
			setError('Network error');
		} finally {
			setLoading(false);
		}
	};

	const handleDisable = async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch('/api/gaspar/sunkeep/disable', { method: 'POST' });
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError((data as { error?: string }).error ?? 'Action failed');
			} else {
				await onAction();
			}
		} catch {
			setError('Network error');
		} finally {
			setLoading(false);
		}
	};

	const handleForceStart = async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch('/api/gaspar/sunkeep/charge/start', { method: 'POST' });
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError((data as { error?: string }).error ?? 'Action failed');
			} else {
				await onAction();
			}
		} catch {
			setError('Network error');
		} finally {
			setLoading(false);
		}
	};

	const handleForceStop = async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch('/api/gaspar/sunkeep/charge/stop', { method: 'POST' });
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError((data as { error?: string }).error ?? 'Action failed');
			} else {
				await onAction();
			}
		} catch {
			setError('Network error');
		} finally {
			setLoading(false);
		}
	};

	const handleLockAmps = async () => {
		const amps = parseInt(ampInput, 10);
		if (isNaN(amps) || amps < 8 || amps > 32) {
			setError('Enter a whole number between 8 and 32');
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const res = await fetch('/api/gaspar/sunkeep/charge/amps', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ amps }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError((data as { error?: string }).error ?? 'Failed to lock amps');
			} else {
				await onAction();
			}
		} catch {
			setError('Network error');
		} finally {
			setLoading(false);
		}
	};

	const handleUnlockAmps = async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch('/api/gaspar/sunkeep/charge/amps', { method: 'DELETE' });
			if (!res.ok) {
				setError('Failed to unlock amps');
			} else {
				setAmpInput('');
				await onAction();
			}
		} catch {
			setError('Network error');
		} finally {
			setLoading(false);
		}
	};

	const badgeColor = stateColor(status?.state);
	const stateLabel = status?.state ?? 'Unavailable';

	const isLocked = status?.lockedAmps !== null && status?.lockedAmps !== undefined;

	return (
		<Card className={styles.card}>
			<Flex direction="column" gap="4">
				{/* Section 1 — State */}
				<Flex direction="column" gap="2">
					<Text className={styles.sectionLabel}>State</Text>
					<Badge color={badgeColor} size="2">
						{stateLabel}
					</Badge>
				</Flex>

				<Separator size="4" />

				{/* Section 2 — Automation */}
				<Flex direction="column" gap="2">
					<Text className={styles.sectionLabel}>Automation</Text>
					{status?.enabled ? (
						<Button color="red" onClick={handleDisable} disabled={loading || status === null}>
							Disable Automation
						</Button>
					) : (
						<Button color="green" onClick={handleEnable} disabled={loading || status === null}>
							Enable Automation
						</Button>
					)}
				</Flex>

				<Separator size="4" />

				{/* Section 3 — Session */}
				<Flex direction="column" gap="2">
					<Text className={styles.sectionLabel}>Session</Text>
					<div className={styles.buttonRow}>
						<Button
							color="teal"
							onClick={handleForceStart}
							disabled={
								loading || !status || status.state === 'CHARGING' || status.state === 'DISABLED'
							}
						>
							Force Start
						</Button>
						<Button
							color="red"
							onClick={handleForceStop}
							disabled={loading || !status || status.state !== 'CHARGING'}
						>
							Force Stop
						</Button>
					</div>
				</Flex>

				<Separator size="4" />

				{/* Section 4 — Amp Override */}
				<Flex direction="column" gap="2">
					<Text className={styles.sectionLabel}>Amp Override</Text>
					<div className={styles.ampRow}>
						<input
							type="number"
							min={8}
							max={32}
							step={1}
							value={ampInput}
							onChange={(e) => setAmpInput(e.target.value)}
							className={styles.ampInput}
							aria-label="Amp override value"
						/>
						<Button onClick={handleLockAmps} disabled={loading || !status}>
							Lock
						</Button>
						{isLocked && (
							<Button color="red" variant="soft" onClick={handleUnlockAmps} disabled={loading}>
								Unlock
							</Button>
						)}
					</div>
					<Text size="1" color="gray">
						{isLocked ? `Locked at ${status!.lockedAmps} A` : 'Auto-adjusting'}
					</Text>
				</Flex>

				{/* Error display */}
				{error !== null && (
					<Text color="red" size="1">
						{error}
					</Text>
				)}
			</Flex>
		</Card>
	);
}
