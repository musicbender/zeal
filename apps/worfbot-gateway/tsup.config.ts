import { defineConfig } from 'tsup';

// server-only is a Next.js RSC guard that always throws at module init. Stub
// it out so tree-shaken server functions from @repo/worfbot-data build cleanly.
const serverOnlyStub = {
	name: 'stub-server-only',
	setup(build: any) {
		build.onResolve({ filter: /^server-only$/ }, () => ({
			path: 'server-only',
			namespace: 'stub',
		}));
		build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
			contents: '',
			loader: 'js',
		}));
	},
};

export default defineConfig({
	entry: ['src/main.ts'],
	format: ['esm'],
	outDir: 'dist',
	clean: true,
	noExternal: [/^@repo\//],
	external: ['pino', 'pino-pretty'],
	esbuildPlugins: [serverOnlyStub],
});
