'use client';

import { SERVICE_REGISTRY } from '@/lib/services';
import { useSidebarStore } from '@/lib/sidebar-store';
import { Flex, Separator, Text } from '@radix-ui/themes';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import styles from './sidebar.module.css';

export function Sidebar() {
	const pathname = usePathname();
	const isOpen = useSidebarStore((state) => state.isOpen);
	const close = useSidebarStore((state) => state.close);

	useEffect(() => {
		close();
	}, [pathname, close]);

	function navClass(href: string) {
		return pathname === href ? `${styles.navLink} ${styles.active}` : styles.navLink;
	}

	return (
		<>
			{isOpen && <div className={styles.backdrop} onClick={close} aria-hidden="true" />}
			<nav className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
				<div className={styles.sidebarHeader}>
					<Text size="2" weight="bold" className={styles.appName}>
						FIENDLORD KEEP
					</Text>
					<button onClick={close} className={styles.closeButton} aria-label="Close navigation">
						✕
					</button>
				</div>

				<Separator size="4" />

				<Flex direction="column" gap="4" mt="4">
					<Flex direction="column" gap="1">
						<Link
							href="/"
							className={navClass('/')}
							aria-current={pathname === '/' ? 'page' : undefined}
						>
							Home
						</Link>
					</Flex>

					<Separator size="4" />

					<Flex direction="column" gap="1">
						<Text size="1" color="gray" weight="medium" className={styles.sectionHeader}>
							SERVICES
						</Text>
						{SERVICE_REGISTRY.map((service) => {
							const serviceBase = `/services/${service.name}`;
							const isServiceActive = pathname.startsWith(serviceBase);
							return (
								<div key={service.name}>
									<Link
										href={
											service.subPages ? `${serviceBase}/${service.subPages[0]!.name}` : serviceBase
										}
										className={
											isServiceActive ? `${styles.navLink} ${styles.active}` : styles.navLink
										}
										aria-current={isServiceActive ? 'page' : undefined}
									>
										{service.displayName}
									</Link>
									{service.subPages && isServiceActive && (
										<Flex direction="column" gap="1" className={styles.subNav}>
											{service.subPages.map((sub) => (
												<Link
													key={sub.name}
													href={`${serviceBase}/${sub.name}`}
													className={navClass(`${serviceBase}/${sub.name}`)}
													aria-current={
														pathname === `${serviceBase}/${sub.name}` ? 'page' : undefined
													}
												>
													{sub.displayName}
												</Link>
											))}
										</Flex>
									)}
								</div>
							);
						})}
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
								aria-current={pathname === `/logs/${service.name}` ? 'page' : undefined}
							>
								{service.displayName}
							</Link>
						))}
					</Flex>
				</Flex>
			</nav>
		</>
	);
}
