// ESLint flat config for the Next.js web app.
import js from '@eslint/js'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['.next/**', 'out/**', 'coverage/**', 'node_modules/**', 'next-env.d.ts'] },
  js.configs.recommended,
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The web app may only reach the domain through the public package entry points.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@agent-blueprint/*/src/*', '**/packages/*/src/*'],
              message:
                'Import from the package root (e.g. @agent-blueprint/core), not its src/ internals.',
            },
          ],
        },
      ],
    },
  },
  prettier,
)
