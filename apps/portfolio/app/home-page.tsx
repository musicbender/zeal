'use client';

import Link from 'next/link';
import type { ProjectIcon } from '../lib/projects';
import {
	useClockGlitch,
	useCoffeeGlitch,
	useCursorTrail,
	useGlitchOnLoad,
	useSkillRotation,
} from '../lib/glitch-effects';
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

export default function HomePage({ projects, skills }: HomePageProps) {
	useGlitchOnLoad('[data-glitch-value]');
	useClockGlitch('time-value');
	useCoffeeGlitch('coffee-value');
	useSkillRotation('skill-value', skills);
	useCursorTrail();

	return (
		<div className={styles.body}>
			<div className={styles.contentLayer}>
				{/* Stat group 1 - top left */}
				<div className={`${styles.statGroup} ${styles.group1}`}>
					<div className={styles.statDecoration}>
						YRS
						<span className={styles.statValue} data-glitch-value>
							8
						</span>
					</div>
					<div className={styles.statDecoration}>
						LOC
						<span className={styles.statValue} data-glitch-value>
							SF
						</span>
					</div>
				</div>

				{/* Stat group 2 - top right */}
				<div className={`${styles.statGroup} ${styles.group2}`}>
					<div className={`${styles.statDecoration} ${styles.realtime}`}>
						CLK
						<span className={styles.statValue} id="time-value" data-glitch-value>
							00:00:00
						</span>
					</div>
					<div className={`${styles.statDecoration} ${styles.realtime}`}>
						CFE
						<span className={styles.statValue} id="coffee-value" data-glitch-value>
							4
						</span>
					</div>
				</div>

				{/* Stat group 3 - bottom left (STP, FIX, SKL) */}
				<div className={`${styles.statGroup} ${styles.group3}`}>
					<div className={styles.statDecoration}>
						STP
						<span className={styles.statValue} data-glitch-value>
							42.8K
						</span>
					</div>
					<div className={styles.statDecoration}>
						FIX
						<span className={styles.statValue} data-glitch-value>
							234
						</span>
					</div>
					<div className={styles.statDecoration}>
						SKL
						<span className={styles.statValue} id="skill-value" data-glitch-value>
							React
						</span>
					</div>
				</div>

				{/* Stat group 4 - right center, vertical text (SIL, TAB) */}
				<div className={`${styles.statGroup} ${styles.group4}`}>
					<div className={styles.statDecoration}>
						SIL
						<span className={styles.statValue} data-glitch-value>
							&times;3
						</span>
					</div>
					<div className={styles.statDecoration}>
						TAB
						<span className={styles.statValue} data-glitch-value>
							47
						</span>
					</div>
				</div>

				{/* Main content */}
				<div className={styles.main}>
					<div className={styles.header}>
						<h1 className={styles.name}>Pat Jacobs</h1>
						<div className={styles.title}>Software Engineer</div>
						<div className={styles.blocks}>
							<div className={styles.block} />
							<div className={styles.block} />
							<div className={styles.block} />
							<div className={styles.block} />
							<div className={styles.block} />
							<div className={styles.block} />
							<div className={styles.block} />
							<div className={styles.block} />
						</div>
					</div>

					<div className={styles.projects}>
						<div className={styles.projectsTitle}>&mdash;</div>
						<ul className={styles.projectList}>
							{projects.map((project) => (
								<li key={project.slug}>
									<Link
										href={`/projects/${project.slug}`}
										className={styles.projectItem}
									>
										<div className={styles.projectIcon}>
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
										<span>{project.name}</span>
									</Link>
								</li>
							))}
						</ul>
					</div>
				</div>

				{/* Contact */}
				<div className={styles.contact}>
					<a href="mailto:pat@patjacobs.dev" className={styles.contactLink}>
						EMAIL
					</a>
					<a
						href="https://github.com/musicbender"
						target="_blank"
						rel="noopener noreferrer"
						className={styles.contactLink}
					>
						GITHUB
					</a>
					<a
						href="https://linkedin.com/in/patjacobs"
						target="_blank"
						rel="noopener noreferrer"
						className={styles.contactLink}
					>
						LINKEDIN
					</a>
				</div>
			</div>
		</div>
	);
}
