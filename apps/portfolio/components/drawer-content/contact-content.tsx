'use client';

import * as Form from '@radix-ui/react-form';
import { Heading, Text } from '@radix-ui/themes';
import type { HygraphSection } from '@repo/remote-data';
import { renderRichTextNode } from '@repo/utils/common/content-renderer';
import { glitchText, useGlitchOnLoad } from '@repo/utils/hooks/glitch-effects';
import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import { submitContactForm, type ContactFormState } from '../../app/actions/contact';
import styles from '../drawer-shell/drawer-shell.module.css';
import contactStyles from './contact-content.module.css';

interface ContactContentProps {
	section: HygraphSection | null;
}

const initialState: ContactFormState = { success: false, errors: {} };

export function ContactContent({ section }: ContactContentProps) {
	useGlitchOnLoad('[data-drawer-glitch]');
	const [state, formAction, isPending] = useActionState(submitContactForm, initialState);
	const [serverErrors, setServerErrors] = useState<ContactFormState['errors']>({});

	// Sync server errors from action state
	if (state.errors !== serverErrors && Object.keys(state.errors).length > 0) {
		setServerErrors(state.errors);
	}

	const clearServerErrors = useCallback(() => {
		setServerErrors({});
	}, []);

	const successRef = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		if (state.success && successRef.current) {
			const el = successRef.current;
			el.dataset.originalText = el.textContent || '';
			glitchText(el, el.dataset.originalText, 4);
		}
	}, [state.success]);

	const heading = section?.heading?.replace(/_/g, ' ') ?? 'contact me';

	return (
		<>
			<Heading as="h2" className={styles.heading}>
				<span data-drawer-glitch>{heading}</span>
			</Heading>
			<Text as="p" className={styles.subtext}>
				{'/// get in touch'}
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
					<Text as="p" size="2" className={contactStyles.successText}>
						<span className={contactStyles.successCheck}>[&#x2713;]</span>
						<span ref={successRef}>Message sent. I&apos;ll get back to you soon.</span>
					</Text>
				</div>
			) : (
				<Form.Root
					action={formAction}
					onClearServerErrors={clearServerErrors}
					className={contactStyles.form}
				>
					<Form.Field
						name="name"
						serverInvalid={!!serverErrors.name}
						className={contactStyles.field}
					>
						<Form.Label className={contactStyles.label}>name</Form.Label>
						<Form.Control
							type="text"
							required
							minLength={2}
							autoComplete="name"
							className={contactStyles.input}
						/>
						<Form.Message match="valueMissing" className={contactStyles.fieldError}>
							Please enter your name.
						</Form.Message>
						<Form.Message match="tooShort" className={contactStyles.fieldError}>
							Name must be at least 2 characters.
						</Form.Message>
						{serverErrors.name && (
							<Form.Message forceMatch className={contactStyles.fieldError}>
								{serverErrors.name}
							</Form.Message>
						)}
					</Form.Field>

					<Form.Field
						name="email"
						serverInvalid={!!serverErrors.email}
						className={contactStyles.field}
					>
						<Form.Label className={contactStyles.label}>email</Form.Label>
						<Form.Control
							type="email"
							required
							autoComplete="email"
							className={contactStyles.input}
						/>
						<Form.Message match="valueMissing" className={contactStyles.fieldError}>
							Please enter your email address.
						</Form.Message>
						<Form.Message match="typeMismatch" className={contactStyles.fieldError}>
							Please enter a valid email address.
						</Form.Message>
						{serverErrors.email && (
							<Form.Message forceMatch className={contactStyles.fieldError}>
								{serverErrors.email}
							</Form.Message>
						)}
					</Form.Field>

					<Form.Field
						name="message"
						serverInvalid={!!serverErrors.message}
						className={contactStyles.field}
					>
						<Form.Label className={contactStyles.label}>message</Form.Label>
						<Form.Control asChild>
							<textarea required minLength={10} rows={5} className={contactStyles.textarea} />
						</Form.Control>
						<Form.Message match="valueMissing" className={contactStyles.fieldError}>
							Please enter a message.
						</Form.Message>
						<Form.Message match="tooShort" className={contactStyles.fieldError}>
							Message must be at least 10 characters.
						</Form.Message>
						{serverErrors.message && (
							<Form.Message forceMatch className={contactStyles.fieldError}>
								{serverErrors.message}
							</Form.Message>
						)}
					</Form.Field>

					{serverErrors.form && (
						<Text as="p" size="1" className={contactStyles.error}>
							{serverErrors.form}
						</Text>
					)}

					<Form.Submit asChild>
						<button type="submit" disabled={isPending} className={contactStyles.submit}>
							{isPending ? 'sending...' : '[submit]'}
						</button>
					</Form.Submit>
				</Form.Root>
			)}
		</>
	);
}
