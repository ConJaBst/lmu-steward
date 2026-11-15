import { BrowserWindow, session } from 'electron';
import { CONSTANTS } from '@constants';
import { readUserSettings } from './user-settings';

/**
 * The SimGrid connector: applying penalties on a SimGrid-hosted server.
 * **Experimental, and built on a private endpoint.**
 *
 * Le Mans Ultimate has no penalty endpoint of its own and no self-hosted
 * server, and a hosted server's admin password is never given out — so the
 * in-game admin commands (`/admin`, `/addpenalty`) are unreachable. What a
 * league does have is SimGrid's "Server Commands" page, which applies penalties
 * through SimGrid's own backend. This talks to the same place that page does.
 *
 * Measured against a live server on 2026-11-15, by watching the page work:
 *
 *   GET  /admin/race_server_configs/{id}/modules/server_commands
 *        the page: a CSRF token in `<meta name="csrf-token">` and the drivers
 *        in `<select name="driver">`, by display name.
 *
 *   POST the same URL, form-encoded, as a rails-ujs XHR
 *        authenticity_token   the CSRF token
 *        server_command       disqualify | undisqualify | add_time_penalty |
 *                             add_penalty | remove_penalty | set_mass
 *        driver               the driver's name, exactly as the page lists it
 *        code                 add_time_penalty: seconds, 1..60
 *                             set_mass: kg, 0..255 (0 removes the weight)
 *                             add_penalty: -1 drive-through, 1..60 stop-go
 *                             remove_penalty: 0 stop-go, 1 drive-through,
 *                               2 longest line, 3 all time, 4 all penalties
 *        → 200 and a script whose text contains "sent successfully".
 *
 * Three things to know before trusting it:
 *
 *   - **The endpoint is undocumented.** SimGrid can change it without notice,
 *     and when they do this stops working. Every reply is checked for the
 *     success text rather than the status code, so a changed page fails loudly.
 *   - **The steward signs in themselves**, in a window showing SimGrid's own
 *     page. This app never sees the password. The login lives in its own
 *     cookie partition, shared with nothing else in the app.
 *   - **"Sent" is SimGrid's word, not the game's.** SimGrid relays the command
 *     to the server; whether the car then serves the penalty is the game's
 *     business.
 */

const SIMGRID_ORIGIN = 'https://www.thesimgrid.com';
const SIMGRID_PARTITION = 'persist:simgrid';

/**
 * The commands the connector may send, with the values SimGrid's page offers
 * for each (read off its own option lists). `call_vote` is not one: the page
 * offered no votes to call.
 */
const COMMANDS_WITH_CODE: Record<string, { min: number; max: number }> = {
  add_time_penalty: { min: 1, max: 60 },
  // Weight in kg; 0 removes it.
  set_mass: { min: 0, max: 255 },
  add_penalty: { min: -1, max: 60 },
  remove_penalty: { min: 0, max: 4 },
};
const COMMANDS_WITHOUT_CODE = new Set(['disqualify', 'undisqualify']);

export interface SimgridCommandRequest {
  command: string;
  /** The driver as LMU names them; matched against SimGrid's own list. */
  driver: string;
  code?: number;
}

export type SimgridStatus =
  | { state: 'unconfigured' }
  | { state: 'signed-out' }
  | { state: 'ready'; drivers: string[] }
  | { state: 'error'; message: string };

/** The server-config id out of a Server Commands URL, or a bare id. */
export const parseServerConfigId = (input: unknown): string | null => {
  const text = typeof input === 'string' ? input.trim() : '';
  const fromUrl = /race_server_configs\/(\d+)/.exec(text);

  if (fromUrl) {
    return fromUrl[1];
  }
  return /^\d+$/.test(text) ? text : null;
};

const commandsUrl = (configId: string): string =>
  `${SIMGRID_ORIGIN}/admin/race_server_configs/${configId}/modules/server_commands`;

const decodeEntities = (value: string): string =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'");

