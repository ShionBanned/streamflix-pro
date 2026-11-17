import { createRequire } from 'node:module';

const require = createRequire(new URL('./frontend/package.json', import.meta.url));
const js = require('@eslint/js');
const reactHooks = require('eslint-plugin-react-hooks');
const globals = require('globals');

export default [
  { ignores: ['frontend/dist/**', 'frontend/node_modules/**', 'backend/node_modules/**', 'backend/.local/**'] },
  {
    files: ['frontend/src/**/*.{js,jsx}', 'shared/**/*.mjs', 'backend/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'react-hooks/rules-of-hooks': 'error',
    },
  },
];
