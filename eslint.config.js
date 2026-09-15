import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        // Resolves each file against the nearest tsconfig.json, so every
        // package gets type-aware linting without listing projects here.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // The client preset writes a blanket eslint-disable into every file it
    // generates, including an index that only re-exports and has nothing to
    // disable. Reporting that as unused would print a warning on every lint
    // run over a file nobody is meant to edit.
    files: ['packages/web/src/graphql/generated/**'],
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  // Must come last: it switches off the rules Prettier already decides.
  eslintConfigPrettier,
);
