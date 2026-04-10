'use client';

import { Heading, Text } from '@radix-ui/themes';
import { DecorativeBlocks } from '@repo/ui/decorative-blocks';
import { ProjectIconSvg } from '@repo/ui/project-icon';
import type { ProjectIcon } from '@repo/utils/common/icon';
import {
	useClockGlitch,
	useCoffeeGlitch,
	useCursorTrail,
	useGlitchOnLoad,
	useSkillRotation,
} from '@repo/utils/hooks/glitch-effects';
import Link from 'next/link';
import { SocialLinks } from '../components/social-links/social-links';
import { StatGroup } from '../components/stat-group/stat-group';
import styles from './page.module.css';

interface HomeProject {
	slug: string;
	name: string;
	icon: ProjectIcon;
}

interface HomePageProps {
	projects: HomeProject[];
	skills: { label: string; strength: number }[];
}

const socialLinks = [
	{ label: 'EMAIL', href: 'mailto:pat@patjacobs.dev' },
	{ label: 'GITHUB', href: 'https://github.com/musicbender', external: true },
	{ label: 'LINKEDIN', href: 'https://linkedin.com/in/patjacobs', external: true },
];

export default function HomePage({ projects, skills }: HomePageProps) {
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
						<Text as="p" size="1" weight="regular" className={styles.title}>
							Software Engineer
						</Text>
						<DecorativeBlocks />
					</div>

					<div className={styles.projects}>
						<Text as="p" size="1" color="gray" className={styles.projectsTitle}>
							&mdash;
						</Text>
						<ul className={styles.projectList}>
							{projects.map((project) => (
								<li key={project.slug}>
									<Link
										href={`/projects/${project.slug}`}
										className={styles.projectItem}
									>
										<div className={styles.projectIcon}>
											<ProjectIconSvg icon={project.icon} />
										</div>
										<Text as="span" size="1">{project.name}</Text>
									</Link>
								</li>
							))}
						</ul>
					</div>
				</div>

				<SocialLinks links={socialLinks} />
			</div>
		</div>
	);
}
