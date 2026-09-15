/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never;
    };
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
/** A new check, as somebody would describe it in a form. */
export type CreateCheckInput = {
  /** Where the check runs, in the team's own words. Not blank. */
  area: string;
  /**
   * How a reader can tell it is switched on. May be blank, and a blank one is
   * stored as empty.
   */
  howToTellArmed: string;
  /** Unique across the workspace, and not blank. */
  name: string;
  /** What it is there to stop. May be blank, and a blank one is stored as empty. */
  protects: string;
};

/** One planted defect, and what the check did about it. */
export type LogTestRunInput = {
  /** The check the defect was planted for. It has to exist. */
  checkId: string | number;
  /** What the check was expected to do about it. Not blank. */
  expected: string;
  /** Anything worth telling the next person. A blank note is stored as none. */
  note?: string | null | undefined;
  /** What it actually did. */
  outcome: Outcome;
  /** What was planted. Not blank. */
  planted: string;
  /** The day the defect was planted. Not in the future. */
  runOn: string;
};

/** What a check did with the defect that was planted for it. */
export type Outcome =
  /** It reported the planted defect, which is the only thing that proves it works. */
  | 'CAUGHT'
  /** The defect was planted and the check said nothing. */
  | 'MISSED';

/** Evidence, on one day, about whether a check is switched on. */
export type RecordArmingObservationInput = {
  /** What they found. */
  armed: boolean;
  /** The check that was looked at. It has to exist. */
  checkId: string | number;
  /** Anything worth telling the next person. A blank note is stored as none. */
  note?: string | null | undefined;
  /** The day somebody looked. Not in the future. */
  observedOn: string;
};

/**
 * The five statuses a check can hold.
 *
 * A status is worked out from the record as of a day, and no table stores one, so
 * these are the readings a check can give rather than states it can be put into.
 */
export type Status =
  /** The latest run missed the defect that was planted for it. */
  | 'BROKEN'
  /** The latest run caught its planted defect, recently enough to still believe. */
  | 'PROVEN'
  /** It caught a planted defect before, but longer ago than the threshold. */
  | 'STALE'
  /** There is no evidence it is switched on at all. */
  | 'UNARMED'
  /** There is evidence it is switched on, and nothing has ever been planted for it. */
  | 'UNPROVEN';

export type AreasQueryVariables = Exact<{ [key: string]: never }>;

export type AreasQuery = { areas: Array<string> };

export type CheckDetailQueryVariables = Exact<{
  id: string | number;
}>;

export type CheckDetailQuery = {
  check: {
    id: string;
    name: string;
    area: string;
    protects: string;
    howToTellArmed: string;
    status: Status;
    lastCaughtOn: string | null;
    runCount: number;
    caughtCount: number;
    missedCount: number;
    runs: Array<{
      id: string;
      runOn: string;
      planted: string;
      expected: string;
      outcome: Outcome;
      note: string | null;
    }>;
    armingObservations: Array<{
      id: string;
      observedOn: string;
      armed: boolean;
    }>;
  } | null;
};

export type CheckOptionsQueryVariables = Exact<{ [key: string]: never }>;

export type CheckOptionsQuery = {
  checks: { checks: Array<{ id: string; name: string }> };
};

export type ChecksQueryVariables = Exact<{
  filter?: import('@seen-to-fail/filter').Filter | null | undefined;
}>;

export type ChecksQuery = {
  checks: {
    matching: number;
    hidden: number;
    checks: Array<{
      id: string;
      name: string;
      area: string;
      status: Status;
      lastCaughtOn: string | null;
      runCount: number;
      runs: Array<{
        id: string;
        runOn: string;
        outcome: Outcome;
        planted: string;
      }>;
    }>;
  };
};

export type CreateCheckMutationVariables = Exact<{
  input: CreateCheckInput;
}>;

export type CreateCheckMutation = {
  createCheck:
    | { __typename: 'Check'; id: string; name: string; status: Status }
    | {
        __typename: 'ValidationErrors';
        errors: Array<{ path: string; message: string }>;
      };
};

