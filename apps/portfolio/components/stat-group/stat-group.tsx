'use client';

import { Text } from '@radix-ui/themes';
import styles from './stat-group.module.css';

export interface StatItem {
  label: string;
  value: string;
  id?: string;
  realtime?: boolean;
}

interface StatGroupProps {
  stats: StatItem[];
  className?: string;
}

export function StatGroup({ stats, className }: StatGroupProps) {
  return (
    <div className={`${styles.statGroup} ${className ?? ''}`}>
      {stats.map((stat) => (
        <Text
          as="div"
          size="1"
          key={stat.label}
          className={`${styles.statDecoration}${stat.realtime ? ` ${styles.realtime}` : ''}`}
        >
          {stat.label}
          <Text as="span" className={styles.statValue} id={stat.id} data-glitch-value>
            {stat.value}
          </Text>
        </Text>
      ))}
    </div>
  );
}
