import { CONSTANTS } from '@constants';

/**
 * Posting a line to the in-game chat.
 *
 * POST /rest/chat/
 *
 * BODY — the message itself, as plain text. Not JSON.
 *
 * The endpoint is listed in the game's own schema (`/swagger-schema.json`) with
 * no parameters, so the body format was read off the game's menu UI instead: its
 * chat window sends `ky.post(chatRestUrl, { body: message })`, a bare string.
 * `GET /rest/chat/` returns the session's chat as `[{ message, timestamp }]`.
 * Confirmed against a 22-player official server on 2026-11-14.
 *
 * The message is sent as the local player, exactly as if they had typed it, so
 * the steward has to be connected to the server they are stewarding.
 *
 * What the line *says* is the renderer's business — see
 * `src/renderer/utils/stewardChat.ts`. The steward has to be able to read and
 * edit a message before it goes, so it is composed where it is shown; this file
 * only decides whether a line is safe to send and sends it.
 *
 * **Never post outside a multiplayer session.** A plain-text POST made on
 * 2026-11-14 while the game sat in an offline practice session answered 200,
 * and the game submitted a crash report and exited within seconds. That is one
 * observation, not a proven cause — but there is no chat to write to offline,
 * and a crash is too expensive to find out twice.
 *
 * The guard is `sessionInfo.serverPort`: 0 offline, the server's port once
 * joined. **Not `serverName`.** That was the first guard and it refused a real
 * session: offline it reads `-none-`, but joined to a 22-player official server
 * it read `""` (measured the same day, `serverPort` 37244,
 * `/rest/multiplayer/join/state` `JOIN_JOINED_SERVER`).
 *
 * As with the camera endpoint, a 200 says the request was accepted, never that
 * the message appeared.
 */

export interface StewardChatMessageRequest {
  message: string;
}

/**
 * A chat line is one line and a short one. The game's limit is not documented;
 * this is deliberately conservative so a long reason is cut by us, visibly,
 * rather than by the game somewhere we cannot see.
 */
export const MAX_STEWARD_CHAT_LENGTH = 128;

/**
 * The line as it will be sent, or null when there is nothing safe to send.
 *
 * Collapsed to one line and cut to the limit. Null when empty, and null for
 * anything starting with `/`: the game treats a leading slash as a command, and
 * this channel exists to talk to drivers, not to run admin commands by accident.
 */
export const toStewardChatLine = (value: unknown): string | null => {
  const message = (typeof value === 'string' ? value : '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!message || message.startsWith('/')) {
    return null;
  }

  return message.length > MAX_STEWARD_CHAT_LENGTH
    ? `${message.slice(0, MAX_STEWARD_CHAT_LENGTH - 3).trimEnd()}...`
    : message;
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error ?? 'Unknown error');
};

/**
 * Whether the game is connected to a server right now.
 *
 * Fails closed: anything other than a readable session with a server port
 * counts as "not multiplayer", because the cost of being wrong in the other
 * direction is the crash described at the top of this file.
 */
const isInMultiplayerSession = async (): Promise<boolean> => {
  const response = await fetch(
    `${CONSTANTS.LMU_API_BASE_URL}/rest/watch/sessionInfo`,
  );

  if (!response.ok) {
    return false;
  }

  const sessionInfo = (await response.json()) as { serverPort?: unknown };
  const serverPort = Number(sessionInfo?.serverPort);

  return Number.isFinite(serverPort) && serverPort > 0;
};

export const postStewardChatMessage = async (
  event: Electron.IpcMainEvent,
  request: StewardChatMessageRequest,
) => {
  const reply = (payload: { status: 'success' | 'error'; message: string }) =>
    event.reply(CONSTANTS.API.POST_STEWARD_CHAT_MESSAGE, payload);

  const message = toStewardChatLine(request?.message);

  if (!message) {
    reply({
      status: 'error',
      message:
        'Not sent: a chat message cannot be empty or start with a slash.',
    });
    return;
  }

  try {
    if (!(await isInMultiplayerSession())) {
      reply({
        status: 'error',
        message:
          'Not sent: Le Mans Ultimate is not in a multiplayer session, and there is no chat to post to offline.',
      });
      return;
    }

    const response = await fetch(`${CONSTANTS.LMU_API_BASE_URL}/rest/chat/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: message,
    });

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    reply({ status: 'success', message });
  } catch (error: unknown) {
    reply({ status: 'error', message: toErrorMessage(error) });
  }
};

export interface StewardChatLogEntry {
  message: string;
  /**
   * As text. The game's timestamps are larger than a JavaScript number can hold
   * exactly, and this is only ever used to tell two messages apart.
   */
  timestamp: string;
}

/**
 * GET /rest/chat/
 *
 * The session's chat as `[{ message, timestamp }]`, where `message` is
 * `Name: text`.
 *
 * Behind the same multiplayer guard as posting. Reading has not been seen to
 * do any harm offline, but it has nothing to return there either, and the one
 * time this endpoint was touched offline the game went down — so it is simply
 * not touched. Outside a multiplayer session this answers with an empty list.
 */
export const getStewardChatMessages = async (event: Electron.IpcMainEvent) => {
  try {
    if (!(await isInMultiplayerSession())) {
      event.reply(CONSTANTS.API.GET_STEWARD_CHAT_MESSAGES, {
        status: 'success',
        data: [],
      });
      return;
    }

    const response = await fetch(`${CONSTANTS.LMU_API_BASE_URL}/rest/chat/`);

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const raw: unknown = await response.json();
    const data: StewardChatLogEntry[] = Array.isArray(raw)
      ? raw
          .filter(
            (entry): entry is { message: string; timestamp?: unknown } =>
              typeof entry === 'object' &&
              entry !== null &&
              typeof (entry as { message?: unknown }).message === 'string',
          )
          .map((entry) => ({
            message: entry.message,
            timestamp: String(entry.timestamp ?? ''),
          }))
      : [];

    event.reply(CONSTANTS.API.GET_STEWARD_CHAT_MESSAGES, {
      status: 'success',
      data,
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.GET_STEWARD_CHAT_MESSAGES, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};
