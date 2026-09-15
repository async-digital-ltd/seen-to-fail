import type { CodegenConfig } from '@graphql-codegen/cli';

/**
 * How the client's typed queries are generated from the schema.
 *
 * Each `.graphql` operation file under `src` becomes a document that carries
 * the type of its own result and variables, so a GraphQL client handed one
 * returns data typed from what the operation selects. The schema is read from
 * the server package's schema.graphql rather than from a running server, so
 * generating needs nothing started and the file both sides are held to is the
 * same file.
 *
 * Every operation is validated against that schema before anything is written.
 * A field the schema does not have fails generation with GraphQL's own error
 * naming it, so it never becomes a type at all, and code reading a field the
 * operation did not select fails the type check.
 *
 * `strictScalars` and the `Date` mapping belong together. Without a mapping the
 * preset types a Date field as `unknown`, and a nullable one loses its null on
 * the way, so a day that might be missing reads the same as one that is always
 * there. Days cross the wire as YYYY-MM-DD text, which is what the server hands
 * out, so text is what they are typed as. With `strictScalars` a scalar added to
 * the schema and not named here fails generation instead.
 *
 * The output is checked in. `pnpm codegen:check` regenerates it and fails when
 * the result differs from what is committed.
 */
const config: CodegenConfig = {
  schema: '../server/schema.graphql',
  documents: ['src/**/*.graphql'],
  generates: {
    'src/graphql/generated/': {
      preset: 'client',
      config: {
        // The package compiles with verbatimModuleSyntax, which refuses a plain
        // import that only carries types.
        useTypeImports: true,
        strictScalars: true,
        scalars: {
          Date: 'string',
          // JSON in the filter language, which the server validates. Nothing
          // here sends one yet, so it stays unknown until an operation that
          // does decides how the client should type it.
          FilterInput: 'unknown',
        },
      },
    },
  },
};

export default config;
