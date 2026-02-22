'use client';

import Link from 'next/link';
import type { RichTextNode } from '@repo/utils/common/content';
import { renderRichTextNode } from '@repo/utils/common/content-renderer';
import type { ProjectIcon } from '@repo/utils/common/icon';
import { ProjectIconSvg } from '@repo/ui/project-icon';
import { useGlitchOnLoad } from '@repo/utils/hooks/glitch-effects';
import { StatGroup } from '../../../components/stat-group/stat-group';
import { ProjectTech } from '../../../components/project-tech/project-tech';
import { ProjectTeam } from '../../../components/project-team/project-team';
import { ProjectLinks } from '../../../components/project-links/project-links';
import { NextProject } from '../../../components/next-project/next-project';
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
	project: ProjectData;
	nextProject: NextProjectData | null;
}

export default function ProjectPage({ project, nextProject }: ProjectPageProps) {
	useGlitchOnLoad('[data-glitch-value]');

	return (
		<div className={styles.body}>
			<div className={styles.contentLayer}>
				{/* Back link */}
				<Link href="/" className={styles.backLink}>
					&larr; BACK
				</Link>

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
					<h1 className={styles.projectTitle}>{project.title}</h1>
					{project.description && (
						<div className={styles.projectSubtitle}>{project.description}</div>
					)}

					{/* Body content from Hygraph rich text */}
					{project.body?.raw?.children && (
						<div className={styles.section}>
							<div className={styles.sectionTitle}>&mdash;</div>
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
							<div className={styles.sectionTitle}>Technology</div>
							<ProjectTech items={project.techList} />
						</div>
					)}

					{/* Team */}
					{project.team.length > 0 && (
						<div className={styles.section}>
							<div className={styles.sectionTitle}>Team</div>
							<ProjectTeam members={project.team} />
						</div>
					)}

					{/* Links */}
					{(project.externalUrl || project.githubRepoUrl) && (
						<div className={styles.section}>
							<div className={styles.sectionTitle}>Links</div>
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
