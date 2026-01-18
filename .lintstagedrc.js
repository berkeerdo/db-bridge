/**
 * Lint-Staged Configuration
 */

export default {
  'packages/*/src/**/*.{ts,tsx}': ['eslint --fix --max-warnings=0', 'prettier --write'],
  'packages/*/__tests__/**/*.{ts,tsx}': ['eslint --fix --max-warnings=0', 'prettier --write'],
  '*.config.ts': ['prettier --write'],
  '!(packages)/**/*.{ts,tsx}': ['prettier --write'],
  '*.{js,jsx,cjs,mjs}': ['prettier --write'],
  '*.json': ['prettier --write'],
  '*.md': ['prettier --write'],
  '*.{yml,yaml}': ['prettier --write'],
};
