import { LivePressureBattle } from '@types';
import {
  LiveDriverRef,
  LiveIncident,
  LiveStanding,
} from '../components/Live/liveFixtures';

/**
 * What a car is doing right now, as one colour.
 *
 * The live steward screen marks cars on the timing list and the track map so a
 * steward can see where to look without reading a gap column:
 *
 *   battle   green   two cars of the same class running nose-to-tail
 *   traffic  blue    two cars of different classes running nose-to-tail
 *   loss     yellow  the car has just lost control
 *   contact  red     the car has just been in contact
 *
 * A car can be several of these at once, so they are ranked: an incident that
 * has just happened outranks a fight that might become one, and a fight for
 * position outranks traffic.
 */
export type LiveCarTone = 'battle' | 'traffic' | 'loss' | 'contact';

const TONE_RANK: Record<LiveCarTone, number> = {
  traffic: 1,
  battle: 2,
  loss: 3,
  contact: 4,
};

/** How long an incident keeps its cars marked, from when it was first seen. */
export const LIVE_ALERT_WINDOW_MS = {
  loss: 10_000,
  contact: 30_000,
} as const;

export const liveCarToneLabel: Record<LiveCarTone, string> = {
  battle: 'Battle',
  traffic: 'Traffic',
  loss: 'Lost control',
  contact: 'Contact',
};

/** The theme palette key each tone is drawn in. */
export const liveCarToneColor: Record<
  LiveCarTone,
  'success' | 'info' | 'warning' | 'error'
> = {
  battle: 'success',
  traffic: 'info',
  loss: 'warning',
  contact: 'error',
};

/**
 * Every key a car can be found under, whichever record it came from.
 *
 * Two, because the three feeds this joins do not all carry the same identity:
 * a standing, a battle and an incident party each have a steam id, and each
 * *may* have a slot. The slot is the reliable one — `steamId` is 0 for every AI
 * entry and every offline session, so a whole single-player field shares it —
 * but a record without a slot still has to match one with.
 *
 * So a car is marked under its slot and, where the steam id actually identifies
 * somebody, under that as well; and it is found under either. A steam id of 0
 * or nothing is never a key, or marking one AI car would mark them all.
 */
export const liveCarKeys = (car: {
  slotId?: number;
  steamId?: string;
}): string[] => {
  const keys: string[] = [];

  if (car.slotId !== undefined) {
    keys.push(`slot:${car.slotId}`);
  }
  if (car.steamId && !/^0*$/.test(car.steamId)) {
    keys.push(`steam:${car.steamId}`);
  }

  return keys;
};

export type LiveCarTones = ReadonlyMap<string, LiveCarTone>;

const stronger = (
  a: LiveCarTone | undefined,
  b: LiveCarTone | undefined,
): LiveCarTone | undefined => {
  if (!a || !b) {
    return a ?? b;
  }
  return TONE_RANK[b] > TONE_RANK[a] ? b : a;
};

const mark = (
  tones: Map<string, LiveCarTone>,
  car: { slotId?: number; steamId?: string },
  tone: LiveCarTone,
) => {
  liveCarKeys(car).forEach((key) => {
    tones.set(key, stronger(tones.get(key), tone) as LiveCarTone);
  });
};

/** Which alert, if any, an incident of this kind raises. */
export const alertToneFor = (
  incident: Pick<LiveIncident, 'classification'>,
): 'loss' | 'contact' | undefined => {
  if (incident.classification === 'contact') {
    return 'contact';
  }
  if (incident.classification === 'loss-of-control') {
    return 'loss';
  }
  return undefined;
};

export interface LiveCarAlert {
  tone: 'loss' | 'contact';
  drivers: readonly LiveDriverRef[];
}

/**
 * Every marked car, under each of its `liveCarKeys`.
 *
 * Battles first and alerts over them, though the ranking makes the order
 * irrelevant — it is only here so the result reads top to bottom the way the
 * screen does.
 */
export const buildLiveCarTones = (
  battles: readonly LivePressureBattle[],
  alerts: readonly LiveCarAlert[],
): LiveCarTones => {
  const tones = new Map<string, LiveCarTone>();

  battles.forEach((battle) => {
    const tone: LiveCarTone = battle.isTraffic ? 'traffic' : 'battle';
    mark(
      tones,
      { slotId: battle.aheadSlotId, steamId: battle.aheadSteamId },
      tone,
    );
    mark(
      tones,
      { slotId: battle.behindSlotId, steamId: battle.behindSteamId },
      tone,
    );
  });

  alerts.forEach((alert) => {
    alert.drivers.forEach((driver) => mark(tones, driver, alert.tone));
  });

  return tones;
};

export const toneForStanding = (
  tones: LiveCarTones | undefined,
  standing: Pick<LiveStanding, 'slotId' | 'steamId'>,
): LiveCarTone | undefined =>
  tones
    ? liveCarKeys(standing).reduce<LiveCarTone | undefined>(
        (held, key) => stronger(held, tones.get(key)),
        undefined,
      )
    : undefined;
