import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: process.env['NODE_ENV'] === 'production',
  external: ['@db-bridge/mysql', '@db-bridge/postgresql', '@db-bridge/redis'],
  onSuccess: async () => {
    // TypeScript declarations are generated successfully
    console.log('Build completed successfully');
  },
});