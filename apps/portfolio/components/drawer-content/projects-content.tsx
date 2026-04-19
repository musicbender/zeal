'use client';

import { Heading, Text } from '@radix-ui/themes';
import { ProjectIconSvg } from '@repo/ui/project-icon';
import type { ProjectIcon } from '@repo/utils/common/icon';
import { useGlitchOnLoad } from '@repo/utils/hooks/glitch-effects';
import Link from 'next/link';
import styles from '../drawer-shell/drawer-shell.module.css';
import projectStyles from './projects-content.module.css';

interface Project {
	slug: string;
	title: string;
	description: string | null;
	icon: ProjectIcon;
}

interface ProjectsContentProps {
	projects: Project[];
}

export function ProjectsContent({ projects }: ProjectsContentProps) {
	useGlitchOnLoad('[data-drawer-glitch]');

	return (
		<>
			<Heading as="h2" className={styles.heading}>
				<span data-drawer-glitch>projects</span>
			</Heading>
			<Text as="p" className={styles.subtext}>
				/// selected work
			</Text>

			<ul className={projectStyles.list}>
				{projects.map((project, i) => (
					<li key={project.slug}>
						<Link href={`/projects/${project.slug}`} className={projectStyles.item}>
							<span className={projectStyles.index}>{String(i + 1).padStart(2, '0')}</span>
							<span className={projectStyles.icon}>
								<ProjectIconSvg icon={project.icon} />
							</span>
							<span className={projectStyles.info}>
								<Text as="span" size="2" weight="bold" className={projectStyles.title}>
									{project.title}
								</Text>
								{project.description && (
									<Text as="span" size="1" color="gray" className={projectStyles.desc}>
										{project.description}
									</Text>
								)}
							</span>
							<span className={projectStyles.arrow}>&rarr;</span>
						</Link>
					</li>
				))}
			</ul>
		</>
	);
}
