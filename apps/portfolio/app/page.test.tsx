import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from './HomePage';
import { projects } from '../lib/projects';

describe('Home', () => {
	it('renders the heading', () => {
		render(<HomePage projects={projects} />);
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Pat Jacobs');
	});

	it('renders project links', () => {
		render(<HomePage projects={projects} />);
		expect(screen.getAllByText('Neural Canvas').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Temporal DB').length).toBeGreaterThan(0);
	});
});
