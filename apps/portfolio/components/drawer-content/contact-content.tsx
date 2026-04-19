'use client';

import { Heading, Text } from '@radix-ui/themes';
import type { HygraphSection } from '@repo/remote-data';
import { renderRichTextNode } from '@repo/utils/common/content-renderer';
import { useGlitchOnLoad } from '@repo/utils/hooks/glitch-effects';
import { useActionState } from 'react';
import { submitContactForm, type ContactFormState } from '../../app/actions/contact';
import styles from '../drawer-shell/drawer-shell.module.css';
import contactStyles from './contact-content.module.css';

interface ContactContentProps {
	section: HygraphSection | null;
}

const initialState: ContactFormState = { success: false, error: null };

export function ContactContent({ section }: ContactContentProps) {
	useGlitchOnLoad('[data-drawer-glitch]');
	const [state, formAction, isPending] = useActionState(submitContactForm, initialState);

	const heading = section?.heading?.replace(/_/g, ' ') ?? 'contact me';

	return (
		<>
			<Heading as="h2" className={styles.heading}>
				<span data-drawer-glitch>{heading}</span>
			</Heading>
			<Text as="p" className={styles.subtext}>
				/// get in touch
			</Text>

			{section?.body?.raw?.children && (
				<div className={styles.section}>
					<div className={styles.sectionBody}>
						{section.body.raw.children.map((node, i) => renderRichTextNode(node, i))}
					</div>
				</div>
			)}

			{state.success ? (
				<div className={contactStyles.success}>
					<Text as="p" size="2" color="gray">
						Message sent. I&apos;ll get back to you soon.
					</Text>
				</div>
			) : (
				<form action={formAction} className={contactStyles.form}>
					<div className={contactStyles.field}>
						<label htmlFor="contact-name" className={contactStyles.label}>
							name
						</label>
						<input
							id="contact-name"
							name="name"
							type="text"
							required
							autoComplete="name"
							className={contactStyles.input}
						/>
					</div>

					<div className={contactStyles.field}>
						<label htmlFor="contact-email" className={contactStyles.label}>
							email
						</label>
						<input
							id="contact-email"
							name="email"
							type="email"
							required
							autoComplete="email"
							className={contactStyles.input}
						/>
					</div>

					<div className={contactStyles.field}>
						<label htmlFor="contact-message" className={contactStyles.label}>
							message
						</label>
						<textarea
							id="contact-message"
							name="message"
							required
							rows={5}
							className={contactStyles.textarea}
						/>
					</div>

					{state.error && (
						<Text as="p" size="1" className={contactStyles.error}>
							{state.error}
						</Text>
					)}

					<button type="submit" disabled={isPending} className={contactStyles.submit}>
						{isPending ? 'sending...' : '[submit]'}
					</button>
				</form>
			)}
		</>
	);
}
