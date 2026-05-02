'use client';

import { SERVICE_REGISTRY } from '@/lib/services';
import { Flex, Separator, Text } from '@radix-ui/themes';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import styles from './sidebar.module.css';

export function Sidebar() {
	const pathname = usePathname();

	function navClass(href: string) {
		return pathname === href ? `${styles.navLink} ${styles.active}` : styles.navLink;
	}

	return (
		<nav className={styles.sidebar}>
			<Flex direction="column" gap="4">
				<Text size="2" weight="bold" className={styles.appName}>
					FIENDLORD KEEP
				</Text>

				<Separator size="4" />

				<Flex direction="column" gap="1">
					<Link href="/" className={navClass('/')}>
						Home
					</Link>
				</Flex>

				<Separator size="4" />

				<Flex direction="column" gap="1">
					<Text size="1" color="gray" weight="medium" className={styles.sectionHeader}>
						SERVICES
					</Text>
					{SERVICE_REGISTRY.map((service) => (
						<Link
							key={service.name}
							href={`/services/${service.name}`}
							className={navClass(`/services/${service.name}`)}
						>
							{service.displayName}
						</Link>
					))}
				</Flex>

				<Separator size="4" />

				<Flex direction="column" gap="1">
					<Text size="1" color="gray" weight="medium" className={styles.sectionHeader}>
						LOGS
					</Text>
					{SERVICE_REGISTRY.map((service) => (
						<Link
							key={service.name}
							href={`/logs/${service.name}`}
							className={navClass(`/logs/${service.name}`)}
						>
							{service.displayName}
						</Link>
					))}
				</Flex>
			</Flex>
		</nav>
	);
}
