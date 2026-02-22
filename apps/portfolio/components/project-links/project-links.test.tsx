import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectLinks } from './project-links';

afterEach(cleanup);

describe('ProjectLinks', () => {
	it('returns null when no URLs provided', () => {
		const { container } = render(<ProjectLinks />);
		expect(container.innerHTML).toBe('');
	});

	it('renders website link', () => {
		render(<ProjectLinks websiteUrl="https://example.com" />);
		const link = screen.getByText('Website');
		expect(link).toHaveAttribute('href', 'https://example.com');
		expect(link).toHaveAttribute('target', '_blank');
	});

	it('renders github link', () => {
		render(<ProjectLinks githubUrl="https://github.com/test/repo" />);
		const link = screen.getByText('GitHub');
		expect(link).toHaveAttribute('href', 'https://github.com/test/repo');
	});

	it('renders both links when both provided', () => {
		render(
			<ProjectLinks websiteUrl="https://example.com" githubUrl="https://github.com/test" />,
		);
		expect(screen.getByText('Website')).toBeInTheDocument();
		expect(screen.getByText('GitHub')).toBeInTheDocument();
	});
});
