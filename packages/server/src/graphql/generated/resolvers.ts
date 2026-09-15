/* eslint-disable */
// Generated from schema.graphql. Do not edit by hand.
//
// Checked in so that the types the resolvers are held to can be read
// here without running a generator first, and so that a change to the
// schema shows up in a diff. `pnpm codegen:check` regenerates this file
// and fails when the result differs from what is committed, which is what
// stops the schema and these types drifting apart.
import type { IsoDate } from '../../database/rows.ts';
import type {
  GraphQLResolveInfo,
  GraphQLScalarType,
  GraphQLScalarTypeConfig,
} from 'graphql';
import type { CheckRecord } from '../../database/checks.ts';
import type {
  TestRun as TestRunRow,
  ArmingObservation as ArmingObservationRow,
} from '../../database/rows.ts';
import type { RequestContext } from '../context.ts';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: NonNullable<T[P]>;
};
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  /**
   * A calendar day, written as YYYY-MM-DD.
   *
   * Days are days in this product, not instants. A run is dated and never timed, so
   * the scalar carries a day and refuses anything that is not one rather than
   * accepting a timestamp and quietly dropping the part it cannot use.
   */
  Date: { input: IsoDate; output: IsoDate };
};

/**
 * Evidence, on one day, about whether a check is switched on at all.
 *
 * Kept apart from a test run because the two answer different questions. A check
 * can be switched on and never proved, or proved and since switched off.
 */
export type ArmingObservation = {
  __typename?: 'ArmingObservation';
  /** What they found. */
  armed: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  note?: Maybe<Scalars['String']['output']>;
  /** The day somebody looked. */
  observedOn: Scalars['Date']['output'];
};

/**
 * An automated check: one thing that is supposed to catch something.
 *
 * The summary fields below are a reading of the check's record as of today, not
 * columns on a row. Two calls on either side of midnight can differ without
 * anything having been written.
 */
export type Check = {
  __typename?: 'Check';
  /** Where the check runs, in the team's own words. */
  area: Scalars['String']['output'];
  /** Every observation about this check, newest first. */
  armingObservations: Array<ArmingObservation>;
  caughtCount: Scalars['Int']['output'];
  /** How a reader can tell it is switched on. Empty when not written down. */
  howToTellArmed: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /**
   * What the latest observation said, or null when there has never been one.
   * Null is "nobody has looked" and false is "somebody looked and it was off",
   * which are different things to show a reader.
   */
  lastArmed?: Maybe<Scalars['Boolean']['output']>;
  /** The last day a run caught, or null when none ever has. */
  lastCaughtOn?: Maybe<Scalars['Date']['output']>;
  /** The day of the latest run, or null when there are none. */
  lastRunOn?: Maybe<Scalars['Date']['output']>;
  /** The last day an observation said it was on, or null if none has. */
  lastSeenArmedOn?: Maybe<Scalars['Date']['output']>;
  missedCount: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  /** What it is there to stop. Empty when nobody has written it down. */
  protects: Scalars['String']['output'];
  runCount: Scalars['Int']['output'];
  /** Every run against this check, newest first. */
  runs: Array<TestRun>;
  /** The status derived from everything below, as of today. */
  status: Status;
};

/** What a check did with the defect that was planted for it. */
export type Outcome =
  /** It reported the planted defect, which is the only thing that proves it works. */
  | 'CAUGHT'
  /** The defect was planted and the check said nothing. */
  | 'MISSED';

export type Query = {
  __typename?: 'Query';
  /** One check, or null when nothing is recorded under that id. */
  check?: Maybe<Check>;
  /**
   * Every check, ordered by name.
   *
   * There is no filter argument yet. The filter language exists and compiles to
   * SQL already; wiring it in here arrives with the filter epic.
   */
  checks: Array<Check>;
  /** How many checks hold each status. */
  statusCounts: StatusCounts;
};

