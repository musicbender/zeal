'use client';

import { Heading, Text } from '@radix-ui/themes';
import type { HygraphSection } from '@repo/remote-data';
import { renderRichTextNode } from '@repo/utils/common/content-renderer';
import { useGlitchOnLoad } from '@repo/utils/hooks/glitch-effects';
import styles from '../drawer-shell/drawer-shell.module.css';

interface AboutContentProps {
	section: HygraphSection | null;
}

export function DrawerContent({ section }: AboutContentProps) {
	useGlitchOnLoad('[data-drawer-glitch]');

	const heading = section?.heading?.replace(/_/g, ' ') ?? 'about me';

	return (
		<>
			<Heading as="h2" className={styles.heading}>
				<span data-drawer-glitch>{heading}</span>
			</Heading>
			<Text as="p" className={styles.subtext}>
				/// who i am
			</Text>

			{section?.body?.raw?.children && (
				<div className={styles.section}>
					<div className={styles.sectionBody}>
						{section.body.raw.children.map((node, i) => renderRichTextNode(node, i))}
					</div>
				</div>
			)}
		</>
	);
}
