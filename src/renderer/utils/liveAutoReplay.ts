import { LiveIncident } from '../components/Live/liveFixtures';

/**
 * Auto replay: taking the game's picture to an incident as it happens.
 *
 * Only for contact heavy enough to be worth interrupting for. Magnitude is an
 * LMU-internal number with no unit; 200 is the shipped floor and the steward
 * can move it in settings.
 */
export const DEFAULT_AUTO_REPLAY_MIN_MAGNITUDE = 200;

export const MAX_AUTO_REPLAY_MIN_MAGNITUDE = 100_000;

/** The stored threshold as a usable number, whatever settings hold. */
export const resolveAutoReplayMinMagnitude = (value: unknown): number => {
  const parsed =
    typeof value === 'string' && value.trim() === '' ? NaN : Number(value);

  return Number.isFinite(parsed) && parsed >= 0
    ? Math.min(Math.round(parsed), MAX_AUTO_REPLAY_MIN_MAGNITUDE)
    : DEFAULT_AUTO_REPLAY_MIN_MAGNITUDE;
};

/**
 * The incident auto replay should go to, out of those that have just arrived.
 *
 * The heaviest one at or over the threshold. An incident with no magnitude —
 * a track-limit element, a spin with no contact — never qualifies: the
 * threshold is a question about force, and those have none to answer with.
 */
export const pickAutoReplayIncident = (
  fresh: readonly LiveIncident[],
  minMagnitude: number,
): LiveIncident | undefined =>
  fresh
    .filter(
      (incident) =>
        incident.contactMagnitude !== undefined &&
        incident.contactMagnitude >= minMagnitude,
    )
    .sort((a, b) => (b.contactMagnitude ?? 0) - (a.contactMagnitude ?? 0))[0];
