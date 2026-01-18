import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  minify: false,
  splitting: false,
  target: 'es2022',
  external: ['@db-bridge/core', '@db-bridge/mysql', '@db-bridge/postgresql', '@db-bridge/redis'],
});