export type QueryCheckArgs = {
  id: Scalars['ID']['input'];
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

/**
 * How many checks hold each status, as of today.
 *
 * The five counts add up to the total, because a check holds exactly one status.
 */
export type StatusCounts = {
  __typename?: 'StatusCounts';
  broken: Scalars['Int']['output'];
  proven: Scalars['Int']['output'];
  stale: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  unarmed: Scalars['Int']['output'];
  unproven: Scalars['Int']['output'];
};

/**
 * One planted defect, and what the check did about it.
 *
 * A run is the unit of evidence in this product. Everything a check's status
 * claims is read off these.
 */
export type TestRun = {
  __typename?: 'TestRun';
  /** What the check was expected to do about it. */
  expected: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** Anything worth telling the next person. Null when nobody wrote one. */
  note?: Maybe<Scalars['String']['output']>;
  /** What it actually did. */
  outcome: Outcome;
  /** What was planted. */
  planted: Scalars['String']['output'];
  /** The day the defect was planted, which may be before it was written down. */
  runOn: Scalars['Date']['output'];
};

export type ResolverTypeWrapper<T> = Promise<T> | T;

export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<
  TResult,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> =
  | ResolverFn<TResult, TParent, TContext, TArgs>
  | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<
  TResult,
  TKey extends string,
  TParent,
  TContext,
  TArgs,
> {
  subscribe: SubscriptionSubscribeFn<
    { [key in TKey]: TResult },
    TParent,
    TContext,
    TArgs
  >;
  resolve?: SubscriptionResolveFn<
    TResult,
    { [key in TKey]: TResult },
    TContext,
    TArgs
  >;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<
  TResult,
  TKey extends string,
  TParent,
  TContext,
  TArgs,
> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<
  TResult,
  TKey extends string,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> =
  | ((
      ...args: any[]
    ) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<
  TTypes,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo,
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<
  T = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
> = (
  obj: T,
  context: TContext,
  info: GraphQLResolveInfo,
) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<
  TResult = Record<PropertyKey, never>,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => TResult | Promise<TResult>;

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  ArmingObservation: ResolverTypeWrapper<ArmingObservationRow>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  Check: ResolverTypeWrapper<CheckRecord>;
  Date: ResolverTypeWrapper<Scalars['Date']['output']>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  Outcome: Outcome;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  Status: Status;
  StatusCounts: ResolverTypeWrapper<StatusCounts>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  TestRun: ResolverTypeWrapper<TestRunRow>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  ArmingObservation: ArmingObservationRow;
  Boolean: Scalars['Boolean']['output'];
  Check: CheckRecord;
  Date: Scalars['Date']['output'];
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  Query: Record<PropertyKey, never>;
  StatusCounts: StatusCounts;
  String: Scalars['String']['output'];
  TestRun: TestRunRow;
};

export type ArmingObservationResolvers<
  ContextType = RequestContext,
  ParentType extends ResolversParentTypes['ArmingObservation'] =
    ResolversParentTypes['ArmingObservation'],
> = {
  armed: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  id: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  note: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  observedOn: Resolver<ResolversTypes['Date'], ParentType, ContextType>;
};

export type CheckResolvers<
  ContextType = RequestContext,
  ParentType extends ResolversParentTypes['Check'] =
    ResolversParentTypes['Check'],
> = {
  area: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  armingObservations: Resolver<
    Array<ResolversTypes['ArmingObservation']>,
    ParentType,
    ContextType
  >;
  caughtCount: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  howToTellArmed: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  lastArmed: Resolver<
    Maybe<ResolversTypes['Boolean']>,
    ParentType,
    ContextType
  >;
  lastCaughtOn: Resolver<
    Maybe<ResolversTypes['Date']>,
    ParentType,
    ContextType
  >;
  lastRunOn: Resolver<Maybe<ResolversTypes['Date']>, ParentType, ContextType>;
  lastSeenArmedOn: Resolver<
    Maybe<ResolversTypes['Date']>,
    ParentType,
    ContextType
  >;
  missedCount: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  name: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  protects: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  runCount: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  runs: Resolver<Array<ResolversTypes['TestRun']>, ParentType, ContextType>;
  status: Resolver<ResolversTypes['Status'], ParentType, ContextType>;
};

export interface DateScalarConfig extends GraphQLScalarTypeConfig<
  ResolversTypes['Date'],
  any
> {
  name: 'Date';
}

export type QueryResolvers<
  ContextType = RequestContext,
  ParentType extends ResolversParentTypes['Query'] =
    ResolversParentTypes['Query'],
> = {
  check?: Resolver<
    Maybe<ResolversTypes['Check']>,
    ParentType,
    ContextType,
    RequireFields<QueryCheckArgs, 'id'>
  >;
  checks?: Resolver<Array<ResolversTypes['Check']>, ParentType, ContextType>;
  statusCounts?: Resolver<
    ResolversTypes['StatusCounts'],
    ParentType,
    ContextType
  >;
};

export type StatusCountsResolvers<
  ContextType = RequestContext,
  ParentType extends ResolversParentTypes['StatusCounts'] =
    ResolversParentTypes['StatusCounts'],
> = {
  broken: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  proven: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  stale: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  unarmed: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  unproven: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type TestRunResolvers<
  ContextType = RequestContext,
  ParentType extends ResolversParentTypes['TestRun'] =
    ResolversParentTypes['TestRun'],
> = {
  expected: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  note: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  outcome: Resolver<ResolversTypes['Outcome'], ParentType, ContextType>;
  planted: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  runOn: Resolver<ResolversTypes['Date'], ParentType, ContextType>;
};

export type Resolvers<ContextType = RequestContext> = {
  ArmingObservation: ArmingObservationResolvers<ContextType>;
  Check: CheckResolvers<ContextType>;
  Date: GraphQLScalarType;
  Query: QueryResolvers<ContextType>;
  StatusCounts: StatusCountsResolvers<ContextType>;
  TestRun: TestRunResolvers<ContextType>;
};
