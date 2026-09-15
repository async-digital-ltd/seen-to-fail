import type { CodegenConfig } from '@graphql-codegen/cli';

/**
 * How the resolver types are generated from the schema.
 *
 * The point of generating them is that an unimplemented or mistyped resolver is
 * a type error rather than a field that returns null in production. Two
 * settings are what make that true, and neither is a default:
 *
 * `avoidOptionals.resolvers` drops the `?` from every resolver field, so the
 * resolver map has to name every field in the schema. Without it a missing
 * resolver type-checks, and whether the field works is then a question about
 * whether the parent row happens to carry a property of that name.
 *
 * `mappers` says what a resolver is handed as its parent. The rows the database
 * returns are the parents here, not the schema's own output types, so a field
 * whose row does not carry it has to be resolved deliberately rather than by
 * luck. `strictScalars` closes the last gap: a scalar with no TypeScript type
 * named for it fails generation instead of quietly becoming `any`.
 *
 * Paths in `mappers` and `contextType` are resolved from the generated file, so
 * they are written relative to it. They carry the `.ts` extension the rest of
 * this package imports with.
 */
const config: CodegenConfig = {
  schema: 'schema.graphql',
  generates: {
    'src/graphql/generated/resolvers.ts': {
      plugins: [
        {
          add: {
            content: [
              '/* eslint-disable */',
              '// Generated from schema.graphql. Do not edit by hand.',
              '//',
              '// Checked in so that the types the resolvers are held to can be read',
              '// here without running a generator first, and so that a change to the',
              '// schema shows up in a diff. `pnpm codegen:check` regenerates this file',
              '// and fails when the result differs from what is committed, which is what',
              '// stops the schema and these types drifting apart.',
            ].join('\n'),
          },
        },
        'typescript',
        'typescript-resolvers',
      ],
      config: {
        avoidOptionals: { resolvers: true },
        // The package compiles with verbatimModuleSyntax, which refuses a plain
        // import that only carries types.
        useTypeImports: true,
        // A TypeScript enum is not erasable syntax, and this package compiles
        // with erasableSyntaxOnly so that Node can run the sources directly.
        enumsAsTypes: true,
        strictScalars: true,
        scalars: {
          Date: '../../database/rows.ts#IsoDate',
        },
        contextType: '../context.ts#RequestContext',
        // Two of these are named the same as the schema types they stand in
        // for, so they are imported under another name. Without the rename the
        // generated file declares and imports one identifier, and the
        // declaration wins: the mapper is silently ignored and the resolvers
        // are typed against the schema's own output type rather than the row
        // the database returns.
        mappers: {
          Check: '../../database/checks.ts#CheckRecord',
          TestRun: '../../database/rows.ts#TestRun as TestRunRow',
          ArmingObservation:
            '../../database/rows.ts#ArmingObservation as ArmingObservationRow',
        },
      },
    },
  },
};

export default config;
