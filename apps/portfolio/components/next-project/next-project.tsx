import Link from 'next/link';
import type { ProjectIcon } from '@repo/utils/common/icon';
import { ProjectIconSvg } from '@repo/ui/project-icon';
import styles from './next-project.module.css';

interface NextProjectProps {
  slug: string;
  name: string;
  icon: ProjectIcon;
}

export function NextProject({ slug, name, icon }: NextProjectProps) {
  return (
    <div className={styles.nextProject}>
      <Link href={`/projects/${slug}`} className={styles.nextBtn}>
        <span>NEXT PROJECT</span>
        <div className={styles.nextIcon}>
          <ProjectIconSvg icon={icon} />
        </div>
      </Link>
    </div>
  );
}
