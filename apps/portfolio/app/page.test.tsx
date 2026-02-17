import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from './home-page';
import { generateIcon } from '../lib/projects';

const mockProjects = [
	{ slug: 'test-project', name: 'Test Project', icon: generateIcon('test-project') },
	{ slug: 'another-project', name: 'Another Project', icon: generateIcon('another-project') },
];

const mockSkills = [
	{ label: 'React', strength: 10 },
	{ label: 'TypeScript', strength: 8 },
];

describe('Home', () => {
	it('renders the heading', () => {
		render(<HomePage projects={mockProjects} skills={mockSkills} />);
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Pat Jacobs');
	});

	it('renders project links', () => {
		render(<HomePage projects={mockProjects} skills={mockSkills} />);
		expect(screen.getAllByText('Test Project').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Another Project').length).toBeGreaterThan(0);
	});
});
