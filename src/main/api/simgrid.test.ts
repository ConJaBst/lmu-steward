/**
 * @jest-environment node
 */
import { CONSTANTS } from '@constants';
import {
  getSimgridCommandError,
  getSimgridStatus,
  matchSimgridDriver,
  parseServerCommandsPage,
  parseServerConfigId,
  postSimgridCommand,
} from './simgrid';

const fetchMock = jest.fn();
let storedUrl: unknown = '';

jest.mock('electron', () => ({
  session: {
    fromPartition: () => ({
      fetch: (...args: unknown[]) => fetchMock(...args),
      getUserAgent: () => 'Mozilla/5.0 Chrome/134.0 Electron/35.0.2 Safari/537',
      setUserAgent: jest.fn(),
    }),
  },
  BrowserWindow: jest.fn(),
}));

jest.mock('./user-settings', () => ({
  readUserSettings: async () => ({ simgridServerCommandsUrl: storedUrl }),
}));

const LINK =
  'https://www.thesimgrid.com/admin/race_server_configs/179402/modules/server_commands';

const commandsPage = (drivers: string[] = ['Connor Bell', 'Dean SOLOMON']) => `
<html><head>
<meta name="csrf-param" content="authenticity_token" />
<meta name="csrf-token" content="tok&amp;en-123" />
</head><body>
<form action="/admin/race_server_configs/179402/modules/server_commands" method="post">
<select name="server_command"><option value="">Select Command</option></select>
<select name="driver" id="driver"><option value="">Select A Driver</option>
${drivers.map((name) => `<option value="${name}">${name}</option>`).join('\n')}
</select></form></body></html>`;

const page = (html: string) => ({
  ok: true,
  status: 200,
  text: async () => html,
});

const SUCCESS = {
  ok: true,
  status: 200,
  text: async () =>
    'html = `<tr><td><strong>Add Time Penalty:  Connor Bell</strong> sent successfully</td></tr>`',
};

const createEvent = () =>
  ({ reply: jest.fn() }) as unknown as Electron.IpcMainEvent & {
    reply: jest.Mock;
  };

const posts = () =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');

beforeEach(() => {
  fetchMock.mockReset();
  storedUrl = LINK;
});

describe('parseServerConfigId', () => {
  it('should take the id from a Server Commands link, or a bare id', () => {
    expect(parseServerConfigId(LINK)).toBe('179402');
    expect(parseServerConfigId(' 179402 ')).toBe('179402');
  });

  it('should refuse anything else', () => {
    expect(parseServerConfigId('https://www.thesimgrid.com/')).toBeNull();
    expect(parseServerConfigId('')).toBeNull();
    expect(parseServerConfigId(undefined)).toBeNull();
  });
});

describe('parseServerCommandsPage', () => {
  it('should read the token and the drivers', () => {
    expect(parseServerCommandsPage(commandsPage())).toEqual({
      csrfToken: 'tok&en-123',
      drivers: ['Connor Bell', 'Dean SOLOMON'],
    });
  });

  // A login page, an error page and a redesigned page all look like this.
  it('should refuse a page that is not the commands page', () => {
    expect(
      parseServerCommandsPage('<html><body>Log in</body></html>'),
    ).toBeNull();
  });
});

describe('matchSimgridDriver', () => {
  const drivers = ['Connor Bell', 'Dean SOLOMON', 'Chloe KaChow#6677'];

  it("should return SimGrid's own spelling, ignoring case and spacing", () => {
    expect(matchSimgridDriver(drivers, 'dean solomon')).toBe('Dean SOLOMON');
    expect(matchSimgridDriver(drivers, ' Connor  Bell ')).toBe('Connor Bell');
  });

  // A near match is how a penalty lands on the wrong driver.
  it('should never match a name that is merely close', () => {
    expect(matchSimgridDriver(drivers, 'Connor')).toBeNull();
    expect(matchSimgridDriver(drivers, 'Chloe KaChow')).toBeNull();
  });
});

describe('getSimgridCommandError', () => {
  it('should allow the penalties SimGrid offers', () => {
    expect(
      getSimgridCommandError({
        command: 'add_time_penalty',
        driver: 'x',
        code: 5,
      }),
    ).toBeNull();
    expect(
      getSimgridCommandError({ command: 'add_penalty', driver: 'x', code: -1 }),
    ).toBeNull();
    expect(
      getSimgridCommandError({ command: 'add_penalty', driver: 'x', code: 60 }),
    ).toBeNull();
    expect(
      getSimgridCommandError({ command: 'disqualify', driver: 'x' }),
    ).toBeNull();
    expect(
      getSimgridCommandError({ command: 'undisqualify', driver: 'x' }),
    ).toBeNull();
    expect(
      getSimgridCommandError({ command: 'set_mass', driver: 'x', code: 0 }),
    ).toBeNull();
    expect(
      getSimgridCommandError({
        command: 'remove_penalty',
        driver: 'x',
        code: 4,
      }),
    ).toBeNull();
  });

  it('should refuse other commands and out-of-range values', () => {
    expect(
      getSimgridCommandError({ command: 'call_vote', driver: 'x' }),
    ).not.toBeNull();
    expect(
      getSimgridCommandError({ command: 'set_mass', driver: 'x', code: 256 }),
    ).not.toBeNull();
    expect(
      getSimgridCommandError({
        command: 'add_time_penalty',
        driver: 'x',
        code: 61,
      }),
    ).not.toBeNull();
    expect(
      getSimgridCommandError({ command: 'add_penalty', driver: 'x', code: 0 }),
    ).not.toBeNull();
    expect(
      getSimgridCommandError({ command: 'add_penalty', driver: 'x', code: 61 }),
    ).not.toBeNull();
    expect(
      getSimgridCommandError({ command: 'add_time_penalty', driver: 'x' }),
    ).not.toBeNull();
  });
});

