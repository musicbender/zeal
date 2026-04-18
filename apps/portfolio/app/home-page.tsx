'use client';

import { Heading, Text } from '@radix-ui/themes';
import {
	useClockGlitch,
	useCoffeeGlitch,
	useCursorTrail,
	useGlitchOnLoad,
	useSkillRotation,
} from '@repo/utils/hooks/glitch-effects';
import { useCallback, useState } from 'react';
import { SocialLinks } from '../components/social-links/social-links';
import { StatGroup } from '../components/stat-group/stat-group';
import styles from './page.module.css';

interface HomePageProps {
	skills: { label: string; strength: number }[];
}

const socialLinks = [
	{ label: 'EMAIL', href: 'mailto:pat@patjacobs.dev' },
	{ label: 'GITHUB', href: 'https://github.com/musicbender', external: true },
	{ label: 'LINKEDIN', href: 'https://linkedin.com/in/patjacobs', external: true },
];

const navItems = ['about', 'projects', 'skills', 'contact'];

export default function HomePage({ skills }: HomePageProps) {
	const [activeItem, setActiveItem] = useState<string | null>(null);
	const handleHover = useCallback((key: string) => setActiveItem(key), []);

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
						<Heading as="h1" mb="8" className={styles.name}>
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
										className={`${styles.navItem} ${activeItem === item ? styles.navItemActive : ''}`}
										onMouseEnter={() => handleHover(item)}
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
		</div>
	);
}
