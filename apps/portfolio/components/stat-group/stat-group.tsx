'use client';

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
        <div
          key={stat.label}
          className={`${styles.statDecoration}${stat.realtime ? ` ${styles.realtime}` : ''}`}
        >
          {stat.label}
          <span className={styles.statValue} id={stat.id} data-glitch-value>
            {stat.value}
          </span>
        </div>
      ))}
    </div>
  );
}
