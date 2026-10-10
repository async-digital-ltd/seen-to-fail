# Seen to Fail

[![CI](https://github.com/async-digital-ltd/seen-to-fail/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/async-digital-ltd/seen-to-fail/actions/workflows/ci.yml)

A small web app that records whether your automated checks have ever been seen
to catch the defect they exist for.

This repository's own record is published at
[seen-to-fail.async-digital.com](https://seen-to-fail.async-digital.com/).

Lint rules, pre-commit hooks, CI gates and review bots are easy to add and hard
to trust. A check that has never reported anything looks the same whether it
works and has had nothing to catch, or is broken and cannot catch anything. The
only way to tell the two apart is to plant the defect on purpose, watch the
check catch it, and write down what happened. Seen to Fail is that record.

Claude, an AI coding agent, wrote the code under the owner's direction.
[How it is built](docs/how-it-is-built.md) says what the owner decided and how
the work was checked.

![The list of checks in the sample workspace, under a tile counting each of the five statuses, with the filter bar between them.](docs/checks.png)

The sample workspace dates every run and observation from the day it is loaded,
so `pnpm db:seed` gives the same five counts whenever it runs.

## Using it on your own repository

This repository records its own checks. It is not a service you can point at
your pipeline, and the code is not published as a package. There are three ways
you might want to use it. Two work today and one does not.

**Run `canfail` in your repository for the verdict alone.**
[`canfail`](https://pypi.org/project/canfail/) does the replaying. It is a
separate tool and needs nothing from this project, not even git. Write a
`canfail.json` at your root in `canfail`'s own format, naming each check's
command and the breaks to plant, and run it:

```sh
pip install canfail
canfail canfail.json
```

`canfail` runs each check on a clean tree, applies each break, runs the check
again, puts the file back and says whether the check caught the break. That
tells you whether a check catches its defect today. It keeps no record, so it
cannot tell you whether a check has ever caught one or when that proof goes
stale. The rest of this repository adds that record.
[A replay, start to finish](docs/replay.md) describes this repository's own
declaration and the version it pins.

To run it in CI, use
[canfail-action](https://github.com/async-digital-ltd/canfail-action). This
repository published the action for that job and runs its own replay through
it:

```yaml
- uses: async-digital-ltd/canfail-action@5ffd94d2598c9f9ce91aecf1122b9296a38b56e7 # v1.0.0
  with:
    declaration: canfail.json # default
    skip: needsXcode # optional: drop checks this runner cannot run
```

The action installs `canfail` and the two packages its verdicts rest on, each by
version and hash. It sets `NO_COLOR` and refuses a tree that is dirty before
planting. It fails in three cases: a check that could not run, which it never
reports as a verdict; a tree that does not come back; and a verdict that differs
from the declaration. The declaration expects `catches` unless a break sets
`expectedVerdict`. The verdicts go to the job summary and to a JSON report
output. The action's
[README](https://github.com/async-digital-ltd/canfail-action#readme) lists its
inputs and what each way of failing means. Pin it by SHA, as above.

**Copy this repository for the ledger and the weekly replay.** The replay runs
`canfail` over the checkout it runs in and reads `dependsOn` against that
checkout's history. The published page links every commit into the repository
it was built from. So the checks, the code they check and the ledger must all
live in one repository, and a fork of this one records nothing about yours
unless your code moves in with it. The copy brings the whole stack, so CI needs
Node, pnpm and a PostgreSQL service. The layout under `packages/` has to stay as
it is, because the scripts find `ledger/` from where they sit. Starting from a
copy:

1. Replace the files in `ledger/checks/` with one per check of yours, and empty
   `ledger/runs/` and `ledger/observations/`, which hold this repository's own
   record. `ledger/README.md` gives the shape of each file.
2. Replace `canfail.json` with your declaration, and add `checkId` and
   `dependsOn` beside each check.
3. In `.github/workflows/ci.yml`, keep the steps that create the databases and
   that validate, build and check the ledger. Replace the other checks, which
   are this repository's own. Drop the `ci-control/` branch trigger unless you
   will plant defects by hand that way. Delete the Pages upload step and the
   publish job unless the ledger should be public, and read
   [What belongs on a public ledger](#what-belongs-on-a-public-ledger) before
   you decide.
4. Keep `.github/workflows/replay.yml` and `.github/workflows/record-run.yml`
   as they are. Neither names a check of this repository's.
5. Rewrite or remove this README and `docs/`. `packages/server/src/readme/`
   holds their counts to the tree, so `pnpm test` fails once your ledger
   differs. The published page also carries a "Made by" link to this project's
   studio, in `packages/server/src/ledger/page.ts`. The sample workspace that
   `pnpm db:seed` loads is invented data for the local app and never touches the
   ledger, so it can stay.

**Recording another repository's checks from this one is not supported.**
Nothing here checks out a second repository. A run typed in by hand names no
commit, so nothing stops it describing a check that lives elsewhere, and nothing
ties it to that repository either. No ticket adds this.
[#180](https://github.com/async-digital-ltd/seen-to-fail/issues/180) is about
each repository running a ledger of its own without copying this one, and is not
built. [#236](https://github.com/async-digital-ltd/seen-to-fail/issues/236)
replays defects that must be committed to a branch of this repository, and
reaches no other.

## Run it locally

You need pnpm, PostgreSQL 16, and Node 24 or newer, the version `.nvmrc` names.

```sh
pnpm install
cp .env.example .env
```

`.env` holds `DATABASE_URL` and `TEST_DATABASE_URL`. The server reads both
through one config module and stops, naming the variable, if either is missing.
It also stops, naming both, if they name the same database, because the tests
empty the test database between tests and `pnpm db:test:reset` drops it.

### The database

Any PostgreSQL 16 reachable at those two URLs will do. Two routes follow. Pick
one, because the two would compete for port 5432.

**Homebrew, the route this project is developed on.** `pnpm db:up` starts
`postgresql@16` as a service and creates the two databases named in `.env` if
they do not exist yet. `pnpm db:down` stops it. A server started this way has no
`seen_to_fail` role and no password, so the URLs in `.env.example` will not
reach it. It does let in the user you are logged in as, and a URL with no user
connects as that user, so take the user and password out of both URLs:

```sh
DATABASE_URL=postgresql://localhost:5432/seen_to_fail_dev
TEST_DATABASE_URL=postgresql://localhost:5432/seen_to_fail_test
```

**Docker, provided but unproven.** `docker compose up -d` starts the compose
file's PostgreSQL 16 with both databases and the credentials `.env.example`
already carries, which makes it the easier route on most machines. Nobody has
run it here, because the development machine has no Docker installed. Treat it
as unverified until someone reports otherwise.

Either way, apply the migrations:

```sh
pnpm db:migrate
```

Migrations are numbered plain SQL files in `packages/server/migrations`. The
runner applies them in filename order and records each one in a
`schema_migrations` table, so a second `pnpm db:migrate` applies nothing and
says so. `pnpm db:reset` drops the development database, creates it again empty
and reapplies every migration. It leaves the test database alone.
`pnpm db:test:reset` does the same to the test database and nothing else. Run it
when you edit a migration that is already applied, to get the edit into the
database the tests use.

Read `packages/server/migrations/README.md` before writing a migration. It
describes a trap this schema has fallen into twice. A check constraint passes on
null, so it is vacuous for exactly the rows it exists to refuse. The same file
says when to run `pnpm db:test:reset`.

```sh
pnpm db:seed
```

Loads the sample workspace of eight checks in the screenshot above, so you can
see all five statuses working before any real record exists. Every check, run,
observation and note in it is invented for this project and describes no real
team's tooling. It empties the four tables before it inserts, so a second run
replaces the workspace instead of failing. It only ever points at the
development database.

### The server

```sh
pnpm dev:server
```

Serves GraphiQL at `http://127.0.0.1:4000/graphql`, where you can read and run
the schema and its queries. A liveness route at `/health` answers whenever the
process is up. A readiness route at `/ready` answers only once the database
does.

### The client

```sh
pnpm dev:web
```

Serves the app at `http://localhost:5173` and proxies `/graphql` to the server,
so the server must be running too. `pnpm build:web` writes the production bundle
to `packages/web/dist`.

The home page lists the checks under their status tiles, and a tile narrows the
list to its status. The filter bar between them builds a filter one condition at
a time. Each check has its own page, where you record an arming observation. You
log runs through one form and add a check through another.

## What belongs on a public ledger

A ledger maps where a project's checks have and have not been seen to work. For
a check about quality, such as a type check, a lint or a build step, that map is
harmless. For a check about security, such as a secret scanner, an access
control test or a leak gate, a status of Unproven or Broken on a public page
tells an attacker where to look. So a public ledger is for checks about quality,
and a ledger of checks about security stays private.

A private repository does not make a private ledger. On the Free, Pro and Team
plans a GitHub Pages site is public whatever the repository's visibility.
Publishing one privately needs GitHub Enterprise Cloud
([GitHub's documentation](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site)).
If you copy this pattern for checks about security, run `pnpm ledger:build` and
read `dist/ledger` where only the people who should see it can. Do not hand it
to Pages.

This ledger is safe to publish because every check it declares is about
quality. All eleven checks in `ledger/checks/` have an `area` of Code, Build or
Published record. Between them they catch a type error, a lint or formatting
breach, a failing test, stale generated types, a workflow read differently from
how it was written, a client that does not bundle, a server that does not start,
and a published record that is malformed or disagrees with what it was built
from. None of them guards a secret, an access rule or a leak.

This project keeps no private ledger either. The repository has GitHub secret
scanning and push protection switched on. Both are checks about security, so
neither is on this ledger, and no record says whether either has been seen to
catch anything. The page says so under its headline, so nobody reads its count
as every check the project has
([#240](https://github.com/async-digital-ltd/seen-to-fail/issues/240)).

The breaks themselves are safe to publish. Every declared break in
`canfail.json` is an edit to this project's own source, applied on a
GitHub-hosted runner that is thrown away when the job ends. Declaring a new one
takes a merge to `main`. Running one against this repository, by dispatching the
replay workflow or pushing to a `ci-control/` branch, takes write access to it.

## More documentation

- [How it works](docs/how-it-works.md): the two logs behind each check, the
  five statuses and the order they are read in.
- [Filters](docs/filters.md): the filter language, its link format, and how a
  filter reaches SQL.
- [Stack](docs/stack.md): what the app is built with, and what the local server
  will and will not answer.
- [The published ledger](docs/published-ledger.md): how a run reaches the
  public record as a commit, and the route for recording one by hand.
- [A replay, start to finish](docs/replay.md): the weekly job that plants each
  declared defect with `canfail` and records the verdicts.
- [How much of this record is automatic](docs/automatic.md): which checks a
  replay reaches, with the counts.
- [What the build refuses to publish](docs/publishing.md): the build's
  agreement checks, and where the page is served.
- [Tests](docs/tests.md): the commands to check a change, the packages, and
  CI's steps.
- [How it is built](docs/how-it-is-built.md): who wrote the code, what was
  checked and what was not.
- [What shipped, and where it could go](docs/roadmap.md): version 1, version 2,
  and what is still only a direction.

## Licence

MIT, in `LICENSE` at the root of the repository.
