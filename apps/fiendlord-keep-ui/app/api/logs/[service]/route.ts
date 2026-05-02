import { execSync } from 'child_process';

import type { LogEntry } from '@repo/magus-data';
import { NextResponse } from 'next/server';

import { getServiceByName } from '@/lib/services';

type JournalctlEntry = {
  __REALTIME_TIMESTAMP?: string;
  PRIORITY?: string | number;
  MESSAGE?: string | number[];
};

function priorityToLevel(priority: string | number | undefined): LogEntry['level'] {
  const p = typeof priority === 'string' ? parseInt(priority, 10) : (priority ?? 6);
  if (p <= 3) return 'ERROR';
  if (p === 4) return 'WARN';
  if (p <= 6) return 'INFO';
  return 'DEBUG';
}

function parseMessage(message: string | number[] | undefined): string {
  if (!message) return '';
  if (Array.isArray(message)) {
    return Buffer.from(message).toString('utf8');
  }
  return message;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ service: string }> },
) {
  const { service } = await params;
  const serviceConfig = getServiceByName(service);

  if (!serviceConfig) {
    return NextResponse.json({ error: 'Service not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const rawLimit = parseInt(searchParams.get('limit') ?? '100', 10);
  const limit = Math.min(isNaN(rawLimit) ? 100 : rawLimit, 500);
  const levelFilter = searchParams.get('level')?.toUpperCase() as LogEntry['level'] | null;

  let entries: LogEntry[] = [];

  try {
    const output = execSync(
      `journalctl -u ${serviceConfig.systemdUnit} -n ${limit} --output json --no-pager 2>/dev/null`,
      { encoding: 'utf8' },
    );

    entries = output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const json = JSON.parse(line) as JournalctlEntry;
        const timestampMicros = json.__REALTIME_TIMESTAMP
          ? parseInt(json.__REALTIME_TIMESTAMP, 10)
          : Date.now() * 1000;

        return {
          timestamp: new Date(Math.floor(timestampMicros / 1000)).toISOString(),
          level: priorityToLevel(json.PRIORITY),
          message: parseMessage(json.MESSAGE),
          service: serviceConfig.name,
        } satisfies LogEntry;
      });
  } catch {
    // journalctl unavailable (not on Pi) or service not found — return empty
    entries = [];
  }

  if (levelFilter) {
    entries = entries.filter((e) => e.level === levelFilter);
  }

  return NextResponse.json(entries);
}
