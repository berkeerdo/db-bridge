import { defineConfig, type Options } from 'tsup';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const common: Partial<Options> = {
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  treeshake: true,
  minify: process.env['NODE_ENV'] === 'production',
  external: ['@db-bridge/mysql', '@db-bridge/postgresql', '@db-bridge/redis'],
};

export default defineConfig({
  ...common,
  entry: {
    index: 'src/index.ts',
    'cli/index': 'src/cli/index.ts',
  },
  clean: true,
  onSuccess: async () => {
    // Add shebang to CLI file
    const cliPath = resolve('dist/cli/index.js');
    const content = readFileSync(cliPath, 'utf-8');
    if (!content.startsWith('#!')) {
      writeFileSync(cliPath, '#!/usr/bin/env node\n' + content);
    }
  },
});
