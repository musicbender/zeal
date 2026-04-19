'use client';

import { Heading, Text } from '@radix-ui/themes';
import { useGlitchOnLoad } from '@repo/utils/hooks/glitch-effects';
import styles from '../drawer-shell/drawer-shell.module.css';
import skillStyles from './skills-content.module.css';

interface SkillsContentProps {
	heading: string;
	skills: string[];
}

export function SkillsContent({ heading, skills }: SkillsContentProps) {
	useGlitchOnLoad('[data-drawer-glitch]');

	// Duplicate skills for seamless marquee looping
	const doubled = [...skills, ...skills];

	return (
		<>
			<Heading as="h2" className={styles.heading}>
				<span data-drawer-glitch>{heading}</span>
			</Heading>
			<Text as="p" className={styles.subtext}>
				{'/// technologies & tools'}
			</Text>

			<div className={skillStyles.marqueeContainer}>
				{/* Row 1: scrolls left */}
				<div className={skillStyles.marqueeTrack}>
					<div className={skillStyles.marqueeScroll} data-direction="left">
						{doubled.map((skill, i) => (
							<span key={`l-${i}`} className={skillStyles.tag}>
								{skill}
							</span>
						))}
					</div>
				</div>

				{/* Row 2: scrolls right */}
				<div className={skillStyles.marqueeTrack}>
					<div className={skillStyles.marqueeScroll} data-direction="right">
						{doubled.map((skill, i) => (
							<span key={`r-${i}`} className={skillStyles.tag}>
								{skill}
							</span>
						))}
					</div>
				</div>

				{/* Row 3: scrolls left, slower */}
				<div className={skillStyles.marqueeTrack}>
					<div className={`${skillStyles.marqueeScroll} ${skillStyles.slow}`} data-direction="left">
						{doubled.map((skill, i) => (
							<span key={`s-${i}`} className={skillStyles.tag}>
								{skill}
							</span>
						))}
					</div>
				</div>
			</div>
		</>
	);
}
