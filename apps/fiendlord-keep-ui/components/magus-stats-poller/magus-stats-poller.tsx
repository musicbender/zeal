'use client';

import { MagusStatsGrid } from '@/components/magus-stats-grid/magus-stats-grid';
import type { MagusStats } from '@repo/magus-data';
import { useEffect, useState } from 'react';

interface MagusStatsPollerProps {
  initialStats: MagusStats | null;
}

export function MagusStatsPoller({ initialStats }: MagusStatsPollerProps) {
  const [stats, setStats] = useState<MagusStats | null>(initialStats);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/magus-stats');
        if (res.ok) setStats(await res.json());
      } catch {
        // keep last known stats on error
      }
    };

    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) return null;
  return <MagusStatsGrid stats={stats} />;
}
