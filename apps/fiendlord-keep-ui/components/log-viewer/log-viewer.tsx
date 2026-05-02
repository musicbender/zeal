'use client';

import { Badge, Button, Flex, ScrollArea, Switch, Tabs, Text } from '@radix-ui/themes';
import type { LogEntry } from '@repo/magus-data';
import { useCallback, useEffect, useRef, useState } from 'react';

import styles from './log-viewer.module.css';

interface LogViewerProps {
	initialLogs: LogEntry[];
	service: string;
}

type LevelFilter = 'ALL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

const LEVEL_COLOR: Record<LogEntry['level'], 'red' | 'yellow' | 'teal' | 'gray'> = {
	ERROR: 'red',
	WARN: 'yellow',
	INFO: 'teal',
	DEBUG: 'gray',
};

function formatTime(timestamp: string): string {
	const d = new Date(timestamp);
	const hh = String(d.getHours()).padStart(2, '0');
	const mm = String(d.getMinutes()).padStart(2, '0');
	const ss = String(d.getSeconds()).padStart(2, '0');
	return `${hh}:${mm}:${ss}`;
}

export function LogViewer({ initialLogs, service }: LogViewerProps) {
	const [logs, setLogs] = useState<LogEntry[]>(initialLogs);
	const [levelFilter, setLevelFilter] = useState<LevelFilter>('ALL');
	const [autoRefresh, setAutoRefresh] = useState(false);
	const [loading, setLoading] = useState(false);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const fetchLogs = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch(`/api/logs/${service}?limit=200`);
			if (res.ok) {
				const data = (await res.json()) as LogEntry[];
				setLogs(data);
			}
		} finally {
			setLoading(false);
		}
	}, [service]);

	useEffect(() => {
		if (autoRefresh) {
			intervalRef.current = setInterval(() => {
				void fetchLogs();
			}, 30000);
		} else {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
		}
		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
		};
	}, [autoRefresh, fetchLogs]);

	const errorCount = logs.filter((l) => l.level === 'ERROR').length;

	const filtered = levelFilter === 'ALL' ? logs : logs.filter((l) => l.level === levelFilter);

	return (
		<Flex direction="column" gap="3" className={styles.container}>
			<Flex align="center" justify="between" gap="3" wrap="wrap">
				<Tabs.Root value={levelFilter} onValueChange={(v) => setLevelFilter(v as LevelFilter)}>
					<Tabs.List>
						<Tabs.Trigger value="ALL">All</Tabs.Trigger>
						<Tabs.Trigger value="ERROR">
							<Flex align="center" gap="1">
								Error
								{errorCount > 0 && (
									<Badge color="red" size="1" variant="solid">
										{errorCount}
									</Badge>
								)}
							</Flex>
						</Tabs.Trigger>
						<Tabs.Trigger value="WARN">Warn</Tabs.Trigger>
						<Tabs.Trigger value="INFO">Info</Tabs.Trigger>
						<Tabs.Trigger value="DEBUG">Debug</Tabs.Trigger>
					</Tabs.List>
				</Tabs.Root>

				<Flex align="center" gap="3">
					<Flex align="center" gap="2">
						<Switch
							checked={autoRefresh}
							onCheckedChange={setAutoRefresh}
							size="1"
							id="auto-refresh"
						/>
						<Text as="label" htmlFor="auto-refresh" size="2" color="gray">
							Auto-refresh
						</Text>
					</Flex>
					<Button size="2" variant="soft" onClick={() => void fetchLogs()} disabled={loading}>
						{loading ? 'Loading…' : 'Refresh'}
					</Button>
				</Flex>
			</Flex>

			<ScrollArea className={styles.scrollArea} scrollbars="vertical">
				<div className={styles.logList}>
					{filtered.length === 0 ? (
						<Text size="2" color="gray" className={styles.empty}>
							No log entries.
						</Text>
					) : (
						filtered.map((entry, i) => (
							<div key={i} className={styles.logRow}>
								<Text size="1" color="gray" className={styles.timestamp}>
									{formatTime(entry.timestamp)}
								</Text>
								<Badge
									color={LEVEL_COLOR[entry.level]}
									variant="soft"
									size="1"
									className={styles.levelBadge}
								>
									{entry.level}
								</Badge>
								<Text size="2" className={styles.message}>
									{entry.message}
								</Text>
							</div>
						))
					)}
				</div>
			</ScrollArea>
		</Flex>
	);
}
