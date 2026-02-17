import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SocialLinks } from './social-links';

const links = [
	{ label: 'EMAIL', href: 'mailto:test@test.com' },
	{ label: 'GITHUB', href: 'https://github.com/test', external: true },
];

afterEach(cleanup);

describe('SocialLinks', () => {
	it('renders all links', () => {
		render(<SocialLinks links={links} />);
		expect(screen.getByText('EMAIL')).toHaveAttribute('href', 'mailto:test@test.com');
		expect(screen.getByText('GITHUB')).toHaveAttribute('href', 'https://github.com/test');
	});

	it('adds target and rel for external links', () => {
		render(<SocialLinks links={links} />);
		const github = screen.getByText('GITHUB');
		expect(github).toHaveAttribute('target', '_blank');
		expect(github).toHaveAttribute('rel', 'noopener noreferrer');
	});

	it('does not add target for non-external links', () => {
		render(<SocialLinks links={links} />);
		expect(screen.getByText('EMAIL')).not.toHaveAttribute('target');
	});
});
