module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: ['./tsconfig.eslint.json', './packages/*/tsconfig.eslint.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'prettier', 'import', 'unicorn', 'security'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:@typescript-eslint/strict',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:unicorn/recommended',
    'plugin:security/recommended-legacy',
    'plugin:prettier/recommended',
  ],
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
    },
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts', '.tsx'],
    },
  },
  rules: {
    // TypeScript strict rules
    '@typescript-eslint/explicit-function-return-type': 'off', // Return types are inferred
    '@typescript-eslint/explicit-module-boundary-types': 'off', // Return types are inferred
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    '@typescript-eslint/no-explicit-any': 'off', // any is needed for dynamic database operations
    '@typescript-eslint/no-unsafe-assignment': 'off', // any assignments are sometimes needed
    '@typescript-eslint/no-unsafe-member-access': 'off', // any member access is sometimes needed
    '@typescript-eslint/no-unsafe-call': 'off', // any calls are sometimes needed
    '@typescript-eslint/no-unsafe-return': 'off', // any returns are sometimes needed
    '@typescript-eslint/no-unsafe-argument': 'off', // any arguments are sometimes needed
    '@typescript-eslint/no-redundant-type-constituents': 'off', // unknown unions are valid
    '@typescript-eslint/no-non-null-assertion': 'off', // Non-null assertions are common in this codebase
    '@typescript-eslint/prefer-nullish-coalescing': 'off', // || vs ?? is a style preference
    '@typescript-eslint/prefer-optional-chain': 'error',
    '@typescript-eslint/strict-boolean-expressions': 'off', // Too strict for practical use
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/require-await': 'off', // Async methods without await are common for interface implementations
    '@typescript-eslint/no-unnecessary-condition': 'off', // Too strict for some patterns
    '@typescript-eslint/no-invalid-void-type': 'off', // void unions are useful for callbacks
    '@typescript-eslint/consistent-type-imports': [
      'error',
      {
        prefer: 'type-imports',
        disallowTypeAnnotations: false,
      },
    ],
    '@typescript-eslint/consistent-type-exports': 'error',
    '@typescript-eslint/naming-convention': 'off', // Too strict for branded types and patterns
    '@typescript-eslint/no-extraneous-class': 'off', // Static utility classes are valid
    '@typescript-eslint/restrict-template-expressions': 'off', // Template expressions with unknown types are common
    '@typescript-eslint/no-var-requires': 'off', // Dynamic imports are needed
    '@typescript-eslint/no-useless-constructor': 'off', // Sometimes needed for documentation or future extension

    // Import rules
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', ['parent', 'sibling'], 'index', 'type'],
        'newlines-between': 'always',
        alphabetize: {
          order: 'asc',
          caseInsensitive: true,
        },
      },
    ],
    'import/no-duplicates': 'error',
    'import/no-unresolved': ['error', { ignore: ['^@db-bridge/'] }],
    'import/no-cycle': ['error', { maxDepth: 10 }],
    'import/no-self-import': 'error',
    'import/no-useless-path-segments': 'error',
    'import/first': 'error',
    'import/newline-after-import': 'error',
    'import/no-mutable-exports': 'error',
    'import/export': 'off', // Allow duplicate exports from re-exports (common pattern)
    'import/namespace': 'off', // Allow namespace exports

    // Unicorn rules
    'unicorn/prevent-abbreviations': 'off', // Too aggressive for our codebase
    'unicorn/no-null': 'off', // null is valid in our domain
    'unicorn/filename-case': [
      'error',
      {
        cases: {
          kebabCase: true,
          pascalCase: true,
        },
      },
    ],
    'unicorn/prefer-module': 'off', // We support CommonJS
    'unicorn/prefer-top-level-await': 'off', // Not always applicable
    'unicorn/no-array-reduce': 'off', // reduce is useful
    'unicorn/no-array-for-each': 'off', // forEach is fine
    'unicorn/prefer-spread': 'off', // Array.from is clearer sometimes
    'unicorn/no-useless-undefined': 'off', // Sometimes explicit undefined is needed
    'unicorn/prefer-ternary': 'off', // Readability preference
    'unicorn/prefer-event-target': 'off', // EventEmitter is standard in Node.js
    'unicorn/numeric-separators-style': 'off', // Don't enforce separator style
    'unicorn/prefer-math-trunc': 'off', // | 0 is common pattern
    'unicorn/no-array-push-push': 'off', // Multiple push is sometimes clearer
    'unicorn/no-useless-promise-resolve-reject': 'off', // Promise.resolve is sometimes needed for interface consistency
    'unicorn/no-thenable': 'off', // Classes with then() method are valid for promise-like patterns
    'unicorn/prefer-number-properties': 'off', // isFinite and isNaN are fine
    'unicorn/no-array-callback-reference': 'off', // .map(fn) is fine
    'unicorn/consistent-function-scoping': 'off', // Inner functions are sometimes clearer

    // Security rules
    'security/detect-object-injection': 'off', // Too many false positives
    'security/detect-non-literal-regexp': 'warn',
    'security/detect-unsafe-regex': 'off', // Regex patterns are validated manually

    // Prettier
    'prettier/prettier': 'error',

    // General rules
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'error',
    'no-alert': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'prefer-template': 'error',
    'prefer-arrow-callback': 'error',
    'arrow-body-style': ['error', 'as-needed'],
    'object-shorthand': 'error',
    'no-param-reassign': 'off', // Sometimes needed for default values
    'no-nested-ternary': 'off', // Nested ternaries are acceptable when clear
    'no-unneeded-ternary': 'error',
    'spaced-comment': ['error', 'always', { markers: ['/'] }],
    eqeqeq: ['error', 'always'],
    curly: ['error', 'all'],
    'no-throw-literal': 'error',
    'prefer-promise-reject-errors': 'error',
    'no-return-await': 'off', // Handled by @typescript-eslint/return-await
    '@typescript-eslint/return-await': ['error', 'in-try-catch'],
  },
  overrides: [
    // Test files
    {
      files: ['**/*.test.ts', '**/*.spec.ts', '**/test/**/*.ts', '**/__tests__/**/*.ts'],
      env: {
        jest: true,
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/unbound-method': 'off',
        '@typescript-eslint/no-unused-vars': 'off', // Allow unused vars in tests
        'security/detect-non-literal-fs-filename': 'off',
      },
    },
    // CLI files - allow process.exit and console.log
    {
      files: ['**/cli/**/*.ts'],
      rules: {
        'unicorn/no-process-exit': 'off',
        'no-console': 'off',
        'security/detect-non-literal-fs-filename': 'off',
      },
    },
    // Dialect files with SQL in name (MySQLDialect, PostgreSQLDialect)
    {
      files: ['**/MySQLDialect.ts', '**/PostgreSQLDialect.ts'],
      rules: {
        'unicorn/filename-case': 'off',
      },
    },
  ],
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: [
    'dist',
    'node_modules',
    'coverage',
    '*.js',
    '*.cjs',
    '*.mjs',
    '*.config.ts',
    'benchmarks',
    'examples',
    'tests',
  ],
};
