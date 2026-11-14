import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LiveShell } from './LiveShell';
import { LiveOverview } from './LiveOverview';
import { LiveIncidents } from './LiveIncidents';
import { useApi } from '../../providers/ApiContext';
import { useLiveSessionData } from '../../hooks/useLiveSessionData';
import { liveIncidentsFixture } from '../../components/Live/liveFixtures';

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

// The layout fixture covers five classifications across seven incidents, which
// is what makes it worth filtering.
const trackLimits = liveIncidentsFixture.find(
  (incident) => incident.classification === 'track-limits',
)!;
const aContact = liveIncidentsFixture.find(
  (incident) => incident.classification === 'contact',
)!;

const pollResult = () => ({
  data: {
    status: {
      state: 'live' as const,
      trackName: 'Bahrain',
      sessionType: 'RACE' as const,
    },
    drivers: [],
    incidents: [],
  },
  standings: [],
  // Fresh identities, same content — exactly what a poll produces.
  incidents: liveIncidentsFixture.map((incident) => ({ ...incident })),
  sessionKey: 'bahrain|10|1700000000',
});

beforeEach(() => {
  jest.clearAllMocks();
  useApiMock.mockReturnValue({
    isConnected: true,
    hasApiStatusResponse: true,
    liveSessionStatus: { state: 'live' },
    stewardDecisions: {},
    saveStewardDecision: jest.fn(),
    subscribeToApiChannel: jest.fn(),
  } as unknown as ReturnType<typeof useApi>);
  useLiveSessionDataMock.mockImplementation(
    () => pollResult() as unknown as ReturnType<typeof useLiveSessionData>,
  );
});

const liveRoutes = () => (
  <Routes>
    <Route path="/live" element={<LiveShell />}>
      <Route index element={<LiveOverview />} />
      <Route path="incidents" element={<LiveIncidents />} />
    </Route>
  </Routes>
);

const renderLive = () =>
  render(
    <MemoryRouter initialEntries={['/live/incidents']}>
      {liveRoutes()}
    </MemoryRouter>,
  );

/** The chip row, scoped away from the identical labels on the queue rows. */
const typeFilter = (label: string) =>
  within(screen.getByRole('group', { name: 'Incident type' })).getByText(label);

describe('live incident quick filters', () => {
  // A chip is a switch for its own kind: clicking it takes that kind out.
  it('should take one classification out of the queue', () => {
    renderLive();
    expect(screen.getByText(trackLimits.timestampLabel)).toBeInTheDocument();

    fireEvent.click(typeFilter('Track Limits'));

    expect(
      screen.queryByText(trackLimits.timestampLabel),
    ).not.toBeInTheDocument();
    expect(screen.getByText(aContact.timestampLabel)).toBeInTheDocument();
    expect(
      screen.getByText(`All ${liveIncidentsFixture.length - 1}`),
    ).toBeInTheDocument();
  });

  // Any number of kinds can be out at once, which one-of-many could not do.
  it('should take several classifications out together', () => {
    renderLive();

    fireEvent.click(typeFilter('Track Limits'));
    fireEvent.click(typeFilter('Contact'));

    expect(
      screen.queryByText(trackLimits.timestampLabel),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(aContact.timestampLabel)).not.toBeInTheDocument();
  });

  it('should clear the filter when the active chip is clicked again', () => {
    renderLive();

    fireEvent.click(typeFilter('Track Limits'));
    fireEvent.click(typeFilter('Track Limits'));

    expect(screen.getByText(aContact.timestampLabel)).toBeInTheDocument();
    expect(
      screen.getByText(`All ${liveIncidentsFixture.length}`),
    ).toBeInTheDocument();
  });

  /*
    Filter state lives in the provider, not the view. A steward who narrows to
    one driver's contacts, checks the overview and comes back has not changed
    their mind about what they were looking at.
  */
  it('should survive a section change', () => {
    renderLive();

    fireEvent.click(typeFilter('Track Limits'));

    fireEvent.click(screen.getByText('Overview'));
    expect(screen.getByText('Needs Attention')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Incidents'));

    expect(
      screen.getByText(`All ${liveIncidentsFixture.length - 1}`),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(trackLimits.timestampLabel),
    ).not.toBeInTheDocument();
  });

  it('should say so when the filters, not the session, emptied the queue', () => {
    renderLive();

    // Every kind the session produced, switched off one by one.
    within(screen.getByRole('group', { name: 'Incident type' }))
      .getAllByRole('button')
      .filter((chip) => chip.textContent !== 'All')
      .forEach((chip) => fireEvent.click(chip));

    expect(
      screen.getByText(new RegExp(`${liveIncidentsFixture.length} hidden`)),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Clear filters/ }));

    expect(screen.getByText(aContact.timestampLabel)).toBeInTheDocument();
  });
});
