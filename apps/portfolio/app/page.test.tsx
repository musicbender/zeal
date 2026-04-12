import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from './home-page';

const mockSkills = [
	{ label: 'React', strength: 10 },
	{ label: 'TypeScript', strength: 8 },
];

describe('Home', () => {
	it('renders the heading', () => {
		render(<HomePage skills={mockSkills} />);
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Pat Jacobs');
	});

	it('renders navigation items', () => {
		render(<HomePage skills={mockSkills} />);
		expect(screen.getByText('about')).toBeDefined();
		expect(screen.getByText('projects')).toBeDefined();
		expect(screen.getByText('skills')).toBeDefined();
		expect(screen.getByText('contact')).toBeDefined();
	});
});
