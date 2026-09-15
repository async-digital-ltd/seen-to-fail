import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DocumentNode } from 'graphql';
import { buildSchema, execute, validate } from 'graphql';
import type {
  AnyVariables,
  Client,
  Exchange,
  Operation,
  OperationResult,
  OperationType,
  TypedDocumentNode,
} from 'urql';
import { getOperationName, makeErrorResult, makeResult } from 'urql';
import type { Source } from 'wonka';
import {
  filter,
  fromPromise,
  fromValue,
  mergeMap,
  never,
  pipe,
  takeUntil,
} from 'wonka';

import { createGraphQLClient } from '../graphql/client';

/**
 * A client for tests whose transport answers from stubs.
 *
 * It is the app's own client with its last exchange, the one that would
 * fetch, replaced. The document cache stays, so a screen under test is cached,
 * re-read and invalidated as it is in the browser.
 *
 * The stub runs each operation through the real schema with the test's answer
 * as the root value. So the data a screen receives is shaped by the schema and
 * by what the operation selected, every object carries its type, which is what
 * the cache invalidates on, and an answer missing a field the schema requires
 * is an error the screen shows rather than an undefined the test trips over
 * later.
 *
 * Answers are matched to operations by name, which the client preset requires
 * every operation to have. When two answers share a name the later one wins,
 * so a test can start from a shared list and override one entry.
 *
 * Nothing answers synchronously. urql's hooks probe a query once before they
 * subscribe to it, and an answer that arrived during the probe would be asked
 * for twice. Answering a tick later, as a network does, means each mount asks
 * once.
 */

const schemaFile = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'server',
  'schema.graphql',
);
const schema = buildSchema(readFileSync(schemaFile, 'utf8'));

/** What a stub answers for one named operation. */
export interface Answer {
  /** The operation's name, as written in its .graphql file. */
  readonly operationName: string;
  /** Builds the result stream for one execution of that operation. */
  readonly respond: (operation: Operation) => Source<OperationResult>;
}

/** One operation a screen sent, as the stub saw it. */
export interface Call {
  readonly kind: OperationType;
  readonly name: string;
  readonly variables: unknown;
}

export interface StubClient {
  readonly client: Client;
  /** Every operation the stub answered so far, oldest first. */
  readonly calls: readonly Call[];
}

// Generic rather than TypedDocumentNode<unknown, AnyVariables> because a
// typed document's variables are contravariant: a document that takes no
// variables does not accept "any variables", and would be refused.
function nameOf<Data, Variables extends AnyVariables>(
  document: TypedDocumentNode<Data, Variables>,
): string {
  const name = getOperationName(document);
  if (name === undefined) {
    throw new Error(
      'A stub answers an operation by its name, and this document has none.',
    );
  }
  return name;
}

function resolveData<Data, Variables>(
  data: Data | ((variables: Variables) => Data),
  variables: Variables,
): Data {
  return typeof data === 'function'
    ? (data as (variables: Variables) => Data)(variables)
    : data;
}

/** Runs the operation against the schema, reading its data off the answer. */
async function executeAgainstSchema(
  operation: Operation,
  rootValue: unknown,
): Promise<OperationResult> {
  const document: DocumentNode = operation.query;
  const problems = validate(schema, document);
  if (problems.length > 0) {
    return makeResult(operation, { errors: problems });
  }
  try {
    const result = await execute({
      schema,
      document,
      rootValue,
      variableValues: operation.variables as
        Record<string, unknown> | undefined,
    });
    return makeResult(operation, result);
  } catch (cause) {
    return makeErrorResult(
      operation,
      cause instanceof Error ? cause : new Error(String(cause)),
    );
  }
}

/**
 * Answers with data: a value, or a function of the operation's variables for
 * an answer that depends on what was asked.
 */
export function answer<Data, Variables extends AnyVariables>(
  document: TypedDocumentNode<Data, Variables>,
  data: Data | ((variables: Variables) => Data),
): Answer {
  return {
    operationName: nameOf(document),
    respond: (operation) =>
      fromPromise(
        executeAgainstSchema(
          operation,
          resolveData(data, operation.variables as Variables),
        ),
      ),
  };
}

/** Answers as though the request never reached the server. */
export function networkFailure<Data, Variables extends AnyVariables>(
  document: TypedDocumentNode<Data, Variables>,
  message = 'Failed to fetch',
): Answer {
  return {
    operationName: nameOf(document),
    respond: (operation) =>
      fromValue(makeErrorResult(operation, new Error(message))),
  };
}

/** Answers with the errors the server would put in its response. */
export function graphqlFailure<Data, Variables extends AnyVariables>(
  document: TypedDocumentNode<Data, Variables>,
  ...messages: string[]
): Answer {
  return {
    operationName: nameOf(document),
    respond: (operation) =>
      fromValue(
        makeResult(operation, {
          errors: messages.map((message) => ({ message })),
        }),
      ),
  };
}

/** Never answers, so the screen stays in its loading state. */
export function pending<Data, Variables extends AnyVariables>(
  document: TypedDocumentNode<Data, Variables>,
): Answer {
  return { operationName: nameOf(document), respond: () => never };
}

/**
 * An operation no answer was registered for gets a GraphQL error naming it,
 * so the screen shows the name in its error notice rather than hanging, and a
 * failing test's DOM says which stub is missing.
 */
function unanswered(
  operation: Operation,
  name: string,
): Source<OperationResult> {
  return fromValue(
    makeResult(operation, {
      errors: [
        {
          message:
            `No answer is registered for the ${operation.kind} ${name}. ` +
            'Pass one to the render helper.',
        },
      ],
    }),
  );
}

export function createStubClient(answers: readonly Answer[] = []): StubClient {
  const calls: Call[] = [];

  const stubExchange: Exchange = () => (operations$) => {
    // The client sends a teardown when nobody is listening to an operation
    // any more. It is not a request; it is what cancels one.
    const teardownOf = (key: number): Source<Operation> =>
      pipe(
        operations$,
        filter(
          (operation) => operation.kind === 'teardown' && operation.key === key,
        ),
      );

    return pipe(
      operations$,
      filter((operation) => operation.kind !== 'teardown'),
      mergeMap((operation) =>
        pipe(
          // The tick. A probe that gives up at once tears the operation down
          // before this resolves, so it is neither counted nor answered.
          fromPromise(Promise.resolve(operation)),
          mergeMap((op) => {
            const name = getOperationName(op.query) ?? '(unnamed)';
            calls.push({ kind: op.kind, name, variables: op.variables });
            const found = answers.findLast(
              (candidate) => candidate.operationName === name,
            );
            return found === undefined
              ? unanswered(op, name)
              : found.respond(op);
          }),
          takeUntil(teardownOf(operation.key)),
        ),
      ),
    );
  };

  return { client: createGraphQLClient(stubExchange), calls };
}
