import type { Plugin } from 'graphql-yoga';
import { createGraphQLError } from 'graphql-yoga';

/**
 * Two refusals made before a request is parsed as GraphQL, and so before any
 * resolver runs (#183).
 *
 * Without CORS headers (#159) a browser keeps this server's answers from a
 * page on another origin, but it still sends some requests from that page
 * without asking first, and the server acts on what it is sent. A form can
 * post `application/x-www-form-urlencoded`, `multipart/form-data` or
 * `text/plain` to any address, and the GraphQL server parses the first two as
 * a query. A page on another site could therefore run a mutation against the
 * local database while the server was up, and nothing on screen would say so.
 *
 * The first refusal is of a POST whose body is not JSON. A browser posts to
 * another origin without asking first only when the body's content type is one
 * of those three, or when it has none. So a POST that has to be JSON cannot
 * come from another origin without a preflight, and the server answers no
 * preflight in a way a browser accepts. Nothing here sends anything else: the
 * web app sends its queries as GET, or as JSON when the address would be too
 * long, and its mutations as JSON, and GraphiQL posts JSON. Refusing every type
 * but JSON, rather than listing the three, refuses the body with no content
 * type as well.
 *
 * The second refusal is of a request addressed to a name the server does not
 * answer to. A page served from a name that its owner later points at
 * 127.0.0.1 is, to the browser, on the same origin as this server, so it can
 * post JSON and read the answer; only the name it asked for is different. The
 * names allowed are passed in, and server.ts says which they are and why. The
 * port is not checked, because the server listens on one port and the request
 * reached it.
 *
 * Both refusals are made where parsing begins. The health route, the readiness
 * route and the GraphiQL page are answered before that point, so they still
 * answer whatever they are sent. None of them reads the record.
 */

/** What a POST whose body is not JSON is told, with status 415. */
export const notJsonMessage = 'A POST to this server must send a JSON body.';

/** What a request for a name the server does not answer to is told, with 403. */
export const unknownHostMessage = 'This server does not answer to that name.';

/**
 * The content type's MIME essence, lower case: what comes before any
 * parameter. A value that is a list, which is not a valid header, keeps its
 * commas and so matches nothing.
 */
function essence(contentType: string | null): string {
  return (contentType ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

/**
 * The plugin. `hostnames` are the names a request may be addressed to,
 * without a port, as a URL's `hostname` spells them.
 */
export function useRequestGuard(hostnames: readonly string[]): Plugin {
  const allowed = new Set(hostnames);
  return {
    onRequestParse({ request, url }) {
      if (!allowed.has(url.hostname)) {
        throw createGraphQLError(unknownHostMessage, {
          extensions: { http: { status: 403 } },
        });
      }
      if (
        request.method === 'POST' &&
        essence(request.headers.get('content-type')) !== 'application/json'
      ) {
        throw createGraphQLError(notJsonMessage, {
          extensions: { http: { status: 415 } },
        });
      }
    },
  };
}
