/**
 * Track-limit points, and how many a driver may collect before the game hands
 * out a penalty.
 *
 * LMU counts track limits in *steps* and reports them to players in *points*.
 * Two session settings tie the two together, both read from the game:
 *
 *   mTrackLimitsStepsPerPenalty   steps before a penalty
 *   mTrackLimitsStepsPerPoint     steps in one point
 *
 * so the limit in points is one divided by the other. Measured on a 41-car
 * SimGrid practice server at Spa on 2026-11-15: 16 steps per penalty, 4 steps
 * per point — a limit of 4 points, counted in quarters, which is why a running
 * total reads 2.25 or 3.75.
 *
 * A capture process built before the second setting was added to its output
 * sends only the first. Four steps to the point is assumed then: it is the only
 * value that has been observed, and it matches the quarter-point totals the
 * game's own messages carry.
 */
export const DEFAULT_TRACK_LIMIT_STEPS_PER_POINT = 4;

/** The points at which a penalty is given, or undefined if the game has not said. */
export const trackLimitPointsLimit = (
  stepsPerPenalty: number | undefined,
  stepsPerPoint?: number,
): number | undefined => {
  if (!stepsPerPenalty || stepsPerPenalty <= 0) {
    return undefined;
  }

  const perPoint =
    stepsPerPoint && stepsPerPoint > 0
      ? stepsPerPoint
      : DEFAULT_TRACK_LIMIT_STEPS_PER_POINT;

  return stepsPerPenalty / perPoint;
};

/** `2.25`, `3`, `0.5` — points without padding. */
export const formatTrackLimitPoints = (points: number): string =>
  String(Math.round(points * 100) / 100);

/** `2.25 / 4`, or just `2.25` when the limit is not known. */
export const formatTrackLimitStanding = (
  points: number,
  limit: number | undefined,
): string =>
  limit === undefined
    ? formatTrackLimitPoints(points)
    : `${formatTrackLimitPoints(points)} / ${formatTrackLimitPoints(limit)}`;

/** How far to the limit, 0 to 1. Zero when the limit is not known. */
export const trackLimitProgress = (
  points: number | undefined,
  limit: number | undefined,
): number =>
  limit && limit > 0 ? Math.min(1, Math.max(0, (points ?? 0) / limit)) : 0;
