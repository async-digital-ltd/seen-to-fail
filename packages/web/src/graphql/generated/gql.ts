/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
  'query Areas {\n  areas\n}': typeof types.AreasDocument;
  'query CheckDetail($id: ID!) {\n  check(id: $id) {\n    id\n    name\n    area\n    protects\n    howToTellArmed\n    status\n    lastCaughtOn\n    runCount\n    caughtCount\n    missedCount\n    runs {\n      id\n      runOn\n      planted\n      expected\n      outcome\n      note\n    }\n    armingObservations {\n      id\n      observedOn\n      armed\n    }\n  }\n}': typeof types.CheckDetailDocument;
  'query CheckOptions {\n  checks {\n    checks {\n      id\n      name\n    }\n  }\n}': typeof types.CheckOptionsDocument;
  'query Checks($filter: FilterInput) {\n  checks(filter: $filter) {\n    checks {\n      id\n      name\n      area\n      status\n      lastCaughtOn\n      runCount\n      runs {\n        id\n        runOn\n        outcome\n        planted\n      }\n    }\n    matching\n    hidden\n  }\n}': typeof types.ChecksDocument;
  'mutation CreateCheck($input: CreateCheckInput!) {\n  createCheck(input: $input) {\n    __typename\n    ... on Check {\n      id\n      name\n      status\n    }\n    ... on ValidationErrors {\n      errors {\n        path\n        message\n      }\n    }\n  }\n}': typeof types.CreateCheckDocument;
  'mutation LogTestRun($input: LogTestRunInput!) {\n  logTestRun(input: $input) {\n    __typename\n    ... on TestRunLogged {\n      testRun {\n        id\n      }\n      check {\n        id\n        name\n        status\n        runCount\n      }\n    }\n    ... on ValidationErrors {\n      errors {\n        path\n        message\n      }\n    }\n  }\n}': typeof types.LogTestRunDocument;
  'mutation RecordArmingObservation($input: RecordArmingObservationInput!) {\n  recordArmingObservation(input: $input) {\n    __typename\n    ... on ArmingObservationRecorded {\n      armingObservation {\n        id\n      }\n      check {\n        id\n        status\n      }\n    }\n    ... on ValidationErrors {\n      errors {\n        path\n        message\n      }\n    }\n  }\n}': typeof types.RecordArmingObservationDocument;
  'query StatusCounts {\n  statusCounts {\n    proven\n    unproven\n    stale\n    unarmed\n    broken\n    total\n  }\n}': typeof types.StatusCountsDocument;
};
const documents: Documents = {
  'query Areas {\n  areas\n}': types.AreasDocument,
  'query CheckDetail($id: ID!) {\n  check(id: $id) {\n    id\n    name\n    area\n    protects\n    howToTellArmed\n    status\n    lastCaughtOn\n    runCount\n    caughtCount\n    missedCount\n    runs {\n      id\n      runOn\n      planted\n      expected\n      outcome\n      note\n    }\n    armingObservations {\n      id\n      observedOn\n      armed\n    }\n  }\n}':
    types.CheckDetailDocument,
  'query CheckOptions {\n  checks {\n    checks {\n      id\n      name\n    }\n  }\n}':
    types.CheckOptionsDocument,
  'query Checks($filter: FilterInput) {\n  checks(filter: $filter) {\n    checks {\n      id\n      name\n      area\n      status\n      lastCaughtOn\n      runCount\n      runs {\n        id\n        runOn\n        outcome\n        planted\n      }\n    }\n    matching\n    hidden\n  }\n}':
    types.ChecksDocument,
  'mutation CreateCheck($input: CreateCheckInput!) {\n  createCheck(input: $input) {\n    __typename\n    ... on Check {\n      id\n      name\n      status\n    }\n    ... on ValidationErrors {\n      errors {\n        path\n        message\n      }\n    }\n  }\n}':
    types.CreateCheckDocument,
  'mutation LogTestRun($input: LogTestRunInput!) {\n  logTestRun(input: $input) {\n    __typename\n    ... on TestRunLogged {\n      testRun {\n        id\n      }\n      check {\n        id\n        name\n        status\n        runCount\n      }\n    }\n    ... on ValidationErrors {\n      errors {\n        path\n        message\n      }\n    }\n  }\n}':
    types.LogTestRunDocument,
  'mutation RecordArmingObservation($input: RecordArmingObservationInput!) {\n  recordArmingObservation(input: $input) {\n    __typename\n    ... on ArmingObservationRecorded {\n      armingObservation {\n        id\n      }\n      check {\n        id\n        status\n      }\n    }\n    ... on ValidationErrors {\n      errors {\n        path\n        message\n      }\n    }\n  }\n}':
    types.RecordArmingObservationDocument,
  'query StatusCounts {\n  statusCounts {\n    proven\n    unproven\n    stale\n    unarmed\n    broken\n    total\n  }\n}':
    types.StatusCountsDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: 'query Areas {\n  areas\n}',
): (typeof documents)['query Areas {\n  areas\n}'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: 'query CheckDetail($id: ID!) {\n  check(id: $id) {\n    id\n    name\n    area\n    protects\n    howToTellArmed\n    status\n    lastCaughtOn\n    runCount\n    caughtCount\n    missedCount\n    runs {\n      id\n      runOn\n      planted\n      expected\n      outcome\n      note\n    }\n    armingObservations {\n      id\n      observedOn\n      armed\n    }\n  }\n}',
): (typeof documents)['query CheckDetail($id: ID!) {\n  check(id: $id) {\n    id\n    name\n    area\n    protects\n    howToTellArmed\n    status\n    lastCaughtOn\n    runCount\n    caughtCount\n    missedCount\n    runs {\n      id\n      runOn\n      planted\n      expected\n      outcome\n      note\n    }\n    armingObservations {\n      id\n      observedOn\n      armed\n    }\n  }\n}'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: 'query CheckOptions {\n  checks {\n    checks {\n      id\n      name\n    }\n  }\n}',
): (typeof documents)['query CheckOptions {\n  checks {\n    checks {\n      id\n      name\n    }\n  }\n}'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: 'query Checks($filter: FilterInput) {\n  checks(filter: $filter) {\n    checks {\n      id\n      name\n      area\n      status\n      lastCaughtOn\n      runCount\n      runs {\n        id\n        runOn\n        outcome\n        planted\n      }\n    }\n    matching\n    hidden\n  }\n}',
): (typeof documents)['query Checks($filter: FilterInput) {\n  checks(filter: $filter) {\n    checks {\n      id\n      name\n      area\n      status\n      lastCaughtOn\n      runCount\n      runs {\n        id\n        runOn\n        outcome\n        planted\n      }\n    }\n    matching\n    hidden\n  }\n}'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: 'mutation CreateCheck($input: CreateCheckInput!) {\n  createCheck(input: $input) {\n    __typename\n    ... on Check {\n      id\n      name\n      status\n    }\n    ... on ValidationErrors {\n      errors {\n        path\n        message\n      }\n    }\n  }\n}',
): (typeof documents)['mutation CreateCheck($input: CreateCheckInput!) {\n  createCheck(input: $input) {\n    __typename\n    ... on Check {\n      id\n      name\n      status\n    }\n    ... on ValidationErrors {\n      errors {\n        path\n        message\n      }\n    }\n  }\n}'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: 'mutation LogTestRun($input: LogTestRunInput!) {\n  logTestRun(input: $input) {\n    __typename\n    ... on TestRunLogged {\n      testRun {\n        id\n      }\n      check {\n        id\n        name\n        status\n        runCount\n      }\n    }\n    ... on ValidationErrors {\n      errors {\n        path\n        message\n      }\n    }\n  }\n}',
): (typeof documents)['mutation LogTestRun($input: LogTestRunInput!) {\n  logTestRun(input: $input) {\n    __typename\n    ... on TestRunLogged {\n      testRun {\n        id\n      }\n      check {\n        id\n        name\n        status\n        runCount\n      }\n    }\n    ... on ValidationErrors {\n      errors {\n        path\n        message\n      }\n    }\n  }\n}'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: 'mutation RecordArmingObservation($input: RecordArmingObservationInput!) {\n  recordArmingObservation(input: $input) {\n    __typename\n    ... on ArmingObservationRecorded {\n      armingObservation {\n        id\n      }\n      check {\n        id\n        status\n      }\n    }\n    ... on ValidationErrors {\n      errors {\n        path\n        message\n      }\n    }\n  }\n}',
): (typeof documents)['mutation RecordArmingObservation($input: RecordArmingObservationInput!) {\n  recordArmingObservation(input: $input) {\n    __typename\n    ... on ArmingObservationRecorded {\n      armingObservation {\n        id\n      }\n      check {\n        id\n        status\n      }\n    }\n    ... on ValidationErrors {\n      errors {\n        path\n        message\n      }\n    }\n  }\n}'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: 'query StatusCounts {\n  statusCounts {\n    proven\n    unproven\n    stale\n    unarmed\n    broken\n    total\n  }\n}',
): (typeof documents)['query StatusCounts {\n  statusCounts {\n    proven\n    unproven\n    stale\n    unarmed\n    broken\n    total\n  }\n}'];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> =
  TDocumentNode extends DocumentNode<infer TType, any> ? TType : never;