/**
 * What the commands page carries: the CSRF token and the drivers.
 *
 * Null when either is missing, which is what a login page, an error page or a
 * redesigned commands page all look like from here.
 */
export const parseServerCommandsPage = (
  html: string,
): { csrfToken: string; drivers: string[] } | null => {
  const token =
    /<meta[^>]*name="csrf-token"[^>]*content="([^"]+)"/.exec(html) ??
    /<meta[^>]*content="([^"]+)"[^>]*name="csrf-token"/.exec(html);
  const select = /<select[^>]*name="driver"[^>]*>([\s\S]*?)<\/select>/.exec(
    html,
  );

  if (!token || !select) {
    return null;
  }

  const drivers = [...select[1].matchAll(/<option[^>]*value="([^"]*)"/g)]
    .map((match) => decodeEntities(match[1]).trim())
    .filter(Boolean);

  return { csrfToken: decodeEntities(token[1]), drivers };
};

const nameKey = (name: string): string =>
  name.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * SimGrid's spelling of this driver, or null if they are not on its list.
 *
 * Exact apart from case and spacing. Nothing looser: a near match is how a
 * penalty lands on the wrong driver, and refusing is always recoverable.
 */
export const matchSimgridDriver = (
  drivers: readonly string[],
  wanted: string,
): string | null =>
  drivers.find((driver) => nameKey(driver) === nameKey(wanted)) ?? null;

/** Why this command cannot be sent, or null if it can. */
export const getSimgridCommandError = (
  request: Partial<SimgridCommandRequest> | undefined,
): string | null => {
  const command = request?.command ?? '';

  if (COMMANDS_WITHOUT_CODE.has(command)) {
    return null;
  }

  const range = COMMANDS_WITH_CODE[command];
  if (!range) {
    return 'That command is not one the SimGrid connector sends.';
  }

  const code = request?.code;
  if (
    typeof code !== 'number' ||
    !Number.isInteger(code) ||
    code < range.min ||
    code > range.max ||
    // add_penalty has no code 0: -1 is a drive-through, 1..60 a stop-go.
    (command === 'add_penalty' && code === 0)
  ) {
    return 'That penalty value is not one SimGrid accepts.';
  }

  return null;
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error ?? 'Unknown error');
};

const getSimgridSession = () => {
  const simgrid = session.fromPartition(SIMGRID_PARTITION);
  /*
    A plain browser user agent. The default one names Electron and this app,
    and the site sits behind a bot check that has no reason to know either.
  */
  const plain = simgrid
    .getUserAgent()
    .replace(/\s(Electron|lmu-steward|LMUSteward|LMU Steward)\/\S+/gi, '');
  if (plain !== simgrid.getUserAgent()) {
    simgrid.setUserAgent(plain);
  }
  return simgrid;
};

const readConfigId = async (): Promise<string | null> => {
  const settings = await readUserSettings();
  return parseServerConfigId(settings.simgridServerCommandsUrl);
};

/** The commands page, or what stood in its way. */
const loadCommandsPage = async (
  configId: string,
): Promise<
  | { state: 'ready'; csrfToken: string; drivers: string[] }
  | { state: 'signed-out' }
> => {
  const response = await getSimgridSession().fetch(commandsUrl(configId), {
    headers: { Accept: 'text/html' },
  });
  const page = response.ok
    ? parseServerCommandsPage(await response.text())
    : null;

  /*
    Anything that is not the commands page is treated as "not signed in": a
    login redirect, a 403 for an account with no rights to this event, and a
    page SimGrid has redesigned all leave the steward with the same next step,
    which is to open SimGrid and look.
  */
  return page ? { state: 'ready', ...page } : { state: 'signed-out' };
};

