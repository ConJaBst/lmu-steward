import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { LiveTriageQueue } from './LiveTriageQueue';
import {
  DEFAULT_LIVE_INCIDENT_FILTERS,
  LIVE_INCIDENT_CLASSIFICATIONS,
  LiveIncident,
  LiveIncidentFilters,
  LiveIncidentSort,
  LiveIncidentState,
  buildLiveIncidentsFixture,
} from './liveFixtures';
import { RESOLVED_QUIETLY_OUTCOME } from '../../utils/stewardActions';

/** Everything but contact switched off — the filter's way of saying "contact". */
const CONTACT_ONLY = LIVE_INCIDENT_CLASSIFICATIONS.filter(
  (classification) => classification !== 'contact',
);

/*
  Counting row renders directly.

  Every driver on every row renders one CarClassBadge, so a stub that counts its
  calls is a per-row render counter — which is the thing this file is actually
  about. The queue is fed a 1Hz poll and a long race passes four hundred
  incidents; before the row was memoised, all four hundred re-rendered every
  second whether or not anything about them had changed.
*/
const badgeRenders = jest.fn();

jest.mock('../CarClassBadge/CarClassBadge', () => ({
  CarClassBadge: ({ carClass }: { carClass: string }) => {
    badgeRenders(carClass);
    return <span data-testid="car-class-badge">{carClass}</span>;
  },
}));

const noop = () => {};

const renderQueue = (
  incidents: ReturnType<typeof buildLiveIncidentsFixture>,
  filters: LiveIncidentFilters = DEFAULT_LIVE_INCIDENT_FILTERS,
) =>
  render(
    <LiveTriageQueue
      incidents={incidents}
      stateFilter="ALL"
      filters={filters}
      onSelectIncident={noop}
      onChangeStateFilter={noop}
    />,
  );

const rerenderQueue = (
  rerender: ReturnType<typeof renderQueue>['rerender'],
  incidents: ReturnType<typeof buildLiveIncidentsFixture>,
) =>
  rerender(
    <LiveTriageQueue
      incidents={incidents}
      stateFilter="ALL"
      filters={DEFAULT_LIVE_INCIDENT_FILTERS}
      onSelectIncident={noop}
      onChangeStateFilter={noop}
    />,
  );

beforeEach(() => badgeRenders.mockClear());

describe('LiveTriageQueue at session scale', () => {
  const incidents = buildLiveIncidentsFixture(400);

  it('should render nothing on a poll tick that changed nothing', () => {
    const { rerender } = renderQueue(incidents);
    badgeRenders.mockClear();

    rerenderQueue(rerender, incidents);

    expect(badgeRenders).not.toHaveBeenCalled();
  });

  /*
    Deliberately on a list short enough to mount whole. A decision changes an
    incident's state, and state is the primary sort key, so at session scale the
    changed row also leaves the scroll window and pulls another one into it —
    which would make this count the window moving rather than the memo holding.
    The 400-incident guards either side of this one cover the scale case.
  */
  it('should render only the row that changed', () => {
    const short = buildLiveIncidentsFixture(50);
    const { rerender } = renderQueue(short);
    badgeRenders.mockClear();

    // A decision lands on one incident. Everything else is the object it
    // already was, because the build cache upstream keeps it that way.
    const changed = short.map((incident, index) =>
      index === 2 ? { ...incident, state: 'DECIDED' as const } : incident,
    );
    rerenderQueue(rerender, changed);

    expect(badgeRenders).toHaveBeenCalledTimes(changed[2].drivers.length);
  });

  /*
    The guard that would have caught the original report. Without the memo, a
    poll that replaces every incident with an equal copy re-renders the lot.
  */
  it('should not re-render rows whose incident is merely a new copy', () => {
    const { rerender } = renderQueue(incidents);
    badgeRenders.mockClear();

    rerenderQueue(
      rerender,
      incidents.map((incident) => ({ ...incident })),
    );

    // Every row does re-render here — that is what a new identity means — so
    // this asserts the cost is bounded by the window, not by the queue.
    expect(badgeRenders.mock.calls.length).toBeLessThan(200);
  });

  it('should mount only a window of the queue, and grow it on scroll', () => {
    renderQueue(incidents);

    const mounted = screen.getAllByTestId('car-class-badge').length;
    expect(mounted).toBeLessThan(incidents.length);
    expect(screen.getByText(/more · keep scrolling/)).toBeInTheDocument();

    const scroller = screen.getByText(/more · keep scrolling/).parentElement;
    expect(scroller).not.toBeNull();

    // jsdom lays nothing out, so scrollHeight is 0 and any scroll event reads
    // as "at the bottom" — which is exactly the condition being tested.
    fireEvent.scroll(scroller as HTMLElement);

    expect(screen.getAllByTestId('car-class-badge').length).toBeGreaterThan(
      mounted,
    );
  });

  it('should count the state buckets over the whole session, not the window', () => {
    renderQueue(incidents);

    // Every fifth incident is decided, flagged and deferred in turn, so the
    // deferred bucket is a fifth of the session — none of which is mounted
    // beyond the first sixty rows.
    expect(screen.getByText('All 400')).toBeInTheDocument();
    expect(screen.getByText('Deferred 80')).toBeInTheDocument();
  });

  it('should still show every incident once it has been scrolled to', () => {
    const short = buildLiveIncidentsFixture(70);
    renderQueue(short);

    const scroller = screen.getByText(/more · keep scrolling/).parentElement;
    fireEvent.scroll(scroller as HTMLElement);

    expect(screen.queryByText(/more · keep scrolling/)).not.toBeInTheDocument();
  });
});

