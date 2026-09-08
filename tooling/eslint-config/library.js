// ESLint flat config for React-free library packages (core, exporters, ai, templates, fixtures).
// The boundary rule below is what keeps the domain model independent of the UI framework.
import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

/** Packages under packages/* must never import UI frameworks or the web app. */
export const boundaryRule = {
  'no-restricted-imports': [
    'error',
    {
      paths: [
        { name: 'react', message: 'Library packages must stay framework-independent.' },
        { name: 'react-dom', message: 'Library packages must stay framework-independent.' },
        { name: 'next', message: 'Library packages must not depend on Next.js.' },
      ],
      patterns: [
        {
          group: ['react/*', 'react-dom/*', 'next/*'],
          message: 'Library packages must stay framework-independent.',
        },
        { group: ['@/*', '**/apps/**'], message: 'Library packages must not import the web app.' },
      ],
    },
  ],
}

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
    },
    rules: {
      ...boundaryRule,
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/array-type': ['error', { default: 'array' }],
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    // Config files are plain JS outside the TypeScript project: lint them without type info.
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['**/*.test.ts', '**/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  prettier,
)
