import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NextProject } from './next-project';

const mockIcon = {
  rects: [{ x: 2, y: 3, w: 4, h: 5, fill: '#6a6a68' }],
};

describe('NextProject', () => {
  it('renders a link to the next project', () => {
    render(<NextProject slug="my-project" name="My Project" icon={mockIcon} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/projects/my-project');
    expect(screen.getByText('NEXT PROJECT')).toBeInTheDocument();
  });

  it('renders the project icon svg', () => {
    const { container } = render(
      <NextProject slug="my-project" name="My Project" icon={mockIcon} />,
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelectorAll('rect')).toHaveLength(1);
  });
});
