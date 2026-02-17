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
        <a
          key={link.label}
          href={link.href}
          className={styles.contactLink}
          {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}