export type LogTestRunMutationVariables = Exact<{
  input: LogTestRunInput;
}>;

export type LogTestRunMutation = {
  logTestRun:
    | {
        __typename: 'TestRunLogged';
        testRun: { id: string };
        check: { id: string; name: string; status: Status; runCount: number };
      }
    | {
        __typename: 'ValidationErrors';
        errors: Array<{ path: string; message: string }>;
      };
};

export type RecordArmingObservationMutationVariables = Exact<{
  input: RecordArmingObservationInput;
}>;

export type RecordArmingObservationMutation = {
  recordArmingObservation:
    | {
        __typename: 'ArmingObservationRecorded';
        armingObservation: { id: string };
        check: { id: string; status: Status };
      }
    | {
        __typename: 'ValidationErrors';
        errors: Array<{ path: string; message: string }>;
      };
};

export type StatusCountsQueryVariables = Exact<{ [key: string]: never }>;

export type StatusCountsQuery = {
  statusCounts: {
    proven: number;
    unproven: number;
    stale: number;
    unarmed: number;
    broken: number;
    total: number;
  };
};

export const AreasDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Areas' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [{ kind: 'Field', name: { kind: 'Name', value: 'areas' } }],
      },
    },
  ],
} as unknown as DocumentNode<AreasQuery, AreasQueryVariables>;
export const CheckDetailDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'CheckDetail' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'check' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'id' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'area' } },
                { kind: 'Field', name: { kind: 'Name', value: 'protects' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'howToTellArmed' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'lastCaughtOn' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'runCount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'caughtCount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'missedCount' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'runs' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'runOn' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'planted' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'expected' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'outcome' },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'note' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'armingObservations' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'observedOn' },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'armed' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CheckDetailQuery, CheckDetailQueryVariables>;
export const CheckOptionsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'CheckOptions' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'checks' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'checks' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CheckOptionsQuery, CheckOptionsQueryVariables>;
export const ChecksDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Checks' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'filter' },
          },
          type: {
            kind: 'NamedType',
            name: { kind: 'Name', value: 'FilterInput' },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'checks' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'filter' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'filter' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'checks' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'area' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'status' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'lastCaughtOn' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'runCount' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'runs' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'id' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'runOn' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'outcome' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'planted' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'matching' } },
                { kind: 'Field', name: { kind: 'Name', value: 'hidden' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ChecksQuery, ChecksQueryVariables>;
export const CreateCheckDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateCheck' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'CreateCheckInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createCheck' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'input' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'Check' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'status' },
                      },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'ValidationErrors' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'errors' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'path' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'message' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateCheckMutation, CreateCheckMutationVariables>;
export const LogTestRunDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'LogTestRun' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'LogTestRunInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'logTestRun' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'input' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'TestRunLogged' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'testRun' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'id' },
                            },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'check' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'id' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'name' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'status' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'runCount' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'ValidationErrors' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'errors' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'path' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'message' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<LogTestRunMutation, LogTestRunMutationVariables>;
export const RecordArmingObservationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RecordArmingObservation' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'RecordArmingObservationInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'recordArmingObservation' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'input' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'ArmingObservationRecorded' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'armingObservation' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'id' },
                            },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'check' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'id' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'status' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'ValidationErrors' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'errors' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'path' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'message' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  RecordArmingObservationMutation,
  RecordArmingObservationMutationVariables
>;
export const StatusCountsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'StatusCounts' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'statusCounts' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'proven' } },
                { kind: 'Field', name: { kind: 'Name', value: 'unproven' } },
                { kind: 'Field', name: { kind: 'Name', value: 'stale' } },
                { kind: 'Field', name: { kind: 'Name', value: 'unarmed' } },
                { kind: 'Field', name: { kind: 'Name', value: 'broken' } },
                { kind: 'Field', name: { kind: 'Name', value: 'total' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<StatusCountsQuery, StatusCountsQueryVariables>;