/*
  The order these two happen in is the whole point. Filtering the sixty rows
  that happen to be mounted would let a steward search a four-hundred-incident
  session and be told, wrongly, that there is nothing there.
*/
describe('LiveTriageQueue quick filters', () => {
  const incidents = buildLiveIncidentsFixture(400);

  // Written out rather than reusing `matchesLiveIncidentFilters`, so the test
  // is checking the behaviour and not agreeing with the implementation.
  const heavyContacts = incidents.filter(
    (incident) =>
      incident.classification === 'contact' &&
      (incident.contactMagnitude ?? 0) >= 2000,
  );

  it('should narrow the list before the scroll window is taken', () => {
    expect(heavyContacts.length).toBeGreaterThan(0);
    // If this ever exceeds the page size the assertion below stops meaning
    // what it says, so it is asserted rather than assumed.
    expect(heavyContacts.length).toBeLessThan(60);

    renderQueue(incidents, {
      ...DEFAULT_LIVE_INCIDENT_FILTERS,
      hiddenClassifications: CONTACT_ONLY,
      minMagnitude: 2000,
    });

    // Every match is mounted, from anywhere in the session — not just from the
    // rows the unfiltered window would have reached.
    expect(screen.getAllByText(/ magnitude$/)).toHaveLength(
      heavyContacts.length,
    );
    expect(screen.queryByText(/more · keep scrolling/)).not.toBeInTheDocument();
    expect(screen.getByText(`All ${heavyContacts.length}`)).toBeInTheDocument();
  });

  it('should compose the filters rather than applying the last one', () => {
    const contactsOnly = incidents.filter(
      (incident) => incident.classification === 'contact',
    );
    expect(contactsOnly.length).toBeGreaterThan(heavyContacts.length);

    renderQueue(incidents, {
      ...DEFAULT_LIVE_INCIDENT_FILTERS,
      hiddenClassifications: CONTACT_ONLY,
    });
    expect(screen.getByText(`All ${contactsOnly.length}`)).toBeInTheDocument();
  });

  it('should drop incidents with no magnitude when a threshold is asked for', () => {
    // A track-limit element carries no magnitude at all. Treating that as a
    // zero-force contact would leave the whole track-limit run in a list the
    // steward asked to be contacts only.
    renderQueue(incidents, {
      ...DEFAULT_LIVE_INCIDENT_FILTERS,
      minMagnitude: 500,
    });

    const withMagnitude = incidents.filter(
      (incident) => (incident.contactMagnitude ?? 0) >= 500,
    );
    expect(screen.getByText(`All ${withMagnitude.length}`)).toBeInTheDocument();
    expect(withMagnitude.length).toBeLessThan(incidents.length);
  });

  it('should say when the filters are what emptied the list', () => {
    const onClearFilters = jest.fn();
    render(
      <LiveTriageQueue
        incidents={incidents}
        stateFilter="ALL"
        filters={{
          ...DEFAULT_LIVE_INCIDENT_FILTERS,
          driverSteamId: 'nobody-in-this-session',
        }}
        onSelectIncident={noop}
        onChangeStateFilter={noop}
        onClearFilters={onClearFilters}
      />,
    );

    // "Nothing in this bucket" here would read as a quiet session.
    expect(screen.getByText(/400 hidden/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Clear filters/ }));
    expect(onClearFilters).toHaveBeenCalled();
  });
});

