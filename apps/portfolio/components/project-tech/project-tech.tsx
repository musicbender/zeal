import { TagItem } from '@repo/ui/tag-item';
import styles from './project-tech.module.css';

interface ProjectTechProps {
  items: string[];
}

export function ProjectTech({ items }: ProjectTechProps) {
  return (
    <div className={styles.techScatter}>
      {items.map((tech) => (
        <TagItem key={tech} className={styles.techItem}>
          {tech}
        </TagItem>
      ))}
    </div>
  );
}
