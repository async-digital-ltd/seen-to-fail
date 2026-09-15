# Seen to Fail

[![CI](https://github.com/async-digital-ltd/seen-to-fail/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/async-digital-ltd/seen-to-fail/actions/workflows/ci.yml)

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

Requires Node 24, the version in `.nvmrc`, pnpm, and a PostgreSQL 16.

```sh
pnpm install
cp .env.example .env
```

`.env` holds `DATABASE_URL` and `TEST_DATABASE_URL`. The server reads both
through one config module and stops with the name of the variable if either is
missing, so there is nothing to guess at.

### The database

Any PostgreSQL 16 reachable at those two URLs will do. There are two routes
here, and you want one of them, not both, because they would compete for port 5432.

**Homebrew.** `pnpm db:up` starts `postgresql@16` as a service and creates the
two databases named in `.env` if they are not there yet. `pnpm db:down` stops
it. This is the route the project is developed on, and the one these
instructions have been run against.

**Docker.** `docker compose up -d` starts the compose file's PostgreSQL 16 with
both databases. It is here because it is the easier route on most machines, but
it has not been run on the maintainer's machine, which has no Docker installed.
Treat it as unverified until someone reports otherwise.

Either way, apply the migrations:

```sh
pnpm db:migrate
```

Migrations are numbered plain SQL files in `packages/server/migrations`. The
runner applies them in filename order and records each one in a
`schema_migrations` table, so running `pnpm db:migrate` again applies nothing
and says so. `pnpm db:reset` drops the development database, creates it again
empty and reapplies every migration. It leaves the test database alone.

```sh
pnpm db:seed
```

Loads a small sample workspace of eight checks, so there is something to look
at. Every check, run, observation and note in it is invented for this project
and describes no real team's tooling. It empties the four tables before it
inserts, so running it again replaces the workspace rather than failing, and it
only ever points at the development database.

### The server

```sh
pnpm dev:server
```

Serves GraphiQL at `http://localhost:4000/graphql`, where the schema and its
queries can be read and run. There is a liveness route at `/health`, which
answers whenever the process is up, and a readiness route at `/ready`, which
answers only once the database does.

### The checks

```sh
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

The server's resolver types and the client's typed queries are generated from
`packages/server/schema.graphql` and checked in. After changing the schema or a
`.graphql` query in `packages/web`, run `pnpm codegen`. CI runs
`pnpm codegen:check`, which regenerates both and fails when the result differs
from what is committed.

Some tests are backed by the database. They run against `TEST_DATABASE_URL`,
apply the migrations before the first of them, and empty every table between
tests, so they are repeatable without anyone tidying up by hand. They fail if
no database is running, which is the honest answer rather than a quiet skip.

The client renders nothing yet. Every later change has to keep the commands
above passing.

## Plan

1. **Data and API:** schema, sample data, GraphQL queries for checks and test
   runs, and the filter-to-SQL compiler with its tests.
2. **Frontend:** the list of checks, a page for each check, and the form for
   logging a test run.
3. **Polish:** saved and shareable filters, CI, and a screenshot here.

## How it is built

This project is built by AI coding agents. The sample data is invented.
