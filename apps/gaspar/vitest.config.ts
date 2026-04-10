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
		include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
	},
});
