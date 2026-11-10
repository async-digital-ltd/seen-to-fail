import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // .claude/ is where agent tooling keeps its own files in a checkout, out of
  // git status by a global gitignore that ESLint does not read (#198).
  { ignores: ['**/dist/**', '**/coverage/**', '.claude/**'] },
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
    // The rules React asks for on the package that renders: hooks called in
    // the same order every render, effects declaring what they read, and the
    // compiler's checks on top.
    files: ['packages/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    // What the markup alone says about a reader with no pointer or no sight: a
    // label on every control, no handler on an element a keyboard cannot
    // reach, no role an element contradicts (#28). The strict set, so a rule
    // the recommended set only warns on still fails the lint. What markup
    // cannot say, such as where focus goes, the axe and keyboard tests hold.
    files: ['packages/web/**/*.tsx'],
    ...jsxA11y.flatConfigs.strict,
  },
  {
    files: ['packages/web/**/*.tsx'],
    rules: {
      // The strict set's own exceptions, and one more: a form may listen for
      // a key. The condition picker closes on Escape pressed in any of its
      // controls, which is a key event bubbling up from an element that has
      // focus, the same as the dialog the recommended set already allows.
      'jsx-a11y/no-noninteractive-element-interactions': [
        'error',
        {
          body: ['onError', 'onLoad'],
          iframe: ['onError', 'onLoad'],
          img: ['onError', 'onLoad'],
          form: ['onKeyDown'],
        },
      ],
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
