import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectIconSvg } from './project-icon';

const mockIcon = {
  rects: [
    { x: 2, y: 3, w: 4, h: 5, fill: '#6a6a68' },
    { x: 6, y: 7, w: 2, h: 3, fill: '#8a8a88' },
  ],
};

describe('ProjectIconSvg', () => {
  it('renders an svg with the correct viewBox', () => {
    const { container } = render(<ProjectIconSvg icon={mockIcon} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 16 16');
  });

  it('renders a rect for each entry in icon.rects', () => {
    const { container } = render(<ProjectIconSvg icon={mockIcon} />);
    const rects = container.querySelectorAll('rect');
    expect(rects).toHaveLength(2);
    expect(rects[0]).toHaveAttribute('x', '2');
    expect(rects[0]).toHaveAttribute('fill', '#6a6a68');
    expect(rects[1]).toHaveAttribute('x', '6');
  });
});