export const getSimgridStatus = async (event: Electron.IpcMainEvent) => {
  const reply = (status: SimgridStatus) =>
    event.reply(CONSTANTS.API.GET_SIMGRID_STATUS, status);

  try {
    const configId = await readConfigId();
    if (!configId) {
      reply({ state: 'unconfigured' });
      return;
    }

    const page = await loadCommandsPage(configId);
    // The token stays here. The renderer has no use for it.
    reply(
      page.state === 'ready'
        ? { state: 'ready', drivers: page.drivers }
        : { state: 'signed-out' },
    );
  } catch (error: unknown) {
    reply({ state: 'error', message: toErrorMessage(error) });
  }
};

let signInWindow: BrowserWindow | null = null;

/**
 * Opens SimGrid in its own window for the steward to sign in.
 *
 * SimGrid's page, SimGrid's form: the password goes from the steward to
 * SimGrid and is never visible to this app. What persists is the session
 * cookie, in the connector's own partition.
 */
export const postSimgridSignIn = async (event: Electron.IpcMainEvent) => {
  if (signInWindow && !signInWindow.isDestroyed()) {
    signInWindow.focus();
    return;
  }

  getSimgridSession();
  signInWindow = new BrowserWindow({
    width: 1100,
    height: 860,
    title: 'Sign in to SimGrid',
    autoHideMenuBar: true,
    webPreferences: { partition: SIMGRID_PARTITION },
  });

  const configId = await readConfigId();
  // Straight to the commands page when there is one: SimGrid sends a
  // signed-out visitor to its login and back again afterwards.
  signInWindow.loadURL(configId ? commandsUrl(configId) : SIMGRID_ORIGIN);

  signInWindow.on('closed', () => {
    signInWindow = null;
    // The steward is done in there; tell the renderer to look again.
    if (!event.sender.isDestroyed()) {
      event.reply(CONSTANTS.API.POST_SIMGRID_SIGN_IN, { status: 'closed' });
    }
  });
};

export const postSimgridCommand = async (
  event: Electron.IpcMainEvent,
  request: SimgridCommandRequest,
) => {
  const reply = (payload: { status: 'success' | 'error'; message: string }) =>
    event.reply(CONSTANTS.API.POST_SIMGRID_COMMAND, payload);

  const invalid = getSimgridCommandError(request);
  if (invalid) {
    reply({ status: 'error', message: `Not sent: ${invalid}` });
    return;
  }

  try {
    const configId = await readConfigId();
    if (!configId) {
      reply({
        status: 'error',
        message:
          'Not sent: no SimGrid server is set. Add the Server Commands link in User Settings.',
      });
      return;
    }

    // A fresh page every time: the token is per-session and the driver list
    // changes as people join.
    const page = await loadCommandsPage(configId);
    if (page.state !== 'ready') {
      reply({
        status: 'error',
        message:
          'Not sent: SimGrid did not show the Server Commands page. Sign in to SimGrid from User Settings and check the link.',
      });
      return;
    }

    const driver = matchSimgridDriver(page.drivers, request.driver);
    if (!driver) {
      reply({
        status: 'error',
        message: `Not sent: "${request.driver}" is not on SimGrid's driver list for this server.`,
      });
      return;
    }

    const body = new URLSearchParams({
      authenticity_token: page.csrfToken,
      server_command: request.command,
      driver,
      code: request.code === undefined ? '' : String(request.code),
    });

    const response = await getSimgridSession().fetch(commandsUrl(configId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-CSRF-Token': page.csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'text/javascript, application/javascript, */*; q=0.01',
      },
      body: body.toString(),
    });
    const text = await response.text();

    // The words, not the status: this is the only proof SimGrid took it.
    if (!response.ok || !/sent successfully/i.test(text)) {
      reply({
        status: 'error',
        message: `SimGrid did not confirm the command (status ${response.status}). Check the Server Commands page on SimGrid.`,
      });
      return;
    }

    reply({ status: 'success', message: `SimGrid sent it for ${driver}.` });
  } catch (error: unknown) {
    reply({ status: 'error', message: toErrorMessage(error) });
  }
};
