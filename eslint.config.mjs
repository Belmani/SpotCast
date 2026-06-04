// eslint.config.mjs
// ESM format — questo file è .mjs quindi usa import/export
// indipendentemente dal "type" in package.json
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    // File da analizzare
    files: ['src/**/*.ts'],

    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },

    plugins: {
      '@typescript-eslint': tsPlugin,
    },

    rules: {
      // Base raccomandata TypeScript
      ...tsPlugin.configs['recommended'].rules,

      // `any` è un warning — segnalato ma non bloccante
      '@typescript-eslint/no-explicit-any': 'warn',

      // Variabili non usate sono errori — parametri prefissati con _ sono esclusi
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // Return type esplicito non obbligatorio — TypeScript lo inferisce
      '@typescript-eslint/explicit-function-return-type': 'off',

      // console.log è warning — usare logger invece
      'no-console': 'warn',
    },
  },

  {
    // Percorsi ignorati globalmente
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
];
