import {
  countChecksByStatus,
  findCheck,
  listChecks,
} from '../database/checks.ts';
import { dateScalar } from './date.ts';
import { outcomeName, statusName } from './enums.ts';
import { filterFromArgument, filterInputScalar } from './filter-input.ts';
import type {
  ArmingObservationResolvers,
  CheckListResolvers,
  CheckResolvers,
  QueryResolvers,
  Resolvers,
  StatusCountsResolvers,
  TestRunResolvers,
} from './generated/resolvers.ts';

/**
 * Every field in the schema, resolved.
 *
 * "Every" is the type's doing rather than a promise made here. The generated
 * resolver types are produced with optionals switched off, so a field added to
 * the schema and left out of this file fails the type check rather than
 * returning null to whoever asks for it first. The one gap the generator leaves
 * is the root query, whose fields it makes optional so that a large API can be
 * assembled from several files; this one is not large, so the type below closes
 * that gap by hand and the same rule holds all the way down.
 *
 * Most of what follows is a field reading the value of the same name off the
 * row behind it. Written out rather than left to the default resolver, because
 * the default is invisible: a row that stopped carrying a field would resolve
 * to null and nothing would say so, whereas the explicit version stops
 * compiling. The fields that are not a plain read are the interesting ones and
 * they stand out by being longer: the two enums change spelling, and the two
 * lists go through a loader.
 */

/** The resolver map, with the root query's fields required as well. */
type CompleteResolvers = Omit<Resolvers, 'Query'> & {
  Query: Required<QueryResolvers>;
};

const Query: Required<QueryResolvers> = {
  checks: async (_parent, args, context) => {
    // Validated first, and thrown from, before anything is read. A filter that
    // fails here never reaches the query below.
    const filter = filterFromArgument(args.filter);
    const { checks, total } = await listChecks(
      context.database,
      filter,
      context.asOf,
      context.staleAfterDays,
    );
    return {
      checks,
      matching: checks.length,
      hidden: total - checks.length,
    };
  },

  check: (_parent, args, context) =>
    findCheck(context.database, args.id, context.asOf, context.staleAfterDays),

  statusCounts: async (_parent, _args, context) => {
    const totals = await countChecksByStatus(
      context.database,
      context.asOf,
      context.staleAfterDays,
    );
    return {
      proven: totals.Proven,
      unproven: totals.Unproven,
      stale: totals.Stale,
      unarmed: totals.Unarmed,
      broken: totals.Broken,
      // Summed rather than counted again, so the six numbers in one response
      // cannot disagree with each other. A second query for the total could
      // read a workspace that had changed underneath the first.
      total:
        totals.Proven +
        totals.Unproven +
        totals.Stale +
        totals.Unarmed +
        totals.Broken,
    };
  },
};

const CheckList: CheckListResolvers = {
  checks: (list) => list.checks,
  matching: (list) => list.matching,
  hidden: (list) => list.hidden,
};

const Check: CheckResolvers = {
  id: (check) => check.id,
  name: (check) => check.name,
  area: (check) => check.area,
  protects: (check) => check.protects,
  howToTellArmed: (check) => check.howToTellArmed,
  status: (check) => statusName(check.status),
  lastCaughtOn: (check) => check.lastCaughtOn,
  lastRunOn: (check) => check.lastRunOn,
  runCount: (check) => check.runCount,
  caughtCount: (check) => check.caughtCount,
  missedCount: (check) => check.missedCount,
  lastSeenArmedOn: (check) => check.lastSeenArmedOn,
  lastArmed: (check) => check.lastArmed,

  // Through the loader, so that a list of checks asking for these asks the
  // database once rather than once per check. The loader is on the context and
  // belongs to this request alone.
  runs: (check, _args, context) => context.runs.load(check.id),
  armingObservations: (check, _args, context) =>
    context.armingObservations.load(check.id),
};

const TestRun: TestRunResolvers = {
  id: (run) => run.id,
  runOn: (run) => run.runOn,
  planted: (run) => run.planted,
  expected: (run) => run.expected,
  outcome: (run) => outcomeName(run.outcome),
  note: (run) => run.note,
};

const ArmingObservation: ArmingObservationResolvers = {
  id: (observation) => observation.id,
  observedOn: (observation) => observation.observedOn,
  armed: (observation) => observation.armed,
  note: (observation) => observation.note,
};

const StatusCounts: StatusCountsResolvers = {
  proven: (counts) => counts.proven,
  unproven: (counts) => counts.unproven,
  stale: (counts) => counts.stale,
  unarmed: (counts) => counts.unarmed,
  broken: (counts) => counts.broken,
  total: (counts) => counts.total,
};

export const resolvers: CompleteResolvers = {
  Date: dateScalar,
  FilterInput: filterInputScalar,
  Query,
  CheckList,
  Check,
  TestRun,
  ArmingObservation,
  StatusCounts,
};
