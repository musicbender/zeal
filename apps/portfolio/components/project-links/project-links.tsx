import { TagItem } from '@repo/ui/tag-item';
import styles from './project-links.module.css';

interface ProjectLinksProps {
  websiteUrl?: string | null;
  githubUrl?: string | null;
}

export function ProjectLinks({ websiteUrl, githubUrl }: ProjectLinksProps) {
  if (!websiteUrl && !githubUrl) return null;

  return (
    <div className={styles.techScatter}>
      {websiteUrl && (
        <TagItem href={websiteUrl} className={styles.techItem}>
          Website
        </TagItem>
      )}
      {githubUrl && (
        <TagItem href={githubUrl} className={styles.techItem}>
          GitHub
        </TagItem>
      )}
    </div>
  );
}
