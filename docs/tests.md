# Tests

<!-- generated: contributor-commands, by pnpm readme from the checks job in .github/workflows/ci.yml -->

```sh
pnpm typecheck
pnpm lint
pnpm lint:workflows
pnpm format:check
pnpm test
```

<!-- end generated: contributor-commands -->

The repository is a pnpm workspace, and these are its packages:

<!-- generated: packages, by pnpm readme from packages/ and each package's own description -->

- `packages/filter`: The filter language, imported by both the server and the web client so that neither one depends on the other.
- `packages/replay`: Reads a replay tool's report and says what runs it means. It writes nothing, reads no files and knows nothing about a database.
- `packages/server`: The GraphQL API.
- `packages/web`: The React client, built with Vite.

<!-- end generated: packages -->

`typecheck` and `test` run inside every package. `lint` and `format:check` run
once over the whole tree from the repository root. `pnpm format` rewrites files
in place instead of reporting on them.

`lint:workflows` reads every file in `.github/workflows` as a GitHub Actions
workflow with [actionlint](https://github.com/rhysd/actionlint), and the shell
in each of their `run:` steps with ShellCheck. Nothing else reads
`.github/workflows/record-run.yml` or `.github/workflows/replay.yml` as a
workflow before it runs, and neither runs on a pull request
([#157](https://github.com/async-digital-ltd/seen-to-fail/issues/157)). It
then reads every tracked shell script under `scripts/` with the same
ShellCheck, because several of CI's steps are one of those scripts and
actionlint reads only the shell written inside a workflow
([#191](https://github.com/async-digital-ltd/seen-to-fail/issues/191)). It
downloads both tools from their release pages on every run, so it needs a
network connection, and refuses either one unless its SHA-256 matches the pin
in `scripts/lint-workflows.sh`.

The server's resolver types and the client's typed queries are generated from
`packages/server/schema.graphql` and checked in. After changing the schema or a
`.graphql` query in `packages/web`, run `pnpm codegen`. CI runs
`pnpm codegen:check`, which regenerates both and fails when the result differs
from what is committed.

The commands above, the list of packages and the list of CI's steps below are
written from the tree rather than by hand. `pnpm readme` rewrites them from
`.github/workflows/ci.yml` and from each package's `package.json`, and a test
fails while any of them differs from what it would write, so a change to either
source needs `pnpm readme` run before it will pass.

Some tests are backed by the database. They run against `TEST_DATABASE_URL` on
a real PostgreSQL, apply the migrations before the first of them, and empty
every table between tests, so they are repeatable without anyone tidying up by
hand. They fail if no database is running, which is the honest answer rather
than a quiet skip. The status rules in [how-it-works.md](how-it-works.md) are tested that way, one fixture per
rule, so a rule deleted from the SQL takes at least one test down with it.

CI runs these steps, in this order, each under the name the checks job in
`.github/workflows/ci.yml` gives it. The commands at the top of this section are
the ones it runs between applying the migrations and starting the server.

<!-- generated: ci-steps, by pnpm readme from the checks job in .github/workflows/ci.yml -->

1. Check out the repository
2. Install pnpm
3. Install Node
4. Install dependencies
5. Check the generated types are current
6. Create the databases
7. Apply migrations
8. Type check
9. Lint
10. Lint the workflows
11. Check formatting
12. Test
13. Check the server starts
14. Build the client
15. Check the client bundle against its baseline
16. Check the ledger reads
17. Build the published ledger
18. Check the published output
19. Keep the published ledger as an artefact
20. Hand the published ledger to Pages, only if `github.event_name == 'push' && github.ref == 'refs/heads/main'`

<!-- end generated: ci-steps -->

Starting the server is `scripts/check-server-starts.sh`, and it is what proves
the entry point loads: the tests put requests through the handler and never run
it. The script waits up to 30 seconds for `/health`, then sends one GraphQL
query, stops the server, and requires that nothing answers on its address
afterwards, so an answer from some other process on the port fails the check.
It runs the same way locally. Building the client is what proves the page
reaches the code: the tests import modules, and only the bundler starts from
`packages/web/index.html`. The bundle check then measures what that build
wrote, in bytes, against `packages/web/bundle-baseline.json`, and fails when
the JavaScript, the CSS or the whole build grows more than the baseline's
tolerance past it. When the build shrinks it passes and says so:
`pnpm build:web && pnpm bundle:ratchet` lowers the baseline to match, and is
the only command that rewrites it. It cannot raise a number, so a change that
needs the bundle to grow edits the file by hand and says why
([#246](https://github.com/async-digital-ltd/seen-to-fail/issues/246)). The
ledger steps read the records, build the published page from them, and check
what came out: the page, the export and
the preview image, naming the commit CI is running against, with no script, no
`noindex`, link-preview tags that point at the live address, and a line under
the headline that scopes its count and links a heading the README has.
