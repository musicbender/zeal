import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'node22',
    platform: 'node',
    splitting: false,
    treeshake: true,
  },
  {
    entry: ['src/cli.ts'],
    format: ['cjs'],
    clean: false,
    sourcemap: false,
    target: 'node22',
    platform: 'node',
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
