'use client';

import Link from 'next/link';
import type { RichTextNode } from '@repo/utils/common/content';
import { renderRichTextNode } from '@repo/utils/common/content-renderer';
import type { ProjectIcon } from '@repo/utils/common/icon';
import { useGlitchOnLoad } from '@repo/utils/hooks/glitch-effects';
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
				<div className={styles.metaStats}>
					{project.year && (
						<div className={styles.statDecoration}>
							YR
							<span className={styles.statValue} data-glitch-value>
								{project.year}
							</span>
						</div>
					)}
				</div>

				{/* Main content */}
				<div className={styles.container}>
					{/* Project icon */}
					<div className={styles.projectIconLarge}>
						<svg viewBox="0 0 16 16" fill="none">
							{project.icon.rects.map((r, i) => (
								<rect
									key={i}
									x={r.x}
									y={r.y}
									width={r.w}
									height={r.h}
									fill={r.fill}
								/>
							))}
						</svg>
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
							<div className={styles.techScatter}>
								{project.techList.map((tech) => (
									<div key={tech} className={styles.techItem}>
										{tech}
									</div>
								))}
							</div>
						</div>
					)}

					{/* Team */}
					{project.team.length > 0 && (
						<div className={styles.section}>
							<div className={styles.sectionTitle}>Team</div>
							<div className={styles.teamGrid}>
								{project.team.map((member) => (
									<div key={member} className={styles.teamMember}>
										<span>{member}</span>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Links */}
					{(project.externalUrl || project.githubRepoUrl) && (
						<div className={styles.section}>
							<div className={styles.sectionTitle}>Links</div>
							<div className={styles.techScatter}>
								{project.externalUrl && (
									<a
										href={project.externalUrl}
										target="_blank"
										rel="noopener noreferrer"
										className={styles.techItem}
									>
										Website
									</a>
								)}
								{project.githubRepoUrl && (
									<a
										href={project.githubRepoUrl}
										target="_blank"
										rel="noopener noreferrer"
										className={styles.techItem}
									>
										GitHub
									</a>
								)}
							</div>
						</div>
					)}
				</div>

				{/* Next project */}
				{nextProject && (
					<div className={styles.nextProject}>
						<Link
							href={`/projects/${nextProject.slug}`}
							className={styles.nextBtn}
						>
							<span>NEXT PROJECT</span>
							<div className={styles.nextIcon}>
								<svg viewBox="0 0 16 16" fill="none">
									{nextProject.icon.rects.map((r, i) => (
										<rect
											key={i}
											x={r.x}
											y={r.y}
											width={r.w}
											height={r.h}
											fill={r.fill}
										/>
									))}
								</svg>
							</div>
						</Link>
					</div>
				)}
			</div>
		</div>
	);
}
