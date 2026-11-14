import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CONSTANTS } from '@constants';
import { StewardDecision } from '@types';
import { LiveShell } from './LiveShell';
import { LiveIncidents } from './LiveIncidents';
import { useApi } from '../../providers/ApiContext';
import { DEFAULT_STEWARD_ACTIONS } from '../../utils/stewardActions';
import {
  formatIncidentChatMessage,
  formatPenaltyChatMessage,
} from '../../utils/stewardChat';
import { sendMessage } from '../../utils/postMessage';
import { useLiveSessionData } from '../../hooks/useLiveSessionData';
import {
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

/** A two-car contact, so an incident-level line has two drivers to list. */
const incident = liveIncidentsFixture[0];
const [first, second] = incident.drivers;

const saveStewardDecision = jest.fn();
const setStewardChatAutosend = jest.fn();
let chatReply: ((payload: unknown) => void) | undefined;

const setApi = (over: Record<string, unknown> = {}) => {
  useApiMock.mockReturnValue({
    isConnected: true,
    hasApiStatusResponse: true,
    liveSessionStatus: { state: 'live' },
    stewardDecisions: {},
    saveStewardDecision,
    stewardAuthor: 'Connor',
    stewardActions: DEFAULT_STEWARD_ACTIONS,
    stewardAnnouncementTemplate: '',
    stewardChatAutosend: false,
    setStewardChatAutosend,
    subscribeToApiChannel: (
      channel: string,
      callback: (payload: unknown) => void,
    ) => {
      if (channel === CONSTANTS.API.POST_STEWARD_CHAT_MESSAGE) {
        chatReply = callback;
      }
      return () => {};
    },
    ...over,
  } as unknown as ReturnType<typeof useApi>);
};

beforeEach(() => {
  jest.clearAllMocks();
  chatReply = undefined;
  setApi();
  useLiveSessionDataMock.mockImplementation(
    () =>
      ({
        data: {
          status: { state: 'live', trackName: 'Bahrain', sessionType: 'RACE' },
          drivers: [],
          incidents: [],
        },
        standings: liveStandingsFixture,
        incidents: [{ ...incident, drivers: [...incident.drivers] }],
        sessionKey: 'bahrain|10|1700000000',
      }) as unknown as ReturnType<typeof useLiveSessionData>,
  );
});

const liveTree = () => (
  <MemoryRouter initialEntries={['/live/incidents']}>
    <Routes>
      <Route path="/live" element={<LiveShell />}>
        <Route path="incidents" element={<LiveIncidents />} />
      </Route>
    </Routes>
  </MemoryRouter>
);

const renderLive = () => render(liveTree());

const selectIncident = () =>
  fireEvent.click(screen.getByText(incident.timestampLabel));

const chatBox = () => screen.getByLabelText('Chat message') as HTMLInputElement;

const chatPosts = () =>
  sendMessageMock.mock.calls.filter(
    ([channel]) => channel === CONSTANTS.API.POST_STEWARD_CHAT_MESSAGE,
  );

const underInvestigation = formatIncidentChatMessage(
  'Under Investigation',
  incident.drivers,
);

describe('announcing a call in the in-game chat', () => {
  it('should queue the message in the chat box with autosend off', () => {
    renderLive();
    selectIncident();

    fireEvent.click(
      screen.getByRole('button', { name: /Under investigation/ }),
    );

    expect(chatBox().value).toBe(underInvestigation);
    expect(chatPosts()).toHaveLength(0);
  });

  it('should send the queued message when Send is pressed', () => {
    renderLive();
    selectIncident();
    fireEvent.click(
      screen.getByRole('button', { name: /Under investigation/ }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(chatPosts()).toEqual([
      [
        CONSTANTS.API.POST_STEWARD_CHAT_MESSAGE,
        { message: underInvestigation },
      ],
    ]);

    // The box empties once the game confirms that line, and not before.
    expect(chatBox().value).toBe(underInvestigation);
    act(() => {
      chatReply?.({ status: 'success', message: underInvestigation });
    });
    expect(chatBox().value).toBe('');
  });

  it('should post straight away with autosend on', () => {
    setApi({ stewardChatAutosend: true });
    renderLive();
    selectIncident();

    fireEvent.click(
      screen.getByRole('button', { name: /Under investigation/ }),
    );

    expect(chatPosts()).toEqual([
      [
        CONSTANTS.API.POST_STEWARD_CHAT_MESSAGE,
        { message: underInvestigation },
      ],
    ]);
    expect(chatBox().value).toBe('');
  });

  it('should carry the typed reason into the message', () => {
    renderLive();
    selectIncident();
    fireEvent.change(screen.getByLabelText(/Reasoning \(optional\)/i), {
      target: { value: 'Contact at T4' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: /Under investigation/ }),
    );

    expect(chatBox().value).toBe(`${underInvestigation}: Contact at T4`);
  });

  // Taking a call back is not news for the session's chat.
  it('should say nothing when a call is withdrawn', () => {
    setApi({ stewardChatAutosend: true });
    const view = renderLive();
    selectIncident();
    fireEvent.click(
      screen.getByRole('button', { name: /Under investigation/ }),
    );

    const recorded = saveStewardDecision.mock.calls[0][0] as StewardDecision;
    setApi({
      stewardChatAutosend: true,
      stewardDecisions: { [recorded.id]: recorded },
    });
    view.rerender(liveTree());
    fireEvent.click(
      screen.getByRole('button', { name: /Under investigation/ }),
    );

    expect(chatPosts()).toHaveLength(1);
  });
});

describe('resolving an incident quietly', () => {
  it('should record the incident as decided and say nothing in chat', () => {
    setApi({ stewardChatAutosend: true });
    renderLive();
    selectIncident();

    fireEvent.click(screen.getByRole('button', { name: 'Resolve quietly' }));

    const saved = saveStewardDecision.mock.calls[0][0] as StewardDecision;
    expect(saved.state).toBe('DECIDED');
    expect(saved.outcome).toBe('Resolved quietly');
    expect(saved.target).toBeUndefined();
    expect(chatPosts()).toHaveLength(0);
    expect(chatBox().value).toBe('');
  });

  it('should take the incident off the list', () => {
    const view = renderLive();
    selectIncident();
    fireEvent.click(screen.getByRole('button', { name: 'Resolve quietly' }));

    const recorded = saveStewardDecision.mock.calls[0][0] as StewardDecision;
    setApi({ stewardDecisions: { [recorded.id]: recorded } });
    view.rerender(liveTree());

    expect(screen.getByText('All 0')).toBeInTheDocument();
    expect(screen.getByText('Decided 1')).toBeInTheDocument();
  });
});

describe('the custom call', () => {
  it('should record the chosen driver, penalty and reason, and queue the line', () => {
    renderLive();
    selectIncident();

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('Custom decision driver'), {
      target: { value: second.steamId },
    });
    fireEvent.change(screen.getByLabelText('Custom decision penalty'), {
      target: { value: 'Drive Through' },
    });
    fireEvent.change(screen.getByLabelText('Custom decision reason'), {
      target: { value: 'Unsafe rejoin' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    const saved = saveStewardDecision.mock.calls[0][0] as StewardDecision;
    expect(saved.outcome).toBe('Drive Through');
    expect(saved.target?.steamId).toBe(second.steamId);
    expect(saved.reasoning).toBe('Unsafe rejoin');
    expect(chatBox().value).toBe(
      formatPenaltyChatMessage(second, 'Drive Through', 'Unsafe rejoin'),
    );
  });

  it('should offer only calls against a driver, defaulting to the first', () => {
    renderLive();
    selectIncident();
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));

    const penalty = screen.getByLabelText(
      'Custom decision penalty',
    ) as HTMLSelectElement;
    expect(Array.from(penalty.options).map((option) => option.value)).toEqual(
      DEFAULT_STEWARD_ACTIONS.filter((action) => action.driverScoped).map(
        (action) => action.label,
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    const saved = saveStewardDecision.mock.calls[0][0] as StewardDecision;
    expect(saved.target?.steamId).toBe(first.steamId);
    expect(saved.outcome).toBe('5s penalty');
  });
});

describe('the chat bar', () => {
  it('should queue the steward announcement with autosend off', () => {
    renderLive();

    fireEvent.click(screen.getByRole('button', { name: 'Announce' }));

    expect(chatBox().value).toBe(
      'Steward Connor is watching over this session',
    );
    expect(chatPosts()).toHaveLength(0);
  });

  it('should post the announcement with autosend on, using custom wording', () => {
    setApi({
      stewardChatAutosend: true,
      stewardAnnouncementTemplate: 'Race control: {steward} on duty',
    });
    renderLive();

    fireEvent.click(screen.getByRole('button', { name: 'Announce' }));

    expect(chatPosts()).toEqual([
      [
        CONSTANTS.API.POST_STEWARD_CHAT_MESSAGE,
        { message: 'Race control: Connor on duty' },
      ],
    ]);
  });

  it('should send a message the steward typed', () => {
    renderLive();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

    fireEvent.change(chatBox(), { target: { value: 'Pit lane is open' } });
    fireEvent.keyDown(chatBox(), { key: 'Enter' });

    expect(chatPosts()).toEqual([
      [
        CONSTANTS.API.POST_STEWARD_CHAT_MESSAGE,
        { message: 'Pit lane is open' },
      ],
    ]);
  });

  it('should save the autosend switch', () => {
    renderLive();

    fireEvent.click(screen.getByRole('switch', { name: 'Autosend' }));

    expect(setStewardChatAutosend).toHaveBeenCalledWith(true);
  });

  it('should show why a message was not sent, and keep it in the box', () => {
    renderLive();
    fireEvent.change(chatBox(), { target: { value: 'Pit lane is open' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    act(() => {
      chatReply?.({ status: 'error', message: 'Not sent: offline session.' });
    });

    expect(screen.getByText('Not sent: offline session.')).toBeInTheDocument();
    expect(chatBox().value).toBe('Pit lane is open');
  });
});
