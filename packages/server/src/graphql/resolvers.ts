import {
  countChecksByStatus,
  findCheck,
  listChecks,
} from '../database/checks.ts';
import type { CheckRecord } from '../database/checks.ts';
import {
  parseNewArmingObservation,
  parseNewCheck,
  parseNewTestRun,
} from '../database/new-records.ts';
import type { RecordIssue } from '../database/new-records.ts';
import {
  insertArmingObservation,
  insertCheck,
  insertTestRun,
} from '../database/writes.ts';
import type { RequestContext } from './context.ts';
import { dateScalar } from './date.ts';
import { outcomeFromName, outcomeName, statusName } from './enums.ts';
import { filterFromArgument, filterInputScalar } from './filter-input.ts';
import type {
  ArmingObservationRecordedResolvers,
  ArmingObservationResolvers,
  ArmingObservationResultResolvers,
  CheckListResolvers,
  CheckResolvers,
  CheckResultResolvers,
  FieldErrorResolvers,
  MutationResolvers,
  QueryResolvers,
  Resolvers,
  StatusCountsResolvers,
  TestRunLoggedResolvers,
  TestRunResolvers,
  TestRunResultResolvers,
  ValidationErrors as ValidationErrorsResult,
  ValidationErrorsResolvers,
} from './generated/resolvers.ts';

/**
 * Every field in the schema, resolved.
 *
 * "Every" is the type's doing rather than a promise made here. The generated
 * resolver types are produced with optionals switched off, so a field added to
 * the schema and left out of this file fails the type check rather than
 * returning null to whoever asks for it first. The one gap the generator leaves
 * is the root query and mutation, whose fields it makes optional so that a large
 * API can be assembled from several files; this one is not large, so the type
 * below closes that gap by hand and the same rule holds all the way down.
 *
 * Most of what follows is a field reading the value of the same name off the
 * row behind it. Written out rather than left to the default resolver, because
 * the default is invisible: a row that stopped carrying a field would resolve
 * to null and nothing would say so, whereas the explicit version stops
 * compiling. The fields that are not a plain read are the interesting ones and
 * they stand out by being longer: the writes, the two enums that change
 * spelling, and the two lists that go through a loader.
 */

/** The resolver map, with the root fields required as well. */
type CompleteResolvers = Omit<Resolvers, 'Query' | 'Mutation'> & {
  Query: Required<QueryResolvers>;
  Mutation: Required<MutationResolvers>;
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

/** A refusal, as the ValidationErrors member of a mutation's result. */
function refused(errors: readonly RecordIssue[]): ValidationErrorsResult {
  return { errors: [...errors] };
}

/**
 * The check a write was made against, read back after the write.
 *
 * Read afterwards and in a statement of its own, because the status is derived
 * from the rows and the row that changes it has only just been added. A form's
 * success card can then say what the check reads now rather than what it read
 * before.
 *
 * Nothing deletes a check, and the write that got here has just proved this one
 * exists, so a check that cannot be read back is a fault in this server rather
 * than an answer to give.
 */
async function checkAfterWrite(
  context: RequestContext,
  id: string,
): Promise<CheckRecord> {
  const check = await findCheck(
    context.database,
    id,
    context.asOf,
    context.staleAfterDays,
  );
  if (check === null) {
    throw new Error(`The check ${id} was written to and then not found.`);
  }
  return check;
}

/**
 * The three writes.
 *
 * Each one has the same order and it is the point of the file: the input goes
 * through its parse function, and a refusal is answered before the database is
 * asked anything. Only then is the row inserted, and the insert can still be
 * refused for the three reasons only the database knows. Either kind of refusal
 * comes back as ValidationErrors in the data rather than as an error, so a form
 * shows it beside the field it names.
 *
 * Today, for the rule that a day is not in the future, is the day the request
 * reads statuses as of. It is fixed once per request, so the rule and the
 * status on the returned check are read on the same day.
 */
const Mutation: Required<MutationResolvers> = {
  createCheck: async (_parent, args, context) => {
    const parsed = parseNewCheck(args.input);
    if (!parsed.ok) {
      return refused(parsed.errors);
    }

    const written = await insertCheck(context.database, parsed.value);
    if (!written.ok) {
      return refused(written.errors);
    }
    return checkAfterWrite(context, written.row.id);
  },

  logTestRun: async (_parent, args, context) => {
    const parsed = parseNewTestRun(
      { ...args.input, outcome: outcomeFromName(args.input.outcome) },
      context.asOf,
    );
    if (!parsed.ok) {
      return refused(parsed.errors);
    }

    const written = await insertTestRun(context.database, parsed.value);
    if (!written.ok) {
      return refused(written.errors);
    }
    return {
      testRun: written.row,
      check: await checkAfterWrite(context, written.row.checkId),
    };
  },

  recordArmingObservation: async (_parent, args, context) => {
    const parsed = parseNewArmingObservation(args.input, context.asOf);
    if (!parsed.ok) {
      return refused(parsed.errors);
    }

    const written = await insertArmingObservation(
      context.database,
      parsed.value,
    );
    if (!written.ok) {
      return refused(written.errors);
    }
    return {
      armingObservation: written.row,
      check: await checkAfterWrite(context, written.row.checkId),
    };
  },
};

/**
 * Which member of a result a resolver returned.
 *
 * A refusal is the only member with an errors list, so that is what tells the
 * two apart. It is asked of the value rather than stamped on it, so neither
 * member has to carry a type name the rows behind it know nothing about.
 */
const CheckResult: CheckResultResolvers = {
  __resolveType: (result) =>
    'errors' in result ? 'ValidationErrors' : 'Check',
};

const TestRunResult: TestRunResultResolvers = {
  __resolveType: (result) =>
    'errors' in result ? 'ValidationErrors' : 'TestRunLogged',
};

const ArmingObservationResult: ArmingObservationResultResolvers = {
  __resolveType: (result) =>
    'errors' in result ? 'ValidationErrors' : 'ArmingObservationRecorded',
};

const TestRunLogged: TestRunLoggedResolvers = {
  testRun: (logged) => logged.testRun,
  check: (logged) => logged.check,
};

const ArmingObservationRecorded: ArmingObservationRecordedResolvers = {
  armingObservation: (recorded) => recorded.armingObservation,
  check: (recorded) => recorded.check,
};

const ValidationErrors: ValidationErrorsResolvers = {
  errors: (refusal) => refusal.errors,
};

const FieldError: FieldErrorResolvers = {
  path: (error) => error.path,
  message: (error) => error.message,
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
  Mutation,
  CheckList,
  Check,
  TestRun,
  ArmingObservation,
  StatusCounts,
  CheckResult,
  TestRunResult,
  ArmingObservationResult,
  TestRunLogged,
  ArmingObservationRecorded,
  ValidationErrors,
  FieldError,
};
