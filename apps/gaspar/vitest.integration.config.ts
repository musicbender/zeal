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
		include: ['src/__integration-tests__/**/*.ts'],
		testTimeout: 30_000,
	},
});
