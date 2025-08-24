import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'src/dev.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-empty': 'warn',
      'prefer-const': 'warn',
      'no-case-declarations': 'warn',
    },
  },
);