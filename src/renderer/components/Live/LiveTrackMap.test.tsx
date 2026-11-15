import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LiveTrackMap } from './LiveTrackMap';
import { LiveStanding, liveStandingsFixture } from './liveFixtures';
import { buildLiveCarTones } from '../../utils/liveCarTones';

/** A closed loop of world points, long enough to survive the outline builder. */
const RACING_LINE = Array.from({ length: 48 }, (_unused, index) => {
  const angle = (index / 48) * Math.PI * 2;
  return {
    type: 0,
    x: Number((400 * Math.cos(angle)).toFixed(2)),
    y: 0,
    z: Number((400 * Math.sin(angle)).toFixed(2)),
  };
});

/** Three cars on the loop, each with a slot. */
const standings: LiveStanding[] = liveStandingsFixture
  .slice(0, 3)
  .map((row, index) => ({
    ...row,
    slotId: index,
    posX: [400, -400, 0][index],
    posZ: [0, 0, 400][index],
  }));
const [hit, battling, untouched] = standings;

const party = (row: LiveStanding) => ({
  steamId: row.steamId,
  slotId: row.slotId,
  displayName: row.displayName,
  carNumber: row.carNumber,
  carClass: row.carClass,
});

const renderMap = (tones?: ReturnType<typeof buildLiveCarTones>) =>
  render(
    <LiveTrackMap
      points={RACING_LINE as never}
      pitPoints={[]}
      state="ready"
      visibleStandings={standings}
      classFilter="ALL"
      tones={tones}
      onFocusCar={() => {}}
    />,
  );

const marker = (row: LiveStanding) =>
  screen.getByTestId(`track-map-car-${row.steamId}`);

describe('LiveTrackMap car marks', () => {
  it('should mark nothing when it is given no tones', () => {
    renderMap();

    standings.forEach((row) =>
      expect(marker(row)).toHaveAttribute('data-tone', 'none'),
    );
    expect(document.querySelectorAll('.live-alert-flash')).toHaveLength(0);
  });

  // Two seconds of flashing, then solid: the class carries a finite animation.
  it('should flash the car in a new contact, ring and fill', () => {
    renderMap(
      buildLiveCarTones([], [{ tone: 'contact', drivers: [party(hit)] }]),
    );

    expect(marker(hit)).toHaveAttribute('data-tone', 'contact');
    expect(marker(hit).querySelectorAll('.live-alert-flash')).toHaveLength(2);
    expect(
      marker(untouched).querySelectorAll('.live-alert-flash'),
    ).toHaveLength(0);
  });

  it('should flash a loss of control too', () => {
    renderMap(buildLiveCarTones([], [{ tone: 'loss', drivers: [party(hit)] }]));

    expect(marker(hit)).toHaveAttribute('data-tone', 'loss');
    expect(marker(hit).querySelectorAll('.live-alert-flash')).toHaveLength(2);
  });

  // Running close is not an incident: a steady ring, nothing flashing.
  it('should ring a battling car without flashing it', () => {
    renderMap(
      buildLiveCarTones(
        [
          {
            id: 'b',
            aheadSteamId: battling.steamId,
            behindSteamId: untouched.steamId,
            aheadSlotId: battling.slotId,
            behindSlotId: untouched.slotId,
            gapSeconds: 0.3,
            closingSpeedKph: 2,
            isTraffic: false,
          },
        ],
        [],
      ),
    );

    expect(marker(battling)).toHaveAttribute('data-tone', 'battle');
    expect(marker(battling).querySelectorAll('.live-alert-flash')).toHaveLength(
      0,
    );
  });
});
