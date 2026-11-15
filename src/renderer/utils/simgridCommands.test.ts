import {
  DEFAULT_STEWARD_ACTIONS,
  resolveStewardActions,
} from './stewardActions';
import {
  describeServerCommand,
  sanitizeServerCommand,
  serverCommandOfKind,
  toSimgridCommand,
} from './simgridCommands';

describe('toSimgridCommand', () => {
  it("should map each penalty onto SimGrid's command and code", () => {
    expect(toSimgridCommand({ kind: 'time-penalty', seconds: 5 })).toEqual({
      command: 'add_time_penalty',
      code: 5,
    });
    expect(toSimgridCommand({ kind: 'stop-go', seconds: 10 })).toEqual({
      command: 'add_penalty',
      code: 10,
    });
    expect(toSimgridCommand({ kind: 'drive-through' })).toEqual({
      command: 'add_penalty',
      code: -1,
    });
    expect(toSimgridCommand({ kind: 'disqualify' })).toEqual({
      command: 'disqualify',
    });
  });
});

describe('serverCommandOfKind', () => {
  it('should keep seconds within what SimGrid offers', () => {
    expect(serverCommandOfKind('stop-go', 500)).toEqual({
      kind: 'stop-go',
      seconds: 60,
    });
    expect(serverCommandOfKind('time-penalty', 'abc')).toEqual({
      kind: 'time-penalty',
      seconds: 5,
    });
    expect(serverCommandOfKind('drive-through', 30)).toEqual({
      kind: 'drive-through',
    });
    expect(serverCommandOfKind('')).toBeUndefined();
  });
});

describe('sanitizeServerCommand', () => {
  it('should accept a stored command and refuse anything else', () => {
    expect(
      sanitizeServerCommand({ kind: 'time-penalty', seconds: 10 }),
    ).toEqual({
      kind: 'time-penalty',
      seconds: 10,
    });
    expect(sanitizeServerCommand({ kind: 'nonsense' })).toBeUndefined();
    expect(sanitizeServerCommand('drive-through')).toBeUndefined();
    expect(sanitizeServerCommand(undefined)).toBeUndefined();
  });
});

describe('describeServerCommand', () => {
  it('should say the penalty in words', () => {
    expect(describeServerCommand({ kind: 'time-penalty', seconds: 5 })).toBe(
      '5s time penalty',
    );
    expect(describeServerCommand({ kind: 'drive-through' })).toBe(
      'Drive-through',
    );
  });
});

describe('server penalties on steward actions', () => {
  it('should ship penalties on the shipped penalty actions only', () => {
    const byLabel = Object.fromEntries(
      DEFAULT_STEWARD_ACTIONS.map((action) => [
        action.label,
        action.serverCommand,
      ]),
    );

    expect(byLabel['5s penalty']).toEqual({ kind: 'time-penalty', seconds: 5 });
    expect(byLabel['Drive Through']).toEqual({ kind: 'drive-through' });
    expect(byLabel.Disqualified).toEqual({ kind: 'disqualify' });
    expect(byLabel['Under investigation']).toBeUndefined();
  });

  it('should keep a configured server penalty through storage', () => {
    const [action] = resolveStewardActions([
      {
        id: 'a',
        label: 'SG10',
        driverScoped: true,
        serverCommand: { kind: 'stop-go', seconds: 10 },
      },
    ]);

    expect(action.serverCommand).toEqual({ kind: 'stop-go', seconds: 10 });
  });

  // A server penalty has to land on somebody.
  it('should drop a server penalty from an action about the incident', () => {
    const [action] = resolveStewardActions([
      {
        id: 'a',
        label: 'Warning',
        driverScoped: false,
        serverCommand: { kind: 'drive-through' },
      },
    ]);

    expect(action.serverCommand).toBeUndefined();
  });
});
