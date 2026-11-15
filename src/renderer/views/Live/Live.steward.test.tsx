import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CONSTANTS } from '@constants';
import { LivePressureBattle } from '@types';
import { LiveShell } from './LiveShell';
import { LiveSteward } from './LiveSteward';
import { useApi } from '../../providers/ApiContext';
import { DEFAULT_STEWARD_ACTIONS } from '../../utils/stewardActions';
import { sendMessage } from '../../utils/postMessage';
import { useLiveSessionData } from '../../hooks/useLiveSessionData';
import {
  LiveIncident,
  LiveStanding,
  liveIncidentsFixture,
  liveStandingsFixture,
} from '../../components/Live/liveFixtures';

jest.mock('../../providers/ApiContext', () => ({ useApi: jest.fn() }));
jest.mock('../../hooks/useLiveSessionData', () => ({
  ...jest.requireActual('../../hooks/useLiveSessionData'),
  useLiveSessionData: jest.fn(),
}));
jest.mock('../../utils/postMessage', () => ({ sendMessage: jest.fn() }));

const useApiMock = useApi as jest.MockedFunction<typeof useApi>;
const useLiveSessionDataMock = useLiveSessionData as jest.MockedFunction<
  typeof useLiveSessionData
>;
const sendMessageMock = sendMessage as jest.MockedFunction<typeof sendMessage>;

/** The fixture field with slots, as a real session's standings carry. */
const standings: LiveStanding[] = liveStandingsFixture.map((row, index) => ({
  ...row,
  slotId: index,
}));
const [first, second, third, fourth, fifth] = standings;

const party = (row: LiveStanding) => ({
  steamId: row.steamId,
  slotId: row.slotId,
  displayName: row.displayName,
  carNumber: row.carNumber,
  carClass: row.carClass,
});

const incidentBetween = (
  id: string,
  over: Partial<LiveIncident> = {},
): LiveIncident => ({
  ...liveIncidentsFixture[0],
  id,
  timestampLabel: `T-${id}`,
  classification: 'contact',
  contactMagnitude: 900,
  drivers: [party(first), party(second)],
  state: 'NEW',
  decision: undefined,
  ...over,
});

const pairing = (
  ahead: LiveStanding,
  behind: LiveStanding,
  isTraffic: boolean,
): LivePressureBattle => ({
  id: `${ahead.slotId}-${behind.slotId}`,
  aheadSteamId: ahead.steamId,
  behindSteamId: behind.steamId,
  aheadSlotId: ahead.slotId,
  behindSlotId: behind.slotId,
  gapSeconds: 0.4,
  closingSpeedKph: 4,
  isTraffic,
});

let incidents: LiveIncident[] = [];
let battles: LivePressureBattle[] = [];

const setApi = (over: Record<string, unknown> = {}) => {
  useApiMock.mockReturnValue({
    isConnected: true,
    hasApiStatusResponse: true,
    liveSessionStatus: { state: 'live' },
    stewardDecisions: {},
    saveStewardDecision: jest.fn(),
    stewardAuthor: 'Connor',
    stewardActions: DEFAULT_STEWARD_ACTIONS,
    stewardAnnouncementTemplate: '',
    stewardChatAutosend: false,
    setStewardChatAutosend: jest.fn(),
    liveAutoReplayMinMagnitude: 200,
    subscribeToApiChannel: () => () => {},
    ...over,
  } as unknown as ReturnType<typeof useApi>);
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  incidents = [];
  battles = [];
  setApi();
  useLiveSessionDataMock.mockImplementation(
    () =>
      ({
        data: {
          status: { state: 'live', trackName: 'Bahrain', sessionType: 'RACE' },
          drivers: [],
          incidents: [],
          battles,
        },
        standings,
        incidents,
        sessionKey: 'bahrain|10|1700000000',
      }) as unknown as ReturnType<typeof useLiveSessionData>,
  );
});

