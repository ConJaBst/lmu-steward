import { useRef } from 'react';
import { LiveStanding } from '../components/Live/liveFixtures';
import { liveCarKeys } from '../utils/liveCarTones';

export interface LivePenaltyRecord {
  /** Penalties the game says this driver still has to serve, right now. */
  active: number;
  /** How many have come off the count since this app started watching. */
  cleared: number;
}

export type LivePenaltyHistory = ReadonlyMap<string, LivePenaltyRecord>;

/** One key per car: the slot where there is one, else the steam id. */
export const livePenaltyKey = (car: {
  slotId?: number;
  steamId?: string;
}): string => liveCarKeys(car)[0] ?? `steam:${car.steamId ?? ''}`;

/**
 * Kept outside React, per session, so the history survives the steward leaving
 * the live screen and coming back. The provider that feeds it is unmounted on
 * the way out; a history that reset on every visit would forget every penalty
 * already served.
 */
const store = new Map<string, Map<string, { last: number; cleared: number }>>();

/** For tests: forget everything. */
export const resetLivePenaltyHistory = (): void => store.clear();

/**
 * Who has a penalty to serve, and who has had one.
 *
 * The live feed carries one number per driver — how many penalties the game is
 * still making them serve — and no history. So the history is built here, by
 * watching that number: when it goes down, a penalty has come off, and it is
 * counted.
 *
 * Two limits follow from that and are worth knowing:
 *
 *   - "Cleared" means the count went down. Served in the pits and removed by a
 *     steward look identical from here.
 *   - Only what happens while the app is watching is seen. A penalty given and
 *     served before the live screen was first opened this session left no trace.
 *
 * The returned map is the same object from one call to the next unless a number
 * actually changed, so a poll that changed nothing re-renders nothing.
 */
export const useLivePenaltyHistory = (
  sessionKey: string,
  standings: readonly LiveStanding[],
): LivePenaltyHistory => {
  const previous = useRef<{ key: string; history: LivePenaltyHistory }>({
    key: '',
    history: new Map(),
  });

  let session = store.get(sessionKey);
  if (!session) {
    session = new Map();
    store.set(sessionKey, session);
  }

  let changed = previous.current.key !== sessionKey;

  standings.forEach((standing) => {
    const key = livePenaltyKey(standing);
    const now = Math.max(0, standing.outstandingPenalties ?? 0);
    const held = session.get(key);

    if (!held) {
      session.set(key, { last: now, cleared: 0 });
      changed = changed || now > 0;
      return;
    }
    if (held.last === now) {
      return;
    }

    session.set(key, {
      last: now,
      cleared: held.cleared + Math.max(0, held.last - now),
    });
    changed = true;
  });

  if (changed) {
    previous.current = {
      key: sessionKey,
      history: new Map(
        [...session.entries()].map(([key, record]) => [
          key,
          { active: record.last, cleared: record.cleared },
        ]),
      ),
    };
  }

  return previous.current.history;
};
