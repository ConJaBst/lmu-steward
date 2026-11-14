import { LivePressureBattle } from '@types';
import { LiveDriverRef } from '../components/Live/liveFixtures';
import {
  alertToneFor,
  buildLiveCarTones,
  liveCarKeys,
  toneForStanding,
} from './liveCarTones';
import {
  DEFAULT_AUTO_REPLAY_MIN_MAGNITUDE,
  pickAutoReplayIncident,
  resolveAutoReplayMinMagnitude,
} from './liveAutoReplay';

const battle = (
  over: Partial<LivePressureBattle> & {
    aheadSteamId: string;
    behindSteamId: string;
  },
): LivePressureBattle => ({
  id: `${over.aheadSteamId}-${over.behindSteamId}`,
  gapSeconds: 0.4,
  closingSpeedKph: 5,
  isTraffic: false,
  ...over,
});

const driver = (steamId: string, slotId?: number): LiveDriverRef => ({
  steamId,
  slotId,
  displayName: `Driver ${steamId}`,
  carNumber: '1',
  carClass: 'HY',
});

describe('liveCarKeys', () => {
  it('should key a car on its slot and its steam id', () => {
    expect(liveCarKeys({ slotId: 4, steamId: '765' })).toEqual([
      'slot:4',
      'steam:765',
    ]);
  });

  // Every AI entry reports steam id 0: keying on it would mark the whole field.
  it('should never key a car on a steam id of zero', () => {
    expect(liveCarKeys({ slotId: 4, steamId: '0' })).toEqual(['slot:4']);
    expect(liveCarKeys({ steamId: '0' })).toEqual([]);
    expect(liveCarKeys({ steamId: '' })).toEqual([]);
  });
});

describe('buildLiveCarTones', () => {
  it('should mark a same-class pair as a battle and a mixed pair as traffic', () => {
    const tones = buildLiveCarTones(
      [
        battle({ aheadSteamId: 'a', behindSteamId: 'b' }),
        battle({ aheadSteamId: 'c', behindSteamId: 'd', isTraffic: true }),
      ],
      [],
    );

    expect(toneForStanding(tones, { steamId: 'a' })).toBe('battle');
    expect(toneForStanding(tones, { steamId: 'b' })).toBe('battle');
    expect(toneForStanding(tones, { steamId: 'c' })).toBe('traffic');
    expect(toneForStanding(tones, { steamId: 'd' })).toBe('traffic');
    expect(toneForStanding(tones, { steamId: 'e' })).toBeUndefined();
  });

  // A fight for position matters more than the traffic the same car is in.
  it('should prefer a battle to traffic for a car in both', () => {
    const tones = buildLiveCarTones(
      [
        battle({ aheadSteamId: 'a', behindSteamId: 'b', isTraffic: true }),
        battle({ aheadSteamId: 'b', behindSteamId: 'c' }),
      ],
      [],
    );

    expect(toneForStanding(tones, { steamId: 'b' })).toBe('battle');
    expect(toneForStanding(tones, { steamId: 'a' })).toBe('traffic');
  });

  it('should put an incident over a battle, and contact over a loss', () => {
    const tones = buildLiveCarTones(
      [battle({ aheadSteamId: 'a', behindSteamId: 'b' })],
      [
        { tone: 'loss', drivers: [driver('a'), driver('b')] },
        { tone: 'contact', drivers: [driver('b')] },
      ],
    );

    expect(toneForStanding(tones, { steamId: 'a' })).toBe('loss');
    expect(toneForStanding(tones, { steamId: 'b' })).toBe('contact');
  });

  // The feeds do not all carry a slot; a record without one still has to match.
  it('should match a car marked by slot to a row that only has a steam id', () => {
    const tones = buildLiveCarTones(
      [],
      [{ tone: 'contact', drivers: [driver('765', 9)] }],
    );

    expect(toneForStanding(tones, { steamId: '765' })).toBe('contact');
    expect(toneForStanding(tones, { slotId: 9, steamId: '0' })).toBe('contact');
  });

  it('should mark one AI car without marking the rest of the field', () => {
    const tones = buildLiveCarTones(
      [],
      [{ tone: 'contact', drivers: [driver('0', 3)] }],
    );

    expect(toneForStanding(tones, { slotId: 3, steamId: '0' })).toBe('contact');
    expect(toneForStanding(tones, { slotId: 4, steamId: '0' })).toBeUndefined();
  });
});

describe('alertToneFor', () => {
  it('should raise an alert for contact and loss of control only', () => {
    expect(alertToneFor({ classification: 'contact' })).toBe('contact');
    expect(alertToneFor({ classification: 'loss-of-control' })).toBe('loss');
    expect(alertToneFor({ classification: 'track-limits' })).toBeUndefined();
    expect(alertToneFor({ classification: 'blue-flag' })).toBeUndefined();
  });
});

describe('auto replay', () => {
  it('should resolve the threshold to a usable number', () => {
    expect(resolveAutoReplayMinMagnitude(350)).toBe(350);
    expect(resolveAutoReplayMinMagnitude('500')).toBe(500);
    expect(resolveAutoReplayMinMagnitude(0)).toBe(0);
    expect(resolveAutoReplayMinMagnitude('')).toBe(
      DEFAULT_AUTO_REPLAY_MIN_MAGNITUDE,
    );
    expect(resolveAutoReplayMinMagnitude(undefined)).toBe(
      DEFAULT_AUTO_REPLAY_MIN_MAGNITUDE,
    );
    expect(resolveAutoReplayMinMagnitude(-5)).toBe(
      DEFAULT_AUTO_REPLAY_MIN_MAGNITUDE,
    );
    expect(resolveAutoReplayMinMagnitude('abc')).toBe(
      DEFAULT_AUTO_REPLAY_MIN_MAGNITUDE,
    );
  });

  it('should pick the heaviest new incident at or over the threshold', () => {
    const incidents = [
      { id: 'light', contactMagnitude: 150 },
      { id: 'edge', contactMagnitude: 200 },
      { id: 'heavy', contactMagnitude: 900 },
      { id: 'none' },
    ] as unknown as Parameters<typeof pickAutoReplayIncident>[0];

    expect(pickAutoReplayIncident(incidents, 200)?.id).toBe('heavy');
    expect(pickAutoReplayIncident(incidents.slice(0, 2), 200)?.id).toBe('edge');
    expect(pickAutoReplayIncident(incidents.slice(0, 1), 200)).toBeUndefined();
  });

  // No force, no answer to a question about force — even at a threshold of 0.
  it('should never pick an incident with no magnitude', () => {
    const incidents = [{ id: 'none' }] as unknown as Parameters<
      typeof pickAutoReplayIncident
    >[0];

    expect(pickAutoReplayIncident(incidents, 0)).toBeUndefined();
  });
});
