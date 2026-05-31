import { execSync } from 'child_process';
import { resolve } from 'path';

const GASPAR_ROOT = resolve(import.meta.dirname, '../../..');
const DB_PATH = resolve(GASPAR_ROOT, 'prisma', 'test.db');

export async function setup() {
	execSync(
		'pnpm exec prisma db push --schema=prisma/schema.test.prisma --force-reset --skip-generate',
		{
			cwd: GASPAR_ROOT,
			env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
			stdio: 'inherit',
		}
	);
}
