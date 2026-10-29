# Working from a cloud session

A Claude Code session in the cloud starts in a container that differs from the
development machine in four ways. Each of these has cost a session time more
than once.

## It cannot push a workflow

The session's GitHub credential has no `workflow` scope. A push of any commit
that changes a file under `.github/workflows/` is refused ("refusing to allow an
OAuth App to create or update workflow ... without `workflow` scope"), and the
GitHub tools refuse the same change ("Insufficient scope"). Files elsewhere in
`.github/`, such as `.github/dependabot.yml`, push normally.

So plan for it before choosing an approach:

- Put new logic in `scripts/` or the packages, where a step CI already runs
  will pick it up, rather than in a new workflow step.
- When a workflow change cannot be avoided, keep it out of every pushed commit
  from the start, and paste the diff into the PR body for someone with the scope
  to apply. Say at the top of the PR that it must not merge until the diff is
  applied, and that a green check does not mean the new step ran.
- A defect planted in a workflow file cannot be pushed to a `ci-control/`
  branch either, so that proof needs a human too.

If a push has already been refused, take the workflow change out of the last
commit, leaving it in the working tree for the PR body, and push the rest:

```sh
git reset --soft HEAD~1
git restore --staged .github/workflows
git commit -C ORIG_HEAD
git diff .github/workflows
```

## Node 24

The container ships Node 22, and this repository needs 24 or newer. Install it
with the container's nvm, then install the dependencies in the same shell:

```sh
export NVM_DIR=/opt/nvm
. /opt/nvm/nvm.sh
nvm install 24
pnpm install --frozen-lockfile
```

The first `nvm install` has been seen to exit with status 3 and no output. Run
it again. The `pnpm` already on the path works once Node 24 is active.

## PostgreSQL 16

PostgreSQL 16 is installed but stopped. Docker has no daemon running, so
`docker compose` does not work, and `pnpm db:up` needs Homebrew, so it fails.
Start the installed server and give it the role `.env.example` expects:

```sh
service postgresql start
su postgres -c "psql -c \"CREATE ROLE seen_to_fail LOGIN SUPERUSER PASSWORD 'seen_to_fail'\""
```

Copy `.env.example` to `.env` as the README says, then create the two
databases and apply the migrations:

```sh
node packages/server/src/scripts/create-databases.ts
pnpm db:migrate
```

The server can stop on its own between turns. The server tests then show as
skipped, with ECONNREFUSED. Run `service postgresql start` again.

Without a database at all, the server's tests fail to load the files that need
one, with `MissingEnvironmentVariableError`. That means no database, not a
regression. The documentation tests need no database:

```sh
cd packages/server
npx vitest run readme
```

## A shallow clone

The container's clone holds only recent commits. `pnpm ledger:build` refuses a
shallow clone, and `git log -S` finds nothing older than the clone. Fetch the
rest first:

```sh
git fetch --unshallow origin main
```

## The documentation tests read paths

The test "names only paths that exist in the tree" reads every inline-code span
and every line of a fenced block in `README.md` and `docs/`. Any word there with
a path's shape must be a file git tracks. Two things trip it:

- A file the documentation names, created in the same change, fails until you
  `git add` it. It need not be committed.
- An example that only looks like a path, such as an action reference with a
  slash in it, fails too. Write it as plain text, or add it to the list of
  deliberate exceptions in the test, with what it names instead.
