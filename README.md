# Seen to Fail

A small web app for tracking whether your automated checks have ever been seen
to catch the defect they exist for.

Lint rules, pre-commit hooks, CI gates and review bots are easy to add and hard
to trust. A check that has never reported anything looks the same whether it is
working and has had nothing to catch, or is broken and cannot catch anything.
The only way to tell the two apart is to plant the defect on purpose, watch the
check catch it, and write down what happened. Seen to Fail is that record.

**Status: early.** The scaffold is in place and its checks pass. No features
are built yet. This README describes what is being built.

## How it works

Each check has a log of **test runs**. A test run is one planted defect, and
records:

- what was planted,
- what the check was expected to do,
- what it actually did: caught it, or missed it,
- an optional note for the next person.

A check's status comes from its run log, not from anyone's opinion of it:

| Status       | Meaning                                           |
| ------------ | ------------------------------------------------- |
| **Proven**   | It caught a planted defect recently.              |
| **Unproven** | It has never been seen to catch anything.         |
| **Stale**    | It has caught something before, but not recently. |
| **Unarmed**  | There is no evidence it is switched on at all.    |

Each check also records what it protects and how you can tell it is switched
on.

## Filters

The list of checks can be narrowed with filters such as
`(status is Unproven OR status is Stale) AND area is CI`. A filter can be saved,
and shared as a link.

A filter is a typed tree of conditions joined by AND and OR. It is validated
where it enters the API, then compiled into a parameterised SQL query. That
compiler is the core of the project, and it is tested accordingly: every filter
the app can express must compile to the query it means, and every shared link
must parse back into the same filter.

## Stack

- **TypeScript** throughout, in strict mode.
- **GraphQL** API on Node, with frontend types generated from the schema.
- **PostgreSQL**, starting with three tables: checks, test runs and saved
  filters.
- **React** with Vite.
- **Vitest** for tests, and GitHub Actions for type checking and tests.

## How to run

Requires Node 24, the version in `.nvmrc`, and pnpm.

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

The repository is a pnpm workspace with three packages:

- `packages/server`, the GraphQL API,
- `packages/web`, the React client,
- `packages/filter`, the filter language, imported by both sides so that
  neither one depends on the other.

`typecheck` and `test` run inside every package. `lint` and `format:check` run
once over the whole tree from the repository root. `pnpm format` rewrites files
in place instead of reporting on them.

Nothing is implemented yet, so the server does not start and the client renders
nothing. Those five commands are all there is so far, and every later change has
to keep them passing.

## Plan

1. **Data and API:** schema, sample data, GraphQL queries for checks and test
   runs, and the filter-to-SQL compiler with its tests.
2. **Frontend:** the list of checks, a page for each check, and the form for
   logging a test run.
3. **Polish:** saved and shareable filters, CI, and a screenshot here.

## How it is built

This project is built by AI coding agents. The sample data is invented.
