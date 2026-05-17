import { Badge, Card, Flex, Text } from '@radix-ui/themes';
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
				{meta.cpPowerSourceAmps != null && meta.cpPowerSourceType != null && (
					<MetaRow
						label="Power Source"
						value={`${meta.cpPowerSourceAmps}A ${meta.cpPowerSourceType}`}
					/>
				)}
				{meta.cpLedBrightnessLevel != null && (
					<MetaRow
						label="LED Brightness"
						value={
							meta.cpLedBrightnessMax != null
								? `${meta.cpLedBrightnessLevel} / ${meta.cpLedBrightnessMax}`
								: meta.cpLedBrightnessLevel
						}
					/>
				)}
				{meta.cpScheduleActive != null && (
					<Flex gap="3" align="baseline">
						<Text className={styles.label}>Schedule</Text>
						<Badge color={meta.cpScheduleActive ? 'green' : 'gray'} size="1">
							{meta.cpScheduleActive ? 'Active' : 'Inactive'}
						</Badge>
					</Flex>
				)}
			</MetaSection>
			<MetaSection heading="Tesla Powerwall">
				<MetaRow label="Device ID" value={meta.teslaEnergySiteId} />
				{meta.teslaSiteName != null && <MetaRow label="Site Name" value={meta.teslaSiteName} />}
				{meta.teslaModel != null && <MetaRow label="Model" value={meta.teslaModel} />}
				{meta.teslaFirmwareVersion != null && (
					<MetaRow label="Firmware" value={meta.teslaFirmwareVersion} />
				)}
				{meta.teslaBatteryCapacityKwh != null && (
					<MetaRow
						label="Battery Capacity"
						value={`${meta.teslaBatteryCapacityKwh.toFixed(1)} kWh`}
					/>
				)}
				{meta.teslaBatteryCount != null && (
					<MetaRow label="Battery Count" value={meta.teslaBatteryCount} />
				)}
				{meta.teslaBackupReservePct != null && (
					<MetaRow label="Backup Reserve" value={`${meta.teslaBackupReservePct}%`} />
				)}
				{meta.teslaStormModeEnabled != null && (
					<Flex gap="3" align="baseline">
						<Text className={styles.label}>Storm Mode</Text>
						<Badge color={meta.teslaStormModeEnabled ? 'blue' : 'gray'} size="1">
							{meta.teslaStormModeEnabled ? 'On' : 'Off'}
						</Badge>
					</Flex>
				)}
			</MetaSection>
		</div>
	);
}
