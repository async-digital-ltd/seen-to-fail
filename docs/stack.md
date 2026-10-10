# Stack

- **TypeScript** throughout, in strict mode.
- **GraphQL** API on Node, with frontend types generated from the schema.
- **PostgreSQL**, with four tables: checks, test runs, arming observations and
  saved filters. The schema carries `saved_filters` for saving a filter under a
  name, and nothing reads it yet.
- **React** with Vite, React Router and urql.
- **Vitest** for tests, and GitHub Actions for CI, whose steps are listed under
  [Tests](tests.md).

The server is built for local use only. It listens on `127.0.0.1` and no other
interface, so no other machine can reach it, and it sends no CORS headers, so a
browser will not hand its answers to a page from another origin. Nor can such a
page make it write. A POST whose body is not JSON, which is the only kind a
browser sends to another origin without asking first, is refused before any
resolver runs. So is a GraphQL request addressed to any name but `127.0.0.1` or
`localhost`, which is how a page whose own name had been pointed at the loopback
would reach it. `packages/server/src/graphql/request-guard.test.ts` holds both.
Both refusals are made where a request is parsed as GraphQL, and three routes
are answered before that point, so they answer whatever they are sent, under any
name: `/health`, `/ready` and the GraphiQL page at `/graphql`. None of the three
reads the record, and when the database does not answer, `/ready` says so with
a 503 and an empty body rather than the database's own error message
(`packages/server/src/graphql/queries.test.ts` holds it). Those answers were
measured, and are on
[#192](https://github.com/async-digital-ltd/seen-to-fail/issues/192).
There is no per-request cost limit and no limit on the size of a request body,
so it is not hardened for deployment. The client's development server, which
`pnpm dev:web` starts and which passes `/graphql` on to the server, sends no
CORS headers either, so a page on another port of the same machine can neither
post JSON through it nor read what comes back.
`packages/web/src/dev-server.test.ts` holds that.

The list, the filter bar and the three forms carry keyboard tests, including the
observation form on a check's own page. The rest of that page does not, and no
dedicated keyboard and screen reader pass has been run over any of them.
