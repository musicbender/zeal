'use client';

import Link from 'next/link';
import type { Project } from '../../../lib/projects';
import { useGlitchOnLoad } from '../../../lib/glitch-effects';
import styles from './page.module.css';

interface ProjectPageProps {
	project: Project;
	nextProject: Project;
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
					<div className={styles.statDecoration}>
						YR
						<span className={styles.statValue} data-glitch-value>
							{project.year}
						</span>
					</div>
					<div className={styles.statDecoration}>
						DUR
						<span className={styles.statValue} data-glitch-value>
							{project.duration}
						</span>
					</div>
					<div className={styles.statDecoration}>
						ROL
						<span className={styles.statValue} data-glitch-value>
							{project.role}
						</span>
					</div>
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
					<h1 className={styles.projectTitle}>{project.name}</h1>
					<div className={styles.projectSubtitle}>{project.subtitle}</div>

					{/* Overview */}
					<div className={styles.section}>
						<div className={styles.sectionTitle}>&mdash;</div>
						<div className={styles.sectionContent}>
							{project.overview.map((p, i) => (
								<p key={i}>{p}</p>
							))}
						</div>
					</div>

					{/* Dynamic sections */}
					{project.sections.map((section, i) => (
						<div key={i} className={styles.section}>
							<div className={styles.sectionTitle}>{section.title}</div>
							{section.hasScreenshots && <div className={styles.screenshot} />}
							<div className={styles.sectionContent}>
								{section.content.map((p, j) => (
									<p key={j}>{p}</p>
								))}
							</div>
							{section.hasScreenshots && <div className={styles.screenshot} />}
						</div>
					))}

					{/* Tech stack */}
					<div className={styles.section}>
						<div className={styles.sectionTitle}>Technology</div>
						<div className={styles.techScatter}>
							{project.tech.map((tech) => (
								<div key={tech} className={styles.techItem}>
									{tech}
								</div>
							))}
						</div>
					</div>

					{/* Team */}
					<div className={styles.section}>
						<div className={styles.sectionTitle}>Team</div>
						<div className={styles.teamGrid}>
							{project.team.map((member) => (
								<div key={member.name} className={styles.teamMember}>
									<span>{member.name}</span>
									<span className={styles.teamRole}>{member.role}</span>
								</div>
							))}
						</div>
					</div>
				</div>

				{/* Next project */}
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
			</div>
		</div>
	);
}
