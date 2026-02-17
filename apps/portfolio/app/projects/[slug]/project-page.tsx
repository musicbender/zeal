'use client';

import Link from 'next/link';
import type { RichTextNode } from '../../../lib/hygraph';
import type { ProjectIcon } from '../../../lib/projects';
import { useGlitchOnLoad } from '../../../lib/glitch-effects';
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

function renderTextNode(node: RichTextNode, i: number): React.ReactNode {
	if (node.text != null) {
		let content: React.ReactNode = node.text;
		if (node.bold) content = <strong key={i}>{content}</strong>;
		if (node.italic) content = <em key={i}>{content}</em>;
		if (node.underline) content = <u key={i}>{content}</u>;
		return content;
	}
	return null;
}

function renderRichTextNode(node: RichTextNode, i: number): React.ReactNode {
	if (node.type === 'paragraph') {
		const content = node.children?.map((child, j) => renderTextNode(child, j));
		// Skip empty paragraphs
		if (node.children?.length === 1 && node.children[0]?.text === '') return null;
		return (
			<p key={i} className={styles.bodyParagraph}>
				{content}
			</p>
		);
	}

	if (node.type === 'image') {
		return (
			<div key={i} className={styles.bodyImage}>
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={node.src}
					alt={node.altText || ''}
					width={node.width}
					height={node.height}
					loading="lazy"
				/>
			</div>
		);
	}

	if (node.type === 'heading-two') {
		return (
			<h2 key={i} className={styles.bodyHeading}>
				{node.children?.map((child, j) => renderTextNode(child, j))}
			</h2>
		);
	}

	if (node.type === 'heading-three') {
		return (
			<h3 key={i} className={styles.bodyHeading}>
				{node.children?.map((child, j) => renderTextNode(child, j))}
			</h3>
		);
	}

	if (node.type === 'bulleted-list') {
		return (
			<ul key={i} className={styles.bodyList}>
				{node.children?.map((child, j) => renderRichTextNode(child, j))}
			</ul>
		);
	}

	if (node.type === 'numbered-list') {
		return (
			<ol key={i} className={styles.bodyList}>
				{node.children?.map((child, j) => renderRichTextNode(child, j))}
			</ol>
		);
	}

	if (node.type === 'list-item') {
		return (
			<li key={i}>
				{node.children?.map((child, j) => renderRichTextNode(child, j))}
			</li>
		);
	}

	if (node.type === 'list-item-child') {
		return node.children?.map((child, j) => renderTextNode(child, j));
	}

	if (node.type === 'link') {
		return (
			<a key={i} href={node.href} target="_blank" rel="noopener noreferrer">
				{node.children?.map((child, j) => renderTextNode(child, j))}
			</a>
		);
	}

	// Wrapper class nodes (e.g. className: "image")
	if (node.type === 'class' && node.children) {
		return node.children.map((child, j) => renderRichTextNode(child, j));
	}

	return null;
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
