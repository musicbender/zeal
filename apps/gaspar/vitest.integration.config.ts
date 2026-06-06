import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			src: resolve(__dirname, 'src'),
		},
	},
	test: {
		environment: 'node',
		include: ['src/__integration-tests__/**/*.integration.ts'],
		testTimeout: 30_000,
		// All integration test files share a single SQLite DB — run sequentially to
		// prevent concurrent beforeEach cleanDb calls from wiping another test's data.
		fileParallelism: false,
		globalSetup: ['src/__integration-tests__/sunkeep/globalSetup.ts'],
		env: {
			DATABASE_URL: `file:${resolve(__dirname, 'prisma', 'test.db')}`,
		},
	},
});
