'use client';

import { Heading, Text } from '@radix-ui/themes';
import type { HygraphSection } from '@repo/remote-data';
import {
	useClockGlitch,
	useCoffeeGlitch,
	useCursorTrail,
	useGlitchOnLoad,
	useSkillRotation,
} from '@repo/utils/hooks/glitch-effects';
import { useCallback, useState } from 'react';
import { DrawerContent } from '../components/drawer-content/about-content';
import { ContactContent } from '../components/drawer-content/contact-content';
import { ProjectsContent } from '../components/drawer-content/projects-content';
import { SkillsContent } from '../components/drawer-content/skills-content';
import { DrawerShell } from '../components/drawer-shell/drawer-shell';
import { SocialLinks } from '../components/social-links/social-links';
import { StatGroup } from '../components/stat-group/stat-group';
import styles from './page.module.css';

type DrawerPage = 'about' | 'projects' | 'skills' | 'contact';

interface DrawerData {
	about: HygraphSection | null;
	contact: HygraphSection | null;
	skillsSection: HygraphSection | null;
	skills: string[];
	projects: { slug: string; title: string; subtitle: string | null }[];
}

interface HomePageProps {
	skills: { label: string; strength: number }[];
	drawerData: DrawerData;
}

const socialLinks = [
	{ label: 'EMAIL', href: 'mailto:pat@patjacobs.dev' },
	{ label: 'GITHUB', href: 'https://github.com/musicbender', external: true },
	{ label: 'LINKEDIN', href: 'https://linkedin.com/in/patjacobs', external: true },
];

const navItems: DrawerPage[] = ['about', 'projects', 'skills', 'contact'];

export default function HomePage({ skills, drawerData }: HomePageProps) {
	const [activeDrawer, setActiveDrawer] = useState<DrawerPage | null>(null);

	const openDrawer = useCallback((page: DrawerPage) => setActiveDrawer(page), []);
	const closeDrawer = useCallback(() => setActiveDrawer(null), []);

	useGlitchOnLoad('[data-glitch-value]');
	useClockGlitch('time-value');
	useCoffeeGlitch('coffee-value');
	useSkillRotation('skill-value', skills);
	useCursorTrail();

	return (
		<div className={styles.body}>
			<div className={styles.contentLayer}>
				<StatGroup
					stats={[
						{ label: 'YRS', value: '8' },
						{ label: 'LOC', value: 'SF' },
					]}
					className={styles.group1}
				/>

				<StatGroup
					stats={[
						{ label: 'CLK', value: '00:00:00', id: 'time-value', realtime: true },
						{ label: 'CFE', value: '4', id: 'coffee-value', realtime: true },
					]}
					className={styles.group2}
				/>

				<StatGroup
					stats={[
						{ label: 'STP', value: '42.8K' },
						{ label: 'FIX', value: '234' },
						{ label: 'SKL', value: 'React', id: 'skill-value' },
					]}
					className={styles.group3}
				/>

				<StatGroup
					stats={[
						{ label: 'SIL', value: '\u00d73' },
						{ label: 'TAB', value: '47' },
					]}
					className={styles.group4}
				/>

				{/* Main content */}
				<div className={styles.main}>
					<div className={styles.header}>
						<Heading as="h1" mb={{ initial: '4', sm: '6', lg: '6' }} className={styles.name}>
							Pat Jacobs
						</Heading>
						<Text as="p" size="1" weight="bold" mb="4" className={styles.title}>
							{'/// Software Engineer'}
						</Text>
					</div>

					<nav className={styles.nav}>
						<ul className={styles.navList}>
							{navItems.map((item) => (
								<li key={item}>
									<button
										type="button"
										className={`${styles.navItem} ${activeDrawer === item ? styles.navItemActive : ''}`}
										onMouseEnter={() => openDrawer(item)}
										onClick={() => openDrawer(item)}
									>
										<span className={styles.navCaret}>&gt;</span>
										<Text as="span" size="1">
											{item}
										</Text>
									</button>
								</li>
							))}
						</ul>
					</nav>
				</div>

				<SocialLinks links={socialLinks} />
			</div>

			{activeDrawer && (
				<DrawerShell onClose={closeDrawer} key={activeDrawer}>
					{activeDrawer === 'about' && <DrawerContent section={drawerData.about} />}
					{activeDrawer === 'projects' && <ProjectsContent projects={drawerData.projects} />}
					{activeDrawer === 'skills' && (
						<SkillsContent
							heading={drawerData.skillsSection?.heading?.replace(/_/g, ' ') ?? 'stuff i know'}
							skills={drawerData.skills}
						/>
					)}
					{activeDrawer === 'contact' && <ContactContent section={drawerData.contact} />}
				</DrawerShell>
			)}
		</div>
	);
}
