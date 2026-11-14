import { useCallback, useEffect, useRef, useState } from 'react';
import { LiveIncident } from '../components/Live/liveFixtures';

/** A replay counts as looked at after this long, and can then be replaced. */
export const AUTO_REPLAY_LOOKED_AT_MS = 10_000;

/** With nothing else waiting, the picture goes back to live after this long. */
export const AUTO_REPLAY_RETURN_TO_LIVE_MS = 20_000;

/**
 * How long an incident may wait before it is no longer worth replaying.
 *
 * Counted on the wall clock from when it arrived. Without a limit a busy race
 * fills the queue faster than ten seconds a replay can empty it, and auto
 * replay drifts into showing things that happened minutes ago.
 */
export const AUTO_REPLAY_STALE_MS = 45_000;

interface Args {
  enabled: boolean;
  incidents: readonly LiveIncident[];
  minMagnitude: number;
  /** Whether a replay can be driven at all right now. */
  canReplay: boolean;
  /**
   * Which list of incidents this is. When it changes — another session, or a
   * finished segment opened to read back — the list has been swapped, not
   * added to, so nothing in the new one counts as having just arrived.
   */
  listKey: string;
  /**
   * Counts the times the picture has been sent back to live. A change that
   * auto replay did not cause itself is the steward pressing Live, which
   * clears the queue.
   */
  returnToLiveCount: number;
  selectedIncidentId?: string;
  /** Null while the game has not said yet, which is treated as not active. */
  isReplayActive?: boolean | null;
  onSelectIncident: (incidentId: string) => void;
  onClearSelectedIncident: () => void;
  onRewatchIncident: (incidentId: string) => void;
  onReturnToLive: () => void;
}

export interface LiveAutoReplayState {
  /** The incident auto replay is showing now. */
  current?: LiveIncident;
  /** Whole seconds the current replay has been showing. */
  elapsedSeconds: number;
  /** The incident that will be shown next, if one is waiting. */
  next?: LiveIncident;
  /** How many more are waiting behind `next`. */
  queuedBehindNext: number;
  /**
   * Whole seconds until something happens by itself: the next replay starting,
   * or the picture going back to live. Absent when nothing is counting down —
   * auto replay is idle, or it is waiting on the steward.
   */
  secondsUntilNext?: number;
}

interface Waiting {
  id: string;
  arrivedAt: number;
}

const qualifies = (incident: LiveIncident, minMagnitude: number): boolean =>
  incident.contactMagnitude !== undefined &&
  incident.contactMagnitude >= minMagnitude;

/**
 * Auto replay: takes the game's picture to heavy incidents as they happen, and
 * hands it back when there are no more.
 *
 * **Everything here runs on arrival, never on race time.** An incident is new
 * because it was not in the list a moment ago, and it is ordered by when it
 * showed up. Its elapsed-time stamp is not consulted: sorting on it is what
 * made an earlier version work through a backlog oldest-first and fall further
 * behind the race with every replay.
 *
 * The cycle:
 *
 *   - A new incident at or over the magnitude threshold starts waiting.
 *   - With nothing showing, the most recent arrival opens and the game rewinds
 *     to it.
 *   - After ten seconds that replay counts as looked at. If anything is
 *     waiting, the most recent arrival takes over — at the ten-second mark, or
 *     the moment it arrives if that is later.
 *   - If nothing else has arrived by twenty seconds, the picture goes back to
 *     live and the dossier closes.
 *
 * Most recent first, and anything that has waited more than
 * `AUTO_REPLAY_STALE_MS` is dropped unseen. Both exist to keep the picture
 * near the present. A dropped incident is still in the triage queue.
 *
 * The queue is cleared — and anything already listed stops counting as new —
 * when auto replay is switched off, when the steward sends the picture back to
 * live themselves (the app's Live button or the game's own), and when the
 * incident list is swapped for another session's.
 *
 * It never takes the picture away from an incident the steward opened
 * themselves: while they have their own incident open, or the game is showing
 * a replay auto replay did not start, new incidents wait.
 */
