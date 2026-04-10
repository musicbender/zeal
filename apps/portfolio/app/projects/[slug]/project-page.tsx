'use client';

import { Heading, Text } from '@radix-ui/themes';
import { ProjectIconSvg } from '@repo/ui/project-icon';
import type { RichTextNode } from '@repo/utils/common/content';
import { renderRichTextNode } from '@repo/utils/common/content-renderer';
import type { ProjectIcon } from '@repo/utils/common/icon';
import { useGlitchOnLoad } from '@repo/utils/hooks/glitch-effects';
import Link from 'next/link';
import { NextProject } from '../../../components/next-project/next-project';
import { ProjectLinks } from '../../../components/project-links/project-links';
import { ProjectTeam } from '../../../components/project-team/project-team';
import { ProjectTech } from '../../../components/project-tech/project-tech';
import { StatGroup } from '../../../components/stat-group/stat-group';
import styles from './page.module.css';

interface ProjectData {
	projectId: string;
	title: string;
	description: string | null;
	year: string | null;
	techList: string[];
	team: string[];
	externalUrl: string | null;
	githubRepoUrl: string | null;
	icon: ProjectIcon;
	body: { raw: { children: RichTextNode[] } } | null;
}

interface NextProjectData {
	slug: string;
	name: string;
	icon: ProjectIcon;
}

interface ProjectPageProps {
	project?: ProjectData;
	nextProject: NextProjectData | null;
}

export default function ProjectPage({ project, nextProject }: ProjectPageProps) {
	useGlitchOnLoad('[data-glitch-value]');

	if (!project) {
		return;
	}

	return (
		<div className={styles.body}>
			<div className={styles.contentLayer}>
				{/* Back link */}
				<Text asChild size="1" color="gray">
					<Link href="/" className={styles.backLink}>
						&larr; BACK
					</Link>
				</Text>

				{/* Metadata stats */}
				{project.year && (
					<StatGroup
						stats={[{ label: 'YR', value: project.year }]}
						className={styles.metaStats}
					/>
				)}

				{/* Main content */}
				<div className={styles.container}>
					{/* Project icon */}
					<div className={styles.projectIconLarge}>
						<ProjectIconSvg icon={project.icon} />
					</div>

					{/* Title */}
					<Heading as="h1" size="7" weight="bold" className={styles.projectTitle}>
						{project.title}
					</Heading>
					{project.description && (
						<Text as="p" size="1" color="gray" className={styles.projectSubtitle}>
							{project.description}
						</Text>
					)}

					{/* Body content from Hygraph rich text */}
					{project.body?.raw?.children && (
						<div className={styles.section}>
							<Text as="p" size="1" color="gray" className={styles.sectionTitle}>
								&mdash;
							</Text>
							<div className={styles.sectionContent}>
								{project.body.raw.children.map((node, i) =>
									renderRichTextNode(node, i),
								)}
							</div>
						</div>
					)}

					{/* Tech stack */}
					{project.techList.length > 0 && (
						<div className={styles.section}>
							<Text as="p" size="1" color="gray" className={styles.sectionTitle}>
								Technology
							</Text>
							<ProjectTech items={project.techList} />
						</div>
					)}

					{/* Team */}
					{project.team.length > 0 && (
						<div className={styles.section}>
							<Text as="p" size="1" color="gray" className={styles.sectionTitle}>
								Team
							</Text>
							<ProjectTeam members={project.team} />
						</div>
					)}

					{/* Links */}
					{(project.externalUrl || project.githubRepoUrl) && (
						<div className={styles.section}>
							<Text as="p" size="1" color="gray" className={styles.sectionTitle}>
								Links
							</Text>
							<ProjectLinks
								websiteUrl={project.externalUrl}
								githubUrl={project.githubRepoUrl}
							/>
						</div>
					)}
				</div>

				{/* Next project */}
				{nextProject && (
					<NextProject
						slug={nextProject.slug}
						name={nextProject.name}
						icon={nextProject.icon}
					/>
				)}
			</div>
		</div>
	);
}
