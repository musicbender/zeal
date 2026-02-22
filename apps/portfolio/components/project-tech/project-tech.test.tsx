import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectTech } from './project-tech';

describe('ProjectTech', () => {
  it('renders all tech items', () => {
    render(<ProjectTech items={['React', 'TypeScript', 'Node.js']} />);
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('Node.js')).toBeInTheDocument();
  });
});
