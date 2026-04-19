'use client';

import { Heading, Text } from '@radix-ui/themes';
import { useGlitchOnLoad } from '@repo/utils/hooks/glitch-effects';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import styles from '../drawer-shell/drawer-shell.module.css';
import projectStyles from './projects-content.module.css';

const GLITCH_COLORS = [
	'var(--color-glitch-red)',
	'var(--color-glitch-teal)',
	'var(--color-glitch-purple)',
	'var(--color-glitch-yellow)',
];

interface Project {
	slug: string;
	title: string;
	subtitle: string | null;
}

interface ProjectsContentProps {
	projects: Project[];
}

function randomGlitchColor(): string {
	return GLITCH_COLORS[Math.floor(Math.random() * GLITCH_COLORS.length)]!;
}

export function ProjectsContent({ projects }: ProjectsContentProps) {
	useGlitchOnLoad('[data-drawer-glitch]');
	const [hoverColors, setHoverColors] = useState<Record<string, string>>({});

	const handleHover = useCallback((slug: string) => {
		setHoverColors((prev) => ({ ...prev, [slug]: randomGlitchColor() }));
	}, []);

	const handleLeave = useCallback((slug: string) => {
		setHoverColors((prev) => {
			const next = { ...prev };
			delete next[slug];
			return next;
		});
	}, []);

	return (
		<>
			<Heading as="h2" className={styles.heading}>
				<span data-drawer-glitch>projects</span>
			</Heading>
			<Text as="p" className={styles.subtext}>
				/// selected work
			</Text>

			<ul className={projectStyles.list}>
				{projects.map((project, i) => {
					const color = hoverColors[project.slug];
					return (
						<li key={project.slug}>
							<Link
								href={`/projects/${project.slug}`}
								className={projectStyles.item}
								onMouseEnter={() => handleHover(project.slug)}
								onMouseLeave={() => handleLeave(project.slug)}
							>
								<span className={projectStyles.index} style={color ? { color } : undefined}>
									{String(i + 1).padStart(2, '0')}_
								</span>
								<span className={projectStyles.info}>
									<Text
										as="span"
										size="2"
										weight="bold"
										className={projectStyles.title}
										style={color ? { color } : undefined}
									>
										{project.title}
									</Text>
									{project.subtitle && (
										<Text as="span" size="1" color="gray" className={projectStyles.subtitle}>
											{project.subtitle}
										</Text>
									)}
								</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</>
	);
}
