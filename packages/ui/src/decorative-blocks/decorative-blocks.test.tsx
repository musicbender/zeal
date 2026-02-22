import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DecorativeBlocks } from './decorative-blocks';

describe('DecorativeBlocks', () => {
  it('renders 8 blocks by default', () => {
    const { container } = render(<DecorativeBlocks />);
    expect(container.querySelectorAll('.block')).toHaveLength(8);
  });

  it('renders a custom number of blocks', () => {
    const { container } = render(<DecorativeBlocks count={3} />);
    expect(container.querySelectorAll('.block')).toHaveLength(3);
  });
});
