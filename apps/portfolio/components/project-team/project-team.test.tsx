import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectTeam } from './project-team';

describe('ProjectTeam', () => {
  it('renders all team members', () => {
    render(<ProjectTeam members={['Alice', 'Bob']} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });
});
