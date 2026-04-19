import { vercelAdapter } from '@flags-sdk/vercel';
import { flag } from 'flags/next';

export const contactEnabled = flag<boolean>({
	key: 'contact-enabled',
	description: 'For contact section',
	options: [
		{ value: false, label: 'Off' },
		{ value: true, label: 'On' },
	],
	adapter: vercelAdapter(),
});