afterEach(() => {
  jest.useRealTimers();
});

const tree = () => (
  <MemoryRouter initialEntries={['/live/steward']}>
    <Routes>
      <Route path="/live" element={<LiveShell />}>
        <Route path="steward" element={<LiveSteward />} />
      </Route>
    </Routes>
  </MemoryRouter>
);

const toneOf = (row: LiveStanding) =>
  screen
    .getByTestId(`steward-timing-row-${row.slotId}`)
    .getAttribute('data-tone');

const rewatches = () =>
  sendMessageMock.mock.calls.filter(
    ([channel]) => channel === CONSTANTS.API.POST_REPLAY_REWATCH,
  );

describe('the live steward screen', () => {
  it('should show timing and the map while no incident is open', () => {
    incidents = [incidentBetween('a')];
    render(tree());

    expect(
      screen.getByRole('table', { name: 'Live steward timing' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Triage Queue')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Back to timing and map/ }),
    ).not.toBeInTheDocument();
  });

  it('should swap to the dossier for a selected incident, and back', () => {
    incidents = [incidentBetween('a')];
    render(tree());

    fireEvent.click(screen.getByText('T-a'));

    expect(
      screen.queryByRole('table', { name: 'Live steward timing' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Resolve quietly' }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Back to timing and map/ }),
    );

    expect(
      screen.getByRole('table', { name: 'Live steward timing' }),
    ).toBeInTheDocument();
  });
});

describe('marking cars on the timing list', () => {
  it('should mark a same-class battle and traffic differently', () => {
    battles = [pairing(first, second, false), pairing(third, fourth, true)];
    render(tree());

    expect(toneOf(first)).toBe('battle');
    expect(toneOf(second)).toBe('battle');
    expect(toneOf(third)).toBe('traffic');
    expect(toneOf(fourth)).toBe('traffic');
    expect(toneOf(fifth)).toBe('none');
  });

  // Arriving mid-race must not light up every car that has ever had contact.
  it('should not mark incidents that were already there on arrival', () => {
    incidents = [incidentBetween('old')];
    render(tree());

    expect(toneOf(first)).toBe('none');
  });

  it('should mark both cars in a new contact for thirty seconds', () => {
    const view = render(tree());

    incidents = [incidentBetween('new')];
    view.rerender(tree());

    expect(toneOf(first)).toBe('contact');
    expect(toneOf(second)).toBe('contact');

    act(() => {
      jest.advanceTimersByTime(29_000);
    });
    expect(toneOf(first)).toBe('contact');

    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(toneOf(first)).toBe('none');
    expect(toneOf(second)).toBe('none');
  });

  it('should mark a loss of control for ten seconds', () => {
    const view = render(tree());

    incidents = [
      incidentBetween('spin', {
        classification: 'loss-of-control',
        contactMagnitude: undefined,
        drivers: [party(third)],
      }),
    ];
    view.rerender(tree());

    expect(toneOf(third)).toBe('loss');

    act(() => {
      jest.advanceTimersByTime(9_000);
    });
    expect(toneOf(third)).toBe('loss');

    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(toneOf(third)).toBe('none');
  });

  it('should show contact over the battle the same car is in', () => {
    battles = [pairing(first, second, false)];
    const view = render(tree());

    incidents = [incidentBetween('new')];
    view.rerender(tree());

    expect(toneOf(first)).toBe('contact');
  });
});

describe('auto replay', () => {
  const turnOn = () =>
    fireEvent.click(screen.getByRole('switch', { name: 'Auto replay' }));

  it('should do nothing while it is off', () => {
    const view = render(tree());

    incidents = [incidentBetween('new')];
    view.rerender(tree());

    expect(rewatches()).toHaveLength(0);
    expect(
      screen.getByRole('table', { name: 'Live steward timing' }),
    ).toBeInTheDocument();
  });

  it('should open and rewind to a new incident over the threshold', () => {
    const view = render(tree());
    turnOn();

    incidents = [incidentBetween('new', { contactMagnitude: 900 })];
    view.rerender(tree());

    expect(rewatches()).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: /Back to timing and map/ }),
    ).toBeInTheDocument();
  });

  it('should leave a lighter incident in the list', () => {
    const view = render(tree());
    turnOn();

    incidents = [incidentBetween('new', { contactMagnitude: 150 })];
    view.rerender(tree());

    expect(rewatches()).toHaveLength(0);
  });

  it('should use the threshold from settings', () => {
    setApi({ liveAutoReplayMinMagnitude: 100 });
    const view = render(tree());
    turnOn();

    incidents = [incidentBetween('new', { contactMagnitude: 150 })];
    view.rerender(tree());

    expect(rewatches()).toHaveLength(1);
  });

  // Switching it on must not replay the session so far.
  it('should not replay incidents that were already in the queue', () => {
    incidents = [incidentBetween('old')];
    const view = render(tree());
    turnOn();
    view.rerender(tree());

    expect(rewatches()).toHaveLength(0);
  });

  // Never pull the picture away from an incident already being reviewed.
  it('should not interrupt an incident that is already open', () => {
    incidents = [incidentBetween('open')];
    const view = render(tree());
    turnOn();
    fireEvent.click(screen.getByText('T-open'));

    incidents = [incidentBetween('open'), incidentBetween('new')];
    view.rerender(tree());

    expect(rewatches()).toHaveLength(0);
  });
});

describe('the auto replay queue', () => {
  const turnOn = () =>
    fireEvent.click(screen.getByRole('switch', { name: 'Auto replay' }));

  const returnsToLive = () =>
    sendMessageMock.mock.calls.filter(
      ([channel]) => channel === CONSTANTS.API.POST_REPLAY_RETURN_TO_LIVE,
    );

  const box = () => screen.getByRole('region', { name: 'Auto replay' });

  it('should queue an incident that arrives during a replay, and say so', () => {
    const view = render(tree());
    turnOn();

    incidents = [incidentBetween('one')];
    view.rerender(tree());
    expect(rewatches()).toHaveLength(1);
    expect(box()).toHaveTextContent('Replaying T-one');

    incidents = [incidentBetween('one'), incidentBetween('two')];
    view.rerender(tree());

    // Still on the first: it has not been looked at for ten seconds yet.
    expect(rewatches()).toHaveLength(1);
    expect(box()).toHaveTextContent(/Next in \d+s: T-two/);
  });

  it('should move to the queued incident once ten seconds are up', () => {
    const view = render(tree());
    turnOn();
    incidents = [incidentBetween('one')];
    view.rerender(tree());
    incidents = [incidentBetween('one'), incidentBetween('two')];
    view.rerender(tree());

    act(() => {
      jest.advanceTimersByTime(9_000);
    });
    expect(rewatches()).toHaveLength(1);

    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(rewatches()).toHaveLength(2);
    expect(box()).toHaveTextContent('Replaying T-two');
  });

  // Past ten seconds the replay has been looked at, so there is no wait.
  it('should move straight to an incident that arrives after ten seconds', () => {
    const view = render(tree());
    turnOn();
    incidents = [incidentBetween('one')];
    view.rerender(tree());

    act(() => {
      jest.advanceTimersByTime(12_000);
    });

    incidents = [incidentBetween('one'), incidentBetween('two')];
    view.rerender(tree());

    expect(rewatches()).toHaveLength(2);
  });

  it('should go back to live after twenty seconds with nothing waiting', () => {
    const view = render(tree());
    turnOn();
    incidents = [incidentBetween('one')];
    view.rerender(tree());
    expect(box()).toHaveTextContent(/Back to live in \d+s/);

    act(() => {
      jest.advanceTimersByTime(19_000);
    });
    expect(returnsToLive()).toHaveLength(0);

    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(returnsToLive()).toHaveLength(1);
    // The dossier it opened closes with it.
    expect(
      screen.getByRole('table', { name: 'Live steward timing' }),
    ).toBeInTheDocument();
  });

  // An incident the steward opened themselves is theirs; the queue waits.
  it('should wait for the steward, then start when they are done', () => {
    incidents = [incidentBetween('open')];
    const view = render(tree());
    turnOn();
    fireEvent.click(screen.getByText('T-open'));

    incidents = [incidentBetween('open'), incidentBetween('new')];
    view.rerender(tree());

    expect(rewatches()).toHaveLength(0);
    expect(box()).toHaveTextContent('Waiting for you to finish');
    expect(box()).toHaveTextContent('Next: T-new');

    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(rewatches()).toHaveLength(0);

    fireEvent.click(
      screen.getByRole('button', { name: /Back to timing and map/ }),
    );

    expect(rewatches()).toHaveLength(1);
  });

  it('should drop the queue when it is switched off', () => {
    const view = render(tree());
    turnOn();
    incidents = [incidentBetween('one')];
    view.rerender(tree());
    incidents = [incidentBetween('one'), incidentBetween('two')];
    view.rerender(tree());

    turnOn(); // off again

    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(rewatches()).toHaveLength(1);
    expect(returnsToLive()).toHaveLength(0);
  });
});

describe('auto replay staying near the present', () => {
  const turnOn = () =>
    fireEvent.click(screen.getByRole('switch', { name: 'Auto replay' }));
  const box = () => screen.getByRole('region', { name: 'Auto replay' });
  const selected = () =>
    screen
      .getAllByText(/^T-/)
      .map((row) => row.textContent)
      .filter(Boolean);

  // Arrival order, not race time: the last to show up is the next shown,
  // even when its timestamp says it happened earlier.
  it('should show the most recent arrival next, whatever its race time', () => {
    const view = render(tree());
    turnOn();
    incidents = [incidentBetween('one', { etSeconds: 500 })];
    view.rerender(tree());

    incidents = [...incidents, incidentBetween('two', { etSeconds: 900 })];
    view.rerender(tree());
    incidents = [...incidents, incidentBetween('three', { etSeconds: 100 })];
    view.rerender(tree());

    expect(box()).toHaveTextContent(/Next in \d+s: T-three/);
    expect(box()).toHaveTextContent('(+1 more)');

    act(() => {
      jest.advanceTimersByTime(11_000);
    });
    expect(box()).toHaveTextContent('Replaying T-three');
    expect(selected()).toContain('T-three');
  });

  // A backlog must not turn into replays of things from minutes ago.
  it('should drop an incident that has waited too long', () => {
    incidents = [incidentBetween('open')];
    const view = render(tree());
    turnOn();
    fireEvent.click(screen.getByText('T-open'));

    incidents = [incidentBetween('open'), incidentBetween('late')];
    view.rerender(tree());
    expect(box()).toHaveTextContent('Next: T-late');

    act(() => {
      jest.advanceTimersByTime(50_000);
    });
    fireEvent.click(
      screen.getByRole('button', { name: /Back to timing and map/ }),
    );

    expect(rewatches()).toHaveLength(0);
    expect(box()).not.toHaveTextContent('T-late');
  });

  // Whatever was listed before the reset is history, not a new arrival.
  it('should still pick up a new incident after the queue was cleared', () => {
    const view = render(tree());
    turnOn();
    incidents = [incidentBetween('one')];
    view.rerender(tree());

    turnOn(); // off
    turnOn(); // on again
    // The dossier it opened is the steward's now; close it to be idle again.
    fireEvent.click(
      screen.getByRole('button', { name: /Back to timing and map/ }),
    );

    incidents = [incidentBetween('one'), incidentBetween('two')];
    view.rerender(tree());

    expect(rewatches()).toHaveLength(2);
    expect(box()).toHaveTextContent('Replaying T-two');
  });
});
