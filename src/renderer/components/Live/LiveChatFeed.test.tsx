import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CONSTANTS } from '@constants';
import {
  CHAT_FEED_MAX_LINES,
  CHAT_FEED_POLL_MS,
  LiveChatFeed,
} from './LiveChatFeed';

const sendMessageMock = jest.fn();
let visibleSeconds = 15;
const CHAT_FEED_VISIBLE_MS = 15_000;
const callbacks: Record<string, (payload: unknown) => void> = {};

jest.mock('../../utils/postMessage', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}));

jest.mock('../../providers/ApiContext', () => ({
  useApi: () => ({
    liveChatFeedVisibleSeconds: visibleSeconds,
    subscribeToApiChannel: (
      channel: string,
      callback: (payload: unknown) => void,
    ) => {
      callbacks[channel] = callback;
      return () => {
        delete callbacks[channel];
      };
    },
  }),
}));

const chat = (...messages: string[]) =>
  act(() => {
    callbacks[CONSTANTS.API.GET_STEWARD_CHAT_MESSAGES]?.({
      status: 'success',
      data: messages.map((message, index) => ({
        message,
        timestamp: String(1000 + index),
      })),
    });
  });

const HISTORY = ['Old Driver: hello'];

describe('LiveChatFeed', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    sendMessageMock.mockClear();
    visibleSeconds = 15;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should keep asking the game for its chat', () => {
    render(<LiveChatFeed />);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.GET_STEWARD_CHAT_MESSAGES,
    );

    act(() => {
      jest.advanceTimersByTime(CHAT_FEED_POLL_MS);
    });
    expect(sendMessageMock).toHaveBeenCalledTimes(2);
  });

  // Arriving mid-session must not replay the last hour of chat.
  it('should show nothing that was already in the chat', () => {
    render(<LiveChatFeed />);

    chat(...HISTORY);

    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });

  it('should show a new message, once', () => {
    render(<LiveChatFeed />);
    chat(...HISTORY);

    chat(...HISTORY, 'T Lorioli: sorry about that');
    chat(...HISTORY, 'T Lorioli: sorry about that');

    expect(screen.getAllByText('sorry about that')).toHaveLength(1);
    expect(screen.getByText('T Lorioli')).toBeInTheDocument();
    expect(screen.queryByText('hello')).not.toBeInTheDocument();
  });

  it('should let a message go after a while', () => {
    render(<LiveChatFeed />);
    chat(...HISTORY);
    chat(...HISTORY, 'T Lorioli: sorry about that');

    act(() => {
      jest.advanceTimersByTime(CHAT_FEED_VISIBLE_MS - 2000);
    });
    expect(screen.getByText('sorry about that')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });

  it('should use the display time from settings', () => {
    visibleSeconds = 5;
    render(<LiveChatFeed />);
    chat(...HISTORY);
    chat(...HISTORY, 'T Lorioli: sorry about that');

    act(() => {
      jest.advanceTimersByTime(6000);
    });

    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });

  // 0 is "no time limit": a message stays until newer ones push it off.
  it('should never time a message out when the display time is 0', () => {
    visibleSeconds = 0;
    render(<LiveChatFeed />);
    chat(...HISTORY);
    chat(...HISTORY, 'T Lorioli: sorry about that');

    act(() => {
      jest.advanceTimersByTime(10 * 60 * 1000);
    });
    expect(screen.getByText('sorry about that')).toBeInTheDocument();

    const burst = Array.from(
      { length: CHAT_FEED_MAX_LINES },
      (_unused, index) => `Driver ${index}: message ${index}`,
    );
    chat(...HISTORY, 'T Lorioli: sorry about that', ...burst);

    expect(screen.queryByText('sorry about that')).not.toBeInTheDocument();
    expect(screen.getByRole('log').children).toHaveLength(CHAT_FEED_MAX_LINES);
  });

  it('should keep only the newest few lines', () => {
    render(<LiveChatFeed />);
    chat(...HISTORY);

    const burst = Array.from(
      { length: CHAT_FEED_MAX_LINES + 2 },
      (_unused, index) => `Driver ${index}: message ${index}`,
    );
    chat(...HISTORY, ...burst);

    expect(screen.getByRole('log').children).toHaveLength(CHAT_FEED_MAX_LINES);
    expect(screen.queryByText('message 0')).not.toBeInTheDocument();
    expect(screen.getByText(`message ${burst.length - 1}`)).toBeInTheDocument();
  });

  it('should highlight a steward line and dim the rest', () => {
    render(<LiveChatFeed />);
    chat(...HISTORY);

    chat(
      ...HISTORY,
      'Connor Bell: [Steward] B. Drake #7: 5s penalty',
      'T Lorioli: fair enough',
    );

    expect(
      screen
        .getByText('[Steward] B. Drake #7: 5s penalty')
        .closest('[data-steward]'),
    ).toHaveAttribute('data-steward', 'true');
    expect(
      screen.getByText('fair enough').closest('[data-steward]'),
    ).toHaveAttribute('data-steward', 'false');
  });

  // The announcement and typed messages carry no tag, but the app sent them.
  it('should highlight a line this app sent, tag or no tag', () => {
    render(<LiveChatFeed />);
    chat(...HISTORY);
    act(() => {
      callbacks[CONSTANTS.API.POST_STEWARD_CHAT_MESSAGE]?.({
        status: 'success',
        message: 'Steward Connor is watching over this session',
      });
    });

    chat(
      ...HISTORY,
      'Connor Bell: Steward Connor is watching over this session',
    );

    expect(
      screen
        .getByText('Steward Connor is watching over this session')
        .closest('[data-steward]'),
    ).toHaveAttribute('data-steward', 'true');
  });
});
