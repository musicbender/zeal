import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environmentMatchGlobs: [['src/__tests__/client.test.ts', 'jsdom']],
		environment: 'node',
	},
});
