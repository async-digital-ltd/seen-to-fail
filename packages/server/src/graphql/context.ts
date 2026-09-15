import {
  listArmingObservationsForChecks,
  listRunsForChecks,
} from '../database/checks.ts';
import type {
  ArmingObservation,
  IsoDate,
  Queryable,
  TestRun,
} from '../database/rows.ts';
import { todayInUtc } from '../day.ts';
import { STALE_AFTER_DAYS } from '../staleness.ts';
import { createLoader, groupByCheck } from './loader.ts';
import type { Loader } from './loader.ts';

/**
 * What every resolver in one request is given.
 *
 * The day is fixed here, once, at the start of the request. A status is a
 * reading of the record as of a day, so a request that asked the clock again
 * halfway through could put two fields of the same response on different days,
 * and the one place that is guaranteed to happen is the one night a year nobody
 * is watching. Fixing it here also makes the whole API testable against a
 * pinned day without any resolver knowing that is what is going on.
 *
 * The loaders are here for the same reason they are built per request: they
 * batch within one response and remember nothing beyond it.
 */
export interface RequestContext {
  /** Where the reads go. A pool in the server, one connection in a test. */
  readonly database: Queryable;
  /** The day every status in this response is read as of. */
  readonly asOf: IsoDate;
  /** How old a catch may be and still count as recent. */
  readonly staleAfterDays: number;
  /** Runs for a check, batched across every check in the response. */
  readonly runs: Loader<string, TestRun[]>;
  /** Arming observations for a check, batched the same way. */
  readonly armingObservations: Loader<string, ArmingObservation[]>;
}

export interface RequestContextOptions {
  readonly database: Queryable;
  /**
   * The day to read as of. Defaults to today, which is what the running server
   * wants; a test passes the day its fixtures were dated back from so that the
   * two cannot fall either side of midnight.
   */
  readonly asOf?: IsoDate;
  /**
   * The staleness threshold. Defaults to the one the application runs on, so a
   * caller states it only to ask a different question.
   */
  readonly staleAfterDays?: number;
}

/** Everything one request needs, built fresh for that request. */
export function createRequestContext(
  options: RequestContextOptions,
): RequestContext {
  const { database } = options;

  return {
    database,
    asOf: options.asOf ?? todayInUtc(),
    staleAfterDays: options.staleAfterDays ?? STALE_AFTER_DAYS,
    runs: createLoader(
      async (checkIds) =>
        groupByCheck(await listRunsForChecks(database, checkIds)),
      () => [],
    ),
    armingObservations: createLoader(
      async (checkIds) =>
        groupByCheck(await listArmingObservationsForChecks(database, checkIds)),
      () => [],
    ),
  };
}
