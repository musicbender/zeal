import { Card, Flex, Text } from '@radix-ui/themes';
import type { SunkeepMeta } from '@repo/magus-data';
import styles from './sunkeep-meta-panel.module.css';

interface SunkeepMetaPanelProps {
	meta: SunkeepMeta;
}

function MetaRow({ label, value }: { label: string; value: string | number | null }) {
	return (
		<Flex gap="3" align="baseline">
			<Text className={styles.label}>{label}</Text>
			<Text size="2" color={value == null ? 'gray' : undefined}>
				{value ?? '—'}
			</Text>
		</Flex>
	);
}

function MetaSection({ heading, children }: { heading: string; children: React.ReactNode }) {
	return (
		<Card className={styles.card}>
			<Flex direction="column" gap="2">
				<Text className={styles.heading}>{heading}</Text>
				{children}
			</Flex>
		</Card>
	);
}

export function SunkeepMetaPanel({ meta }: SunkeepMetaPanelProps) {
	return (
		<div className={styles.grid}>
			<MetaSection heading="ChargePoint">
				<MetaRow label="Device ID" value={meta.chargePointDeviceId} />
				<MetaRow label="Software Version" value={meta.softwareVersion} />
				<MetaRow label="Device IP" value={meta.deviceIp} />
			</MetaSection>
			<MetaSection heading="Tesla Powerwall">
				<MetaRow label="Site ID" value={meta.teslaEnergySiteId} />
			</MetaSection>
		</div>
	);
}
