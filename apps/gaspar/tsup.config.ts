import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/main.ts'],
	format: ['esm'],
	outDir: 'dist',
	clean: true,
	external: ['@prisma/client', 'pino', 'pino-pretty'],
});
