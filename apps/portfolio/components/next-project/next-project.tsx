import { Text } from '@radix-ui/themes';
import { ProjectIconSvg } from '@repo/ui/project-icon';
import type { ProjectIcon } from '@repo/utils/common/icon';
import Link from 'next/link';
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
        <Text as="span" size="1">NEXT PROJECT</Text>
        <div className={styles.nextIcon}>
          <ProjectIconSvg icon={icon} />
        </div>
      </Link>
    </div>
  );
}