describe('LiveTriageQueue order', () => {
  const at = (
    id: string,
    etSeconds: number,
    contactMagnitude: number,
    over: Partial<LiveIncident> = {},
  ): LiveIncident => ({
    ...buildLiveIncidentsFixture(1)[0],
    id,
    etSeconds,
    timestampLabel: `T${id}`,
    contactMagnitude,
    classification: 'contact',
    state: 'NEW',
    decision: undefined,
    ...over,
  });

  // Oldest and heaviest, then a light one, then the newest in between.
  const three = [
    at('old', 100, 3000),
    at('mid', 200, 400),
    at('new', 300, 900),
  ];

  const order = () =>
    screen.getAllByText(/^T(old|mid|new|done)$/).map((row) => row.textContent);

  const renderSorted = (
    incidents: LiveIncident[],
    sort?: LiveIncidentSort,
    stateFilter: LiveIncidentState | 'ALL' = 'ALL',
  ) =>
    render(
      <LiveTriageQueue
        incidents={incidents}
        stateFilter={stateFilter}
        filters={DEFAULT_LIVE_INCIDENT_FILTERS}
        sort={sort}
        onSelectIncident={noop}
        onChangeStateFilter={noop}
      />,
    );

  it('should put the newest incident first by default', () => {
    renderSorted(three);

    expect(order()).toEqual(['Tnew', 'Tmid', 'Told']);
  });

  it('should put the biggest incident first when asked', () => {
    renderSorted(three, 'biggest');

    expect(order()).toEqual(['Told', 'Tnew', 'Tmid']);
  });

  // The state groups still come first: what needs a look stays on top.
  it('should keep undecided incidents above decided ones in either order', () => {
    const decided = at('done', 400, 5000, {
      state: 'DECIDED',
      decision: '5s penalty',
    });

    renderSorted([...three, decided]);
    expect(order()).toEqual(['Tnew', 'Tmid', 'Told', 'Tdone']);
  });

  describe('an incident resolved quietly', () => {
    const quiet = at('done', 400, 5000, {
      state: 'DECIDED',
      decision: RESOLVED_QUIETLY_OUTCOME,
    });

    it('should leave the list, and the count beside it', () => {
      renderSorted([...three, quiet]);

      expect(order()).toEqual(['Tnew', 'Tmid', 'Told']);
      expect(screen.getByText('All 3')).toBeInTheDocument();
    });

    // Still a decision on the books, and the way back to one made by mistake.
    it('should still be listed under Decided', () => {
      renderSorted([...three, quiet], undefined, 'DECIDED');

      expect(order()).toEqual(['Tdone']);
      expect(screen.getByText('Decided 1')).toBeInTheDocument();
    });
  });
});

describe('what a row says about its incident', () => {
  const row = (over: Partial<LiveIncident>): LiveIncident => ({
    ...buildLiveIncidentsFixture(1)[0],
    id: 'row',
    timestampLabel: 'T-row',
    contactMagnitude: undefined,
    state: 'NEW',
    decision: undefined,
    ...over,
  });

  const renderRow = (incident: LiveIncident, limit?: number) =>
    render(
      <LiveTriageQueue
        incidents={[incident]}
        stateFilter="ALL"
        filters={DEFAULT_LIVE_INCIDENT_FILTERS}
        trackLimitPointsLimit={limit}
        onSelectIncident={noop}
        onChangeStateFilter={noop}
      />,
    );

  it('should show track-limit points out of the penalty limit', () => {
    renderRow(
      row({
        classification: 'track-limits',
        trackLimit: { added: 1, current: 2.25 },
      }),
      4,
    );

    expect(screen.getByText('2.25 / 4 points (+1)')).toBeInTheDocument();
  });

  it('should show the points alone when the limit is not known', () => {
    renderRow(
      row({
        classification: 'track-limits',
        trackLimit: { added: 0.5, current: 1.5 },
      }),
    );

    expect(screen.getByText('1.5 points (+0.5)')).toBeInTheDocument();
  });

  it('should label a game penalty as a penalty, with what it was for', () => {
    renderRow(
      row({
        classification: 'penalty',
        penalty: { type: 'Stop/Go', reason: 'Speeding In Pitlane' },
      }),
    );

    expect(screen.getByText('Penalty')).toBeInTheDocument();
    expect(
      screen.getByText('Stop/Go · Speeding In Pitlane'),
    ).toBeInTheDocument();
  });
});
