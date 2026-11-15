import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LiveTrackLimits } from './LiveTrackLimits';
import {
  LiveStanding,
  liveStandingsFixture,
} from '../../components/Live/liveFixtures';

const onFocusCar = jest.fn();
let standings: LiveStanding[] = [];
let limit: number | undefined = 4;

jest.mock('../../providers/LiveSessionContext', () => ({
  useLiveSession: () => ({
    standings,
    session: { trackLimitPointsLimit: limit },
    onFocusCar,
  }),
}));

const withPoints = (points: (number | undefined)[]): LiveStanding[] =>
  liveStandingsFixture.slice(0, points.length).map((row, index) => ({
    ...row,
    slotId: index,
    position: index + 1,
    trackLimitPoints: points[index],
    trackLimitStrikes: points[index] ? 1 : 0,
  }));

const order = () =>
  screen
    .getAllByTestId(/^track-limits-row-/)
    .map((row) => row.getAttribute('data-testid'));

beforeEach(() => {
  jest.clearAllMocks();
  limit = 4;
  standings = withPoints([1, 3.75, undefined, 2.25]);
});

describe('LiveTrackLimits', () => {
  // The driver about to get a penalty is the top row.
  it('should list every driver, closest to a penalty first', () => {
    render(<LiveTrackLimits />);

    expect(order()).toEqual([
      'track-limits-row-1',
      'track-limits-row-3',
      'track-limits-row-0',
      'track-limits-row-2',
    ]);
  });

  it('should show points out of the limit and what is left', () => {
    render(<LiveTrackLimits />);

    expect(screen.getByText('Penalty at 4 points')).toBeInTheDocument();
    expect(screen.getByText('3.75 / 4')).toBeInTheDocument();
    expect(screen.getByText('2.25 / 4')).toBeInTheDocument();
    // 4 - 3.75
    expect(screen.getByText('0.25')).toBeInTheDocument();
    expect(screen.getByText('3 drivers on points')).toBeInTheDocument();
  });

  it('should show the points alone when the game has not given a limit', () => {
    limit = undefined;
    render(<LiveTrackLimits />);

    expect(screen.getByText('Penalty limit not reported')).toBeInTheDocument();
    expect(screen.getByText('3.75')).toBeInTheDocument();
    expect(screen.queryByText('3.75 / 4')).not.toBeInTheDocument();
  });

  it('should point the camera at a driver when their row is clicked', () => {
    render(<LiveTrackLimits />);

    fireEvent.click(screen.getByTestId('track-limits-row-1'));

    expect(onFocusCar).toHaveBeenCalledWith(1);
  });
});
