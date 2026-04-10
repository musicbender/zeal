import { Text } from '@radix-ui/themes';
import styles from './social-links.module.css';

export interface SocialLink {
  label: string;
  href: string;
  external?: boolean;
}

interface SocialLinksProps {
  links: SocialLink[];
}

export function SocialLinks({ links }: SocialLinksProps) {
  return (
    <div className={styles.contact}>
      {links.map((link) => (
        <Text asChild size="1" key={link.label}>
          <a
            href={link.href}
            className={styles.contactLink}
            {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {link.label}
          </a>
        </Text>
      ))}
    </div>
  );
}
