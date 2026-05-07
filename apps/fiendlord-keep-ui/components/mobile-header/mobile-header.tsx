'use client';

import { useSidebarStore } from '@/lib/sidebar-store';

import styles from './mobile-header.module.css';

export function MobileHeader() {
  const toggle = useSidebarStore((state) => state.toggle);

  return (
    <header className={styles.header}>
      <button onClick={toggle} className={styles.hamburger} aria-label="Open navigation">
        <span />
        <span />
        <span />
      </button>
      <span className={styles.title}>FIENDLORD KEEP</span>
    </header>
  );
}
