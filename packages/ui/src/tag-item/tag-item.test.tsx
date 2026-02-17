import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TagItem } from './tag-item';

describe('TagItem', () => {
  it('renders a div when no href is provided', () => {
    render(<TagItem>React</TagItem>);
    const el = screen.getByText('React');
    expect(el.tagName).toBe('DIV');
  });

  it('renders an anchor when href is provided', () => {
    render(<TagItem href="https://example.com">Link</TagItem>);
    const el = screen.getByText('Link');
    expect(el.tagName).toBe('A');
    expect(el).toHaveAttribute('href', 'https://example.com');
    expect(el).toHaveAttribute('target', '_blank');
    expect(el).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('passes className to the rendered element', () => {
    render(<TagItem className="custom">Styled</TagItem>);
    expect(screen.getByText('Styled')).toHaveClass('custom');
  });
});
