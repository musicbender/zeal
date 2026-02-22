import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatGroup } from './stat-group';

describe('StatGroup', () => {
  it('renders all stat items', () => {
    render(
      <StatGroup
        stats={[
          { label: 'YRS', value: '8' },
          { label: 'LOC', value: 'SF' },
        ]}
      />,
    );
    expect(screen.getByText('YRS')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('LOC')).toBeInTheDocument();
    expect(screen.getByText('SF')).toBeInTheDocument();
  });

  it('sets id and data-glitch-value on stat values', () => {
    render(<StatGroup stats={[{ label: 'CLK', value: '12:00', id: 'clock' }]} />);
    const valueEl = screen.getByText('12:00');
    expect(valueEl).toHaveAttribute('id', 'clock');
    expect(valueEl).toHaveAttribute('data-glitch-value');
  });

  it('applies className prop to the root element', () => {
    const { container } = render(
      <StatGroup stats={[{ label: 'A', value: '1' }]} className="custom-pos" />,
    );
    expect(container.firstElementChild).toHaveClass('custom-pos');
  });
});