export const useLiveAutoReplay = ({
  enabled,
  incidents,
  minMagnitude,
  canReplay,
  listKey,
  returnToLiveCount,
  selectedIncidentId,
  isReplayActive,
  onSelectIncident,
  onClearSelectedIncident,
  onRewatchIncident,
  onReturnToLive,
}: Args): LiveAutoReplayState => {
  const seen = useRef<Set<string> | null>(null);
  // The list as of this render, for `reset` to read without depending on it.
  const listRef = useRef(incidents);
  listRef.current = incidents;
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const [current, setCurrent] = useState<
    { id: string; startedAt: number } | undefined
  >(undefined);
  // Moves once a second while there is something to count; drives the cycle.
  const [now, setNow] = useState(() => Date.now());

  // Whether the game has been seen in replay since `current` started.
  const sawReplayActive = useRef(false);
  // Set just before auto replay sends the picture to live itself.
  const returningItself = useRef(false);

  /** Forget everything, and treat whatever is listed now as already seen. */
  const reset = useCallback(() => {
    /*
      Seeded here rather than left for the next change to the list. Leaving it
      empty would make the very next incident to arrive the baseline instead of
      the first thing shown.
    */
    seen.current = new Set(listRef.current.map((entry) => entry.id));
    sawReplayActive.current = false;
    setWaiting((held) => (held.length > 0 ? [] : held));
    setCurrent(undefined);
  }, []);

  // Off, or a different list of incidents: start clean.
  useEffect(() => {
    reset();
  }, [enabled, listKey, reset]);

  /*
    The steward pressed Live. Whatever was waiting was waiting to interrupt a
    picture they have just asked for, so it goes; the dossier auto replay opened
    goes with it. Auto replay's own return to live arrives here too, flagged, and
    has already tidied up after itself.
  */
  const lastReturnCount = useRef(returnToLiveCount);
  useEffect(() => {
    if (lastReturnCount.current === returnToLiveCount) {
      return;
    }
    lastReturnCount.current = returnToLiveCount;

    if (returningItself.current) {
      returningItself.current = false;
      return;
    }
    if (current && selectedIncidentId === current.id) {
      onClearSelectedIncident();
    }
    reset();
  }, [
    current,
    onClearSelectedIncident,
    reset,
    returnToLiveCount,
    selectedIncidentId,
  ]);

  // New incidents over the threshold start waiting, stamped with now.
  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (seen.current === null) {
      seen.current = new Set(incidents.map((entry) => entry.id));
      return;
    }

    const known = seen.current;
    const fresh = incidents.filter((entry) => !known.has(entry.id));
    if (fresh.length === 0) {
      return;
    }
    fresh.forEach((entry) => known.add(entry.id));

    const arrivedAt = Date.now();
    const wanted = fresh
      .filter((entry) => qualifies(entry, minMagnitude))
      .map((entry) => ({ id: entry.id, arrivedAt }));
    if (wanted.length > 0) {
      setWaiting((held) => [...held, ...wanted]);
    }
  }, [enabled, incidents, minMagnitude]);

  const busy = Boolean(current) || waiting.length > 0;
  useEffect(() => {
    if (!enabled || !busy) {
      return undefined;
    }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [busy, enabled]);

  /** What is still worth showing: listed, and not waiting too long. */
  const usable = useCallback(
    (held: Waiting[]): Waiting[] => {
      const listed = new Set(incidents.map((entry) => entry.id));
      const cutoff = Date.now() - AUTO_REPLAY_STALE_MS;
      return held.filter(
        (entry) => listed.has(entry.id) && entry.arrivedAt > cutoff,
      );
    },
    [incidents],
  );

  const startNext = useCallback(() => {
    const live = usable(waiting);
    // The most recent arrival. Ties — one poll delivering several — go to the
    // one listed last, which is the last one the capture pushed.
    const pick = live[live.length - 1];

    if (!pick) {
      if (waiting.length > 0) {
        setWaiting([]);
      }
      return;
    }

    sawReplayActive.current = false;
    setWaiting(live.slice(0, -1));
    setCurrent({ id: pick.id, startedAt: Date.now() });
    onSelectIncident(pick.id);
    onRewatchIncident(pick.id);
  }, [onRewatchIncident, onSelectIncident, usable, waiting]);

  // The cycle itself. Re-run on every tick and on anything it reads changing.
  useEffect(() => {
    if (!enabled || !canReplay) {
      return;
    }

    if (current) {
      // The steward moved on by themselves: let go, and leave them to it.
      if (selectedIncidentId !== current.id) {
        setCurrent(undefined);
        return;
      }

      /*
        The game's own LIVE button. The app is not told about that press, only
        that a replay it started is no longer showing — which can only be
        trusted once the replay has actually been seen showing, since the
        reading lags the command by a poll or two.
      */
      if (isReplayActive) {
        sawReplayActive.current = true;
      } else if (sawReplayActive.current && isReplayActive === false) {
        onClearSelectedIncident();
        reset();
        return;
      }

      const elapsed = Date.now() - current.startedAt;

      if (usable(waiting).length > 0) {
        if (elapsed >= AUTO_REPLAY_LOOKED_AT_MS) {
          startNext();
        }
        return;
      }

      if (elapsed >= AUTO_REPLAY_RETURN_TO_LIVE_MS) {
        returningItself.current = true;
        setCurrent(undefined);
        setWaiting((held) => (held.length > 0 ? [] : held));
        onReturnToLive();
        onClearSelectedIncident();
      }
      return;
    }

    // Idle. Start only if the steward is not in the middle of something.
    if (waiting.length > 0 && !selectedIncidentId && !isReplayActive) {
      startNext();
    }
  }, [
    canReplay,
    current,
    enabled,
    isReplayActive,
    now,
    onClearSelectedIncident,
    onReturnToLive,
    reset,
    selectedIncidentId,
    startNext,
    usable,
    waiting,
  ]);

  const byId = (id: string | undefined) =>
    id ? incidents.find((entry) => entry.id === id) : undefined;
  const currentIncident = byId(current?.id);
  const cutoff = now - AUTO_REPLAY_STALE_MS;
  const stillWaiting = waiting
    .filter((entry) => entry.arrivedAt > cutoff)
    .map((entry) => byId(entry.id))
    .filter((entry): entry is LiveIncident => Boolean(entry));
  const elapsedMs = current ? Math.max(0, now - current.startedAt) : 0;

  let secondsUntilNext: number | undefined;
  if (current) {
    const target =
      stillWaiting.length > 0
        ? AUTO_REPLAY_LOOKED_AT_MS
        : AUTO_REPLAY_RETURN_TO_LIVE_MS;
    secondsUntilNext = Math.max(0, Math.ceil((target - elapsedMs) / 1000));
  }

  return {
    current: currentIncident,
    elapsedSeconds: Math.floor(elapsedMs / 1000),
    // Most recent arrival first, the order they will be shown in.
    next: stillWaiting[stillWaiting.length - 1],
    queuedBehindNext: Math.max(0, stillWaiting.length - 1),
    secondsUntilNext,
  };
};
