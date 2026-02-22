import type { ReactNode } from 'react';

interface TagItemProps {
  children: ReactNode;
  href?: string;
  className?: string;
}

export function TagItem({ children, href, className }: TagItemProps) {
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }

  return <div className={className}>{children}</div>;
}
