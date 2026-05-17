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

async function callApi(
	url: string,
	method: string,
	body?: unknown
): Promise<{ ok: boolean; error?: string }> {
	try {
		const res = await fetch(url, {
			method,
			headers: body ? { 'content-type': 'application/json' } : undefined,
			body: body ? JSON.stringify(body) : undefined,
		});
		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			return { ok: false, error: (data as { error?: string }).error ?? 'Action failed' };
		}
		return { ok: true };
	} catch {
		return { ok: false, error: 'Network error' };
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

	const withLoading = async (fn: () => Promise<void>) => {
		setLoading(true);
		setError(null);
		try {
			await fn();
		} finally {
			setLoading(false);
		}
	};

	const handleEnable = () =>
		withLoading(async () => {
			const r = await callApi('/api/gaspar/sunkeep/enable', 'POST');
			if (r.ok) await onAction();
			else setError(r.error ?? 'Failed');
		});

	const handleDisable = () =>
		withLoading(async () => {
			const r = await callApi('/api/gaspar/sunkeep/disable', 'POST');
			if (r.ok) await onAction();
			else setError(r.error ?? 'Failed');
		});

	const handleForceStart = () =>
		withLoading(async () => {
			const r = await callApi('/api/gaspar/sunkeep/charge/start', 'POST');
			if (r.ok) await onAction();
			else setError(r.error ?? 'Failed');
		});

	const handleForceStop = () =>
		withLoading(async () => {
			const r = await callApi('/api/gaspar/sunkeep/charge/stop', 'POST');
			if (r.ok) await onAction();
			else setError(r.error ?? 'Failed');
		});

	const handleLockAmps = () =>
		withLoading(async () => {
			const amps = parseInt(ampInput, 10);
			if (isNaN(amps) || amps < 8 || amps > 32) {
				setError('Enter a whole number between 8 and 32');
				setLoading(false);
				return;
			}
			const r = await callApi('/api/gaspar/sunkeep/charge/amps', 'POST', { amps });
			if (r.ok) await onAction();
			else setError(r.error ?? 'Failed to lock amps');
		});

	const handleUnlockAmps = () =>
		withLoading(async () => {
			const r = await callApi('/api/gaspar/sunkeep/charge/amps', 'DELETE');
			if (r.ok) {
				setAmpInput('');
				await onAction();
			} else {
				setError(r.error ?? 'Failed to unlock amps');
			}
		});

	const badgeColor = stateColor(status?.state);
	const stateLabel = status?.state ?? 'Unavailable';
	const isLocked = status?.lockedAmps != null;
	const isCharging = status?.state === 'CHARGING';
	const isDisabled = !status || status.state === 'DISABLED';

	return (
		<Card className={styles.card}>
			<Flex direction="column" gap="4">
				{/* State + Plug */}
				<Flex align="center" justify="between" gap="2">
					<Flex align="center" gap="2">
						<Text className={styles.sectionLabel}>State</Text>
						<Badge color={badgeColor} size="2">
							{stateLabel}
						</Badge>
					</Flex>
					{status?.isPluggedIn != null && (
						<Badge color={status.isPluggedIn ? 'blue' : 'gray'} variant="soft" size="1">
							{status.isPluggedIn ? 'Plugged in' : 'Unplugged'}
						</Badge>
					)}
				</Flex>

				{/* Current amps (when charging) */}
				{isCharging && status?.activeSession && (
					<Flex align="center" gap="2">
						<Text className={styles.sectionLabel}>Charging at</Text>
						<Text size="3" weight="bold">
							{status.activeSession.currentAmps} A
						</Text>
						{isLocked && (
							<Badge color="orange" variant="soft" size="1">
								Locked
							</Badge>
						)}
					</Flex>
				)}

				<Separator size="4" />

				{/* Automation */}
				<Flex align="center" justify="between" gap="2">
					<Flex align="center" gap="2">
						<Text className={styles.sectionLabel}>Automation</Text>
						<Badge color={status?.enabled ? 'green' : 'gray'} variant="soft" size="1">
							{status?.enabled ? 'Active' : 'Disabled'}
						</Badge>
					</Flex>
					{status?.enabled ? (
						<Button size="1" color="red" variant="soft" onClick={handleDisable} disabled={loading}>
							Disable
						</Button>
					) : (
						<Button size="1" color="green" onClick={handleEnable} disabled={loading || !status}>
							Enable
						</Button>
					)}
				</Flex>

				<Separator size="4" />

				{/* Session controls */}
				<Flex direction="column" gap="2">
					<Text className={styles.sectionLabel}>Charging Session</Text>
					<div className={styles.buttonRow}>
						<Button
							size="1"
							color="teal"
							onClick={handleForceStart}
							disabled={loading || isDisabled || isCharging}
						>
							Force Start
						</Button>
						<Button
							size="1"
							color="red"
							variant="soft"
							onClick={handleForceStop}
							disabled={loading || !isCharging}
						>
							Force Stop
						</Button>
					</div>
				</Flex>

				<Separator size="4" />

				{/* Amp override */}
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
						<Button size="1" onClick={handleLockAmps} disabled={loading || !status}>
							Lock
						</Button>
						{isLocked && (
							<Button
								size="1"
								color="gray"
								variant="soft"
								onClick={handleUnlockAmps}
								disabled={loading}
							>
								Unlock
							</Button>
						)}
					</div>
					<Text size="1" color="gray">
						{isLocked ? `Locked at ${status!.lockedAmps} A` : 'Auto-adjusting'}
					</Text>
				</Flex>

				{error !== null && (
					<Text color="red" size="1">
						{error}
					</Text>
				)}
			</Flex>
		</Card>
	);
}