describe('getSimgridStatus', () => {
  it('should say when no server is set, without calling SimGrid', async () => {
    storedUrl = '';
    const event = createEvent();

    await getSimgridStatus(event);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(event.reply).toHaveBeenCalledWith(CONSTANTS.API.GET_SIMGRID_STATUS, {
      state: 'unconfigured',
    });
  });

  // The token is the session's secret and the renderer has no use for it.
  it('should report the drivers and keep the token to itself', async () => {
    fetchMock.mockResolvedValueOnce(page(commandsPage()));
    const event = createEvent();

    await getSimgridStatus(event);

    expect(fetchMock).toHaveBeenCalledWith(LINK, expect.anything());
    expect(event.reply).toHaveBeenCalledWith(CONSTANTS.API.GET_SIMGRID_STATUS, {
      state: 'ready',
      drivers: ['Connor Bell', 'Dean SOLOMON'],
    });
    expect(JSON.stringify(event.reply.mock.calls)).not.toContain('tok');
  });

  it('should report signed out when SimGrid shows some other page', async () => {
    fetchMock.mockResolvedValueOnce(page('<html>Log in</html>'));
    const event = createEvent();

    await getSimgridStatus(event);

    expect(event.reply).toHaveBeenCalledWith(CONSTANTS.API.GET_SIMGRID_STATUS, {
      state: 'signed-out',
    });
  });
});

describe('postSimgridCommand', () => {
  const request = {
    command: 'add_time_penalty',
    driver: 'connor bell',
    code: 5,
  };

  it('should post the command the way the Server Commands page does', async () => {
    fetchMock
      .mockResolvedValueOnce(page(commandsPage()))
      .mockResolvedValueOnce(SUCCESS);
    const event = createEvent();

    await postSimgridCommand(event, request);

    const [url, init] = posts()[0];
    expect(url).toBe(LINK);
    expect(init.headers['X-CSRF-Token']).toBe('tok&en-123');
    expect(init.headers['X-Requested-With']).toBe('XMLHttpRequest');
    expect(Object.fromEntries(new URLSearchParams(init.body))).toEqual({
      authenticity_token: 'tok&en-123',
      server_command: 'add_time_penalty',
      // SimGrid's spelling, not the one that was asked for.
      driver: 'Connor Bell',
      code: '5',
    });
    expect(event.reply).toHaveBeenCalledWith(
      CONSTANTS.API.POST_SIMGRID_COMMAND,
      expect.objectContaining({ status: 'success' }),
    );
  });

  it('should send a disqualification with an empty code', async () => {
    fetchMock
      .mockResolvedValueOnce(page(commandsPage()))
      .mockResolvedValueOnce(SUCCESS);

    await postSimgridCommand(createEvent(), {
      command: 'disqualify',
      driver: 'Connor Bell',
    });

    expect(new URLSearchParams(posts()[0][1].body).get('code')).toBe('');
  });

  it('should not send for a driver SimGrid does not list', async () => {
    fetchMock.mockResolvedValueOnce(page(commandsPage()));
    const event = createEvent();

    await postSimgridCommand(event, { ...request, driver: 'Somebody Else' });

    expect(posts()).toHaveLength(0);
    expect(event.reply).toHaveBeenCalledWith(
      CONSTANTS.API.POST_SIMGRID_COMMAND,
      expect.objectContaining({ status: 'error' }),
    );
  });

  it('should not send when the steward is signed out', async () => {
    fetchMock.mockResolvedValueOnce(page('<html>Log in</html>'));
    const event = createEvent();

    await postSimgridCommand(event, request);

    expect(posts()).toHaveLength(0);
    expect(event.reply).toHaveBeenCalledWith(
      CONSTANTS.API.POST_SIMGRID_COMMAND,
      expect.objectContaining({ status: 'error' }),
    );
  });

  it('should not touch SimGrid for a command it does not send', async () => {
    const event = createEvent();

    await postSimgridCommand(event, {
      command: 'call_vote',
      driver: 'Connor Bell',
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // A 200 that does not say "sent successfully" is not a success.
  it('should report a failure when SimGrid does not confirm', async () => {
    fetchMock
      .mockResolvedValueOnce(page(commandsPage()))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<html>Oops</html>',
      });
    const event = createEvent();

    await postSimgridCommand(event, request);

    expect(event.reply).toHaveBeenCalledWith(
      CONSTANTS.API.POST_SIMGRID_COMMAND,
      expect.objectContaining({ status: 'error' }),
    );
  });
});
