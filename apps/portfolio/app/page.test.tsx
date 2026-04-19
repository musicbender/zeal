import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from './home-page';

const mockSkills = [
	{ label: 'React', strength: 10 },
	{ label: 'TypeScript', strength: 8 },
];

const mockDrawerData = {
	about: null,
	contact: null,
	skillsSection: null,
	skills: [],
	projects: [],
};

describe('Home', () => {
	it('renders the heading', () => {
		render(<HomePage skills={mockSkills} drawerData={mockDrawerData} />);
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Pat Jacobs');
	});

	it('renders navigation items', () => {
		render(<HomePage skills={mockSkills} drawerData={mockDrawerData} />);
		expect(screen.getByText('about')).toBeDefined();
		expect(screen.getByText('projects')).toBeDefined();
		expect(screen.getByText('skills')).toBeDefined();
		expect(screen.getByText('contact')).toBeDefined();
	});
});
