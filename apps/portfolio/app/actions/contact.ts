'use server';

import { initLogger } from '@repo/logger/server';

const log = initLogger('contact-form');

export interface ContactFormState {
	success: boolean;
	error: string | null;
}

function sanitize(input: string): string {
	return input.trim().replace(/[<>]/g, '').slice(0, 5000);
}

function isValidEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function submitContactForm(
	_prev: ContactFormState,
	formData: FormData
): Promise<ContactFormState> {
	const name = sanitize(String(formData.get('name') ?? ''));
	const email = sanitize(String(formData.get('email') ?? ''));
	const message = sanitize(String(formData.get('message') ?? ''));

	if (!name || name.length < 2) {
		return { success: false, error: 'Please enter your name.' };
	}

	if (!email || !isValidEmail(email)) {
		return { success: false, error: 'Please enter a valid email address.' };
	}

	if (!message || message.length < 10) {
		return { success: false, error: 'Message must be at least 10 characters.' };
	}

	try {
		// TODO: Wire up email delivery (e.g. Resend, SendGrid, or mailto API)
		// For now, log the submission on the server
		log.info({ name, email, message: message.slice(0, 100) }, 'Contact form submitted');

		return { success: true, error: null };
	} catch {
		return { success: false, error: 'Something went wrong. Please try again.' };
	}
}
