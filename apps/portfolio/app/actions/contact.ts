'use server';

import { Resend } from 'resend';
import { z } from 'zod';

export interface ContactFormState {
	success: boolean;
	errors: {
		name?: string;
		email?: string;
		message?: string;
		form?: string;
	};
}

const contactSchema = z.object({
	name: z.string().trim().min(2, 'Please enter your name.'),
	email: z.string().trim().email('Please enter a valid email address.'),
	message: z.string().trim().min(10, 'Message must be at least 10 characters.'),
});

function sanitize(input: string): string {
	return input.trim().replace(/[<>]/g, '').slice(0, 5000);
}

export async function submitContactForm(
	_prev: ContactFormState,
	formData: FormData
): Promise<ContactFormState> {
	const raw = {
		name: sanitize(String(formData.get('name') ?? '')),
		email: sanitize(String(formData.get('email') ?? '')),
		message: sanitize(String(formData.get('message') ?? '')),
	};

	const result = contactSchema.safeParse(raw);

	if (!result.success) {
		const fieldErrors = result.error.flatten().fieldErrors;
		return {
			success: false,
			errors: {
				name: fieldErrors.name?.[0],
				email: fieldErrors.email?.[0],
				message: fieldErrors.message?.[0],
			},
		};
	}

	const { name, email, message } = result.data;

	try {
		const resend = new Resend(process.env.RESEND_API_KEY);

		await resend.emails.send({
			from: 'Contact Form <onboarding@resend.dev>',
			to: 'pat@patjacobs.com',
			subject: `Portfolio contact from ${name}`,
			replyTo: email,
			text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
		});

		return { success: true, errors: {} };
	} catch {
		return { success: false, errors: { form: 'Something went wrong. Please try again.' } };
	}
}
