import 'server-only';

import { neon } from '@neondatabase/serverless';

function getConnectionString(): string {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new Error('POSTGRES_URL environment variable is not set');
  }
  return url;
}

export const sql = neon(getConnectionString());
