/**
 * @jest-environment node
 */
import { CONSTANTS } from '@constants';
import {
  MAX_STEWARD_CHAT_LENGTH,
  getStewardChatMessages,
  postStewardChatMessage,
  toStewardChatLine,
} from './steward-chat';

const sessionInfoResponse = (serverPort: unknown, serverName = '') => ({
  ok: true,
  json: async () => ({ serverName, serverPort }),
});

const createEvent = () =>
  ({ reply: jest.fn() }) as unknown as Electron.IpcMainEvent & {
    reply: jest.Mock;
  };

const chatCalls = (fetchMock: jest.Mock) =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/rest/chat/'));

describe('toStewardChatLine', () => {
  it('keeps the message on one line', () => {
    expect(toStewardChatLine('  [Steward] Antares\nAu:\r\n  5s penalty ')).toBe(
      '[Steward] Antares Au: 5s penalty',
    );
  });

  it('refuses an empty message', () => {
    expect(toStewardChatLine('   ')).toBeNull();
    expect(toStewardChatLine(undefined)).toBeNull();
  });

  it('refuses anything the game would read as a command', () => {
    expect(toStewardChatLine('/restartrace')).toBeNull();
    expect(toStewardChatLine('  /kick Someone')).toBeNull();
  });

  it('cuts a long message to the chat limit', () => {
    const line = toStewardChatLine(`[Steward] ${'x'.repeat(400)}`);

    expect(line).toHaveLength(MAX_STEWARD_CHAT_LENGTH);
    expect(line?.endsWith('...')).toBe(true);
  });
});

describe('postStewardChatMessage', () => {
  const request = {
    message: '[Steward] Antares Au #19: 5s penalty - Avoidable contact',
  };
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('posts the message as plain text in a multiplayer session', async () => {
    fetchMock
      .mockResolvedValueOnce(sessionInfoResponse(37244))
      .mockResolvedValueOnce({ ok: true });
    const event = createEvent();

    await postStewardChatMessage(event, request);

    expect(fetchMock).toHaveBeenLastCalledWith(
      `${CONSTANTS.LMU_API_BASE_URL}/rest/chat/`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: request.message,
      },
    );
    expect(event.reply).toHaveBeenCalledWith(
      CONSTANTS.API.POST_STEWARD_CHAT_MESSAGE,
      { status: 'success', message: request.message },
    );
  });

  it.each([[0], [undefined], ['not a port']])(
    'never posts when the server port is %p',
    async (serverPort) => {
      fetchMock.mockResolvedValueOnce(
        sessionInfoResponse(serverPort, '-none-'),
      );
      const event = createEvent();

      await postStewardChatMessage(event, request);

      expect(chatCalls(fetchMock)).toHaveLength(0);
      expect(event.reply).toHaveBeenCalledWith(
        CONSTANTS.API.POST_STEWARD_CHAT_MESSAGE,
        expect.objectContaining({ status: 'error' }),
      );
    },
  );

  it('never posts when the session cannot be read', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const event = createEvent();

    await postStewardChatMessage(event, request);

    expect(chatCalls(fetchMock)).toHaveLength(0);
    expect(event.reply).toHaveBeenCalledWith(
      CONSTANTS.API.POST_STEWARD_CHAT_MESSAGE,
      expect.objectContaining({ status: 'error' }),
    );
  });

  it.each([[''], ['/restartrace']])(
    'does not touch the game for %p',
    async (message) => {
      const event = createEvent();

      await postStewardChatMessage(event, { message });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(event.reply).toHaveBeenCalledWith(
        CONSTANTS.API.POST_STEWARD_CHAT_MESSAGE,
        expect.objectContaining({ status: 'error' }),
      );
    },
  );

  it('reports the game not answering', async () => {
    fetchMock.mockRejectedValueOnce(new Error('fetch failed'));
    const event = createEvent();

    await postStewardChatMessage(event, request);

    expect(event.reply).toHaveBeenCalledWith(
      CONSTANTS.API.POST_STEWARD_CHAT_MESSAGE,
      { status: 'error', message: 'fetch failed' },
    );
  });

  it('reports the game refusing the message', async () => {
    fetchMock
      .mockResolvedValueOnce(sessionInfoResponse(37244))
      .mockResolvedValueOnce({ ok: false, status: 500 });
    const event = createEvent();

    await postStewardChatMessage(event, request);

    expect(event.reply).toHaveBeenCalledWith(
      CONSTANTS.API.POST_STEWARD_CHAT_MESSAGE,
      { status: 'error', message: 'API responded with status 500' },
    );
  });
});

describe('getStewardChatMessages', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns the chat in a multiplayer session', async () => {
    fetchMock
      .mockResolvedValueOnce(sessionInfoResponse(37244))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { message: 't lorioli: thx', timestamp: 1794611671 },
          { nonsense: true },
        ],
      });
    const event = createEvent();

    await getStewardChatMessages(event);

    expect(event.reply).toHaveBeenCalledWith(
      CONSTANTS.API.GET_STEWARD_CHAT_MESSAGES,
      {
        status: 'success',
        data: [{ message: 't lorioli: thx', timestamp: expect.any(String) }],
      },
    );
  });

  it('never reads the chat outside a multiplayer session', async () => {
    fetchMock.mockResolvedValueOnce(sessionInfoResponse(0, '-none-'));
    const event = createEvent();

    await getStewardChatMessages(event);

    expect(chatCalls(fetchMock)).toHaveLength(0);
    expect(event.reply).toHaveBeenCalledWith(
      CONSTANTS.API.GET_STEWARD_CHAT_MESSAGES,
      { status: 'success', data: [] },
    );
  });

  it('reports the game not answering', async () => {
    fetchMock.mockRejectedValueOnce(new Error('fetch failed'));
    const event = createEvent();

    await getStewardChatMessages(event);

    expect(event.reply).toHaveBeenCalledWith(
      CONSTANTS.API.GET_STEWARD_CHAT_MESSAGES,
      { status: 'error', message: 'fetch failed' },
    );
  });
});
