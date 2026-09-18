# Seen to Fail

[![CI](https://github.com/async-digital-ltd/seen-to-fail/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/async-digital-ltd/seen-to-fail/actions/workflows/ci.yml)

A small web app for tracking whether your automated checks have ever been seen
to catch the defect they exist for.

Lint rules, pre-commit hooks, CI gates and review bots are easy to add and hard
to trust. A check that has never reported anything looks the same whether it is
working and has had nothing to catch, or is broken and cannot catch anything.
The only way to tell the two apart is to plant the defect on purpose, watch the
check catch it, and write down what happened. Seen to Fail is that record.

![The list of checks in the sample workspace, under a tile counting each of the five statuses, with the filter bar between them.](docs/checks.png)

Those counts are not a snapshot: the sample workspace dates every run and
observation from the day it is loaded, so `pnpm db:seed` reaches the same five
counts whenever it is run.

## How it works

Each check has a log of **test runs**. A test run is one planted defect, and
records:

- what was planted,
- what the check was expected to do,
- what it actually did: caught it, or missed it,
- an optional note for the next person.

It also has a log of **arming observations**: dated evidence that the check was,
or was not, switched on at all. A check can be configured and not running, and a
log of planted defects alone cannot tell that apart from a check nobody has got
round to planting anything for, so the two are recorded separately.

A check's status comes from those two logs, not from anyone's opinion of it.
There are five, and they are read in order: the first rule that matches is the
status.

| Status       | The rule                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **Unarmed**  | There are no runs and nothing says it is on, or the latest observation says it is off and is dated on or after the latest run. |
| **Broken**   | The latest run missed the defect that was planted for it.                                                                      |
| **Proven**   | The latest run caught its defect, at most 30 days ago.                                                                         |
| **Stale**    | The latest run caught its defect, but longer ago than that.                                                                    |
| **Unproven** | There are no runs, and the latest observation says it is on.                                                                   |

Because the rules are read in that order, a check that caught a defect and was
then seen switched off reads Unarmed rather than Proven, and a check that caught
and then missed reads Broken rather than Stale. An observation dated the same
day as the latest run counts as the later of the two, because a day is the
finest grain either fact is recorded at and there is nothing to order them by
within one. "Latest" otherwise means by the day it happened, then by the order
it was written down.

Thirty days is the one judgment in the model, and it is one constant,
`STALE_AFTER_DAYS`, in one module. A catch exactly thirty days old still reads
Proven, and one day older reads Stale. Moving that line is changing the constant
and nothing else.

The status is worked out in one place, the `check_summaries` SQL function. It
takes the day it is reading as of and the threshold as parameters and never
reads the clock, so the same rows always give the same answer. That day drives
the staleness arithmetic only: a run or an observation dated after it still
counts, so reading the workspace as of last Tuesday asks how old a catch would
have been then, rather than what the record looked like then.

Each check also records what it protects and how you can tell it is switched on.
Either may be left blank, because a check nobody has written a tell for is
exactly the thing this product exists to make visible.

## Filters

The list of checks can be narrowed with a filter such as
`(status is Unproven OR status is Stale) AND area is Git`, which picks two of
the eight checks in the sample workspace.

A filter is a typed tree of conditions, and the language is closed on purpose:
four fields, a fixed set of operators for each, and exactly two levels of
grouping. The conditions in a group share one joiner and the groups share
another, so there is no precedence to work out.

| Field        | Operators               | Argument                                                  |
| ------------ | ----------------------- | --------------------------------------------------------- |
| `status`     | `is`, `isNot`           | one of `Unarmed`, `Broken`, `Proven`, `Stale`, `Unproven` |
| `area`       | `is`, `isNot`           | text                                                      |
| `lastCaught` | `never`                 | none                                                      |
| `lastCaught` | `before`, `after`       | a whole number of days                                    |
| `runs`       | `moreThan`, `fewerThan` | a whole number of runs                                    |

The filter lives in the page's address, so a refresh, the back button and "Copy
link" all keep it, and a filter is shared by sending that link. The example
above is this one:

```
/?f=and!or*status.is.Unproven*status.is.Stale!and*area.is.Git
```

The grammar spells the language out rather than encoding it. Its alphabet is
exactly the set `encodeURIComponent` leaves untouched, so a link pasted into a
chat window stays legible, every filter has one link rather than several, and
parsing a link gives back the filter it was written from.
`packages/filter/README.md` sets the grammar out in full.

Values are compared exactly as they are written. The sample workspace spells its
areas `CI`, `Git`, `Lint`, `Release` and `Review`, so `area.is.git` matches
nothing.

Changing the filter pushes a history entry rather than replacing one, so back
and forward step through the filters that were built. A change that leaves the
filter as the address already reads it adds no entry, so one press of back
undoes one thing.

`f=all` is accepted on the way in and means the filter that hides nothing. The
app never writes it: the list nobody has narrowed is the bare address `/`.

A filter is validated where it enters the API, by the same reader that reads a
link, and only then compiled into SQL. Every value a filter carries reaches the
database as a bound parameter, so nothing in it is ever concatenated into a
query, and a filter the language cannot express is refused before the resolver
has touched the database.

That compiler is the core of the project, and it is tested accordingly: every
filter the app can express must compile to the query it means, and every shared
link must parse back into the same filter.

## Stack

- **TypeScript** throughout, in strict mode.
- **GraphQL** API on Node, with frontend types generated from the schema.
- **PostgreSQL**, with four tables: checks, test runs, arming observations and
  saved filters. The schema carries `saved_filters` for saving a filter under a
  name, and nothing reads it yet.
- **React** with Vite, React Router and urql.
- **Vitest** for tests, and GitHub Actions for type checking, linting, format
  checking, tests and a build of the client.

The server is built for local use only. There is no per-request cost limit and
no limit on the size of a request body, so it is not hardened for deployment.

The list, the filter bar and the three forms carry keyboard tests. A check's own
page does not, and no dedicated keyboard and screen reader pass has been run
over any of them.

## Run it locally

Requires Node 24 or newer, the version in `.nvmrc`, pnpm, and a PostgreSQL 16.

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

**Homebrew, the route this project is developed on.** `pnpm db:up` starts
`postgresql@16` as a service and creates the two databases named in `.env` if
they are not there yet. `pnpm db:down` stops it. A server started this way has
no `seen_to_fail` role and no password, so the values in `.env.example` will not
reach it as they stand. It does let in the user you are logged in as, and a URL
with no user in it connects as that user, so take the user and password out of
both URLs altogether:

```sh
DATABASE_URL=postgresql://localhost:5432/seen_to_fail_dev
TEST_DATABASE_URL=postgresql://localhost:5432/seen_to_fail_test
```

**Docker, provided but unproven.** `docker compose up -d` starts the compose
file's PostgreSQL 16 with both databases and the credentials `.env.example`
already carries, which makes it the easier route on most machines. It has not
been run here, on a machine with no Docker installed, so treat it as unverified
until someone reports otherwise.

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

Loads the sample workspace of eight checks in the screenshot above, which is
what lets all five statuses be seen working before there is a real record behind
any of them. Every check, run, observation and note in it is invented for this
project and describes no real team's tooling. It empties the four tables before
it inserts, so running it again replaces the workspace rather than failing, and
it only ever points at the development database.

### The server

```sh
pnpm dev:server
```

Serves GraphiQL at `http://localhost:4000/graphql`, where the schema and its
queries can be read and run. There is a liveness route at `/health`, which
answers whenever the process is up, and a readiness route at `/ready`, which
answers only once the database does.

### The client

```sh
pnpm dev:web
```

Serves the app at `http://localhost:5173` and proxies `/graphql` to the server,
so the server has to be running too. `pnpm build:web` writes the production
bundle to `packages/web/dist`.

The home page lists the checks under their status tiles, and a tile narrows the
list to its status. The filter bar between the two builds a filter condition by
condition. Each check has its own page, which is where an arming observation is
recorded. Runs are logged through a form.
A check is added through a form of its own.

## Tests

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

Some tests are backed by the database. They run against `TEST_DATABASE_URL` on
a real PostgreSQL, apply the migrations before the first of them, and empty
every table between tests, so they are repeatable without anyone tidying up by
hand. They fail if no database is running, which is the honest answer rather
than a quiet skip. The status rules above are tested that way, one fixture per
rule, so a rule deleted from the SQL takes at least one test down with it.

CI runs `pnpm codegen:check`, applies the migrations, runs the four commands
above, and finishes with `pnpm build:web`, which is what proves the page reaches
the code: the tests import modules, and only the bundler starts from
`index.html`.

## Licence

MIT, in `LICENSE` at the root of the repository.

## How it is built

The code in this repository was written by Claude, an AI coding agent, under
the owner's direction. The owner set the scope, the status model and the rulings
recorded in the issues, and checked the work, but did not write the TypeScript.
The sample data is invented.

Code written that way is only as trustworthy as the checking behind it, so here
is what was checked, what was not, and where the evidence for each is.

- **Planted defects, watched being denied.** Tests were trusted once the defect
  they exist for had been planted and seen to fail them. On the story that built
  the add-check form, 12 defects were planted and all 12 were caught ([#24](https://github.com/async-digital-ltd/seen-to-fail/issues/24)).
- **The fault none of them could see.** That same branch built only one of the
  two entry points its ticket named. The planted defects, a code review and the
  acceptance check all passed it, because each examined what the branch
  contained and the fault was something missing. It was caught when the README
  screenshot, retaken from the branch and expected to show the new link, came
  back byte-identical to the one before
  ([#24](https://github.com/async-digital-ltd/seen-to-fail/issues/24)).
- **A scanner trusted only after it fired.** The whole history was scanned for
  secrets with gitleaks before the repository was made public, and the clean
  result counted only once the same scan had reported a planted key
  ([#29](https://github.com/async-digital-ltd/seen-to-fail/issues/29)).
- **A walkthrough by hand.** The run instructions above were followed from a
  fresh clone. Every command worked, and one sentence led a Homebrew reader into
  database URLs the server refuses, which CI had no way to notice
  ([#27](https://github.com/async-digital-ltd/seen-to-fail/issues/27),
  [#48](https://github.com/async-digital-ltd/seen-to-fail/pull/48)).
- **A test that depended on the shell.** The error masking tests passed or
  failed with the value of `NODE_ENV`. They were run under each value, seen
  failing under one, and the server was pinned so they no longer depend on it
  ([#39](https://github.com/async-digital-ltd/seen-to-fail/issues/39),
  [#56](https://github.com/async-digital-ltd/seen-to-fail/pull/56)).

Not checked:

- No keyboard and screen reader pass has been run
  ([#28](https://github.com/async-digital-ltd/seen-to-fail/issues/28)).
- Nothing automated exercises the client and the server together. That path
  was walked by hand once, over HTTP, on 16 September 2026
  ([#46](https://github.com/async-digital-ltd/seen-to-fail/issues/46)).

## Where it could go

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/roadmap-dark.svg">
  <img alt="A timeline with two points. A filled circle, version 1, now, manual: every step by hand, where you make a throwaway branch, break the code, run the check, confirm it failed, delete the branch, then record the result in the app. A line joins it to a hollow circle, a future version, automatic: replayed for you, where you write the breaking change once and CI applies it, runs the check, removes it and records the result whenever something the check depends on changes." src="docs/roadmap-light.svg">
</picture>

Nothing past version 1 is decided. This is a direction, not a plan.

**Version 1 is manual, all of it.** Proving one check means making a throwaway
branch, breaking the code in the way that check exists to catch, running the
check, confirming it failed for that reason and not another, deleting the
branch, and then writing down what happened. The app holds the record. Every
step that produces the record is yours.

That is the weakness, and it is the one the app exists to show in checks: a
record made that way goes stale as soon as people stop doing all of it. Thirty
days is only a stand-in for what actually voids a proof, which is a change to
something the check depends on: its workflow, its configuration, the version of
its tool.

**A future version would automate all of that except deciding what to break.**
You write the breaking change once and keep it beside the code, with the list of
things its check depends on. When a change touches any of them, CI applies the
change, runs the check, confirms it failed for that reason, removes it again and
records the result. Nobody opens the app. The work left to a person is the
judgment: what counts as a defect for this check, which is different every time.
You write it in the format of whatever tool replays it, rather than in one this
project invents. What this project adds is the record.

Some checks cannot be broken on purpose this way, a review bot or branch
protection among them. Those stay manual. Thirty days stays too, as a backstop
for changes nobody thought to list, so if the automatic runs stop arriving,
Proven checks still drift to Stale.
