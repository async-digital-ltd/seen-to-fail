/**
 * The filter language: parsing a filter, validating it, and compiling it to a
 * parameterised SQL query.
 *
 * None of that exists yet. The package is created empty on purpose, so the
 * server and the web client can each depend on the filter language without
 * either one depending on the other. The constant below is a placeholder that
 * gives the package something to export and its test something to assert.
 */
export const packageName = '@seen-to-fail/filter';
