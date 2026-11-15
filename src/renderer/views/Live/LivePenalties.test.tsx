import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LivePenalties } from './LivePenalties';
import {
  LiveStanding,
  liveStandingsFixture,
} from '../../components/Live/liveFixtures';
import {
  LivePenaltyHistory,
  livePenaltyKey,
  resetLivePenaltyHistory,
  useLivePenaltyHistory,
} from '../../hooks/useLivePenaltyHistory';
import {
  SIMGRID_PAGE_COMMANDS,
  describeSimgridCommand,
} from '../../utils/simgridCommands';

const withPenalties = (counts: number[]): LiveStanding[] =>
  liveStandingsFixture.slice(0, counts.length).map((row, index) => ({
    ...row,
    slotId: index,
    outstandingPenalties: counts[index],
  }));

const onRequestServerCommand = jest.fn();
let standings: LiveStanding[] = [];
let penaltyHistory: LivePenaltyHistory = new Map();
let simgridServerCommandsUrl = 'https://www.thesimgrid.com/admin/x';
let isReviewingRecord = false;

jest.mock('../../providers/ApiContext', () => ({
  useApi: () => ({ simgridServerCommandsUrl }),
}));
jest.mock('../../providers/LiveSessionContext', () => ({
  useLiveSession: () => ({
    standings,
    penaltyHistory,
    isReviewingRecord,
    onRequestServerCommand,
  }),
}));

const historyOf = (
  entries: [LiveStanding, { active: number; cleared: number }][],
): LivePenaltyHistory =>
  new Map(entries.map(([row, record]) => [livePenaltyKey(row), record]));

const statusOf = (row: LiveStanding) =>
  screen
    .queryByTestId(`penalty-row-${livePenaltyKey(row)}`)
    ?.getAttribute('data-status');

beforeEach(() => {
  jest.clearAllMocks();
  resetLivePenaltyHistory();
  simgridServerCommandsUrl = 'https://www.thesimgrid.com/admin/x';
  isReviewingRecord = false;
  standings = withPenalties([0, 2, 0, 0]);
  const [, active, cleared] = standings;
  penaltyHistory = historyOf([
    [active, { active: 2, cleared: 0 }],
    [cleared, { active: 0, cleared: 1 }],
  ]);
});

describe('useLivePenaltyHistory', () => {
  const run = (initial: LiveStanding[]) =>
    renderHook(
      (rows: LiveStanding[]) => useLivePenaltyHistory('session', rows),
      { initialProps: initial },
    );

  it('should report the penalties each driver still has to serve', () => {
    const rows = withPenalties([0, 2]);
    const view = run(rows);

    expect(view.result.current.get(livePenaltyKey(rows[1]))).toEqual({
      active: 2,
      cleared: 0,
    });
  });

  // The feed has no history; a count going down is how one is learned.
  it('should count a penalty as cleared when the number goes down', () => {
    const view = run(withPenalties([0, 2]));

    view.rerender(withPenalties([0, 1]));
    view.rerender(withPenalties([0, 0]));

    expect(
      view.result.current.get(livePenaltyKey(withPenalties([0, 0])[1])),
    ).toEqual({ active: 0, cleared: 2 });
  });

  it('should keep what was cleared when a new penalty arrives', () => {
    const view = run(withPenalties([1]));
    view.rerender(withPenalties([0]));
    view.rerender(withPenalties([3]));

    expect(
      view.result.current.get(livePenaltyKey(withPenalties([3])[0])),
    ).toEqual({ active: 3, cleared: 1 });
  });

  // Leaving the live screen must not forget who has already served.
  it('should survive the screen being left and reopened', () => {
    const first = run(withPenalties([1]));
    first.rerender(withPenalties([0]));
    first.unmount();

    const second = run(withPenalties([0]));

    expect(
      second.result.current.get(livePenaltyKey(withPenalties([0])[0])),
    ).toEqual({ active: 0, cleared: 1 });
  });

  it('should hand back the same map when nothing changed', () => {
    const view = run(withPenalties([0, 2]));
    const before = view.result.current;

    view.rerender(withPenalties([0, 2]));

    expect(view.result.current).toBe(before);
  });
});

describe('LivePenalties', () => {
  it('should list drivers with penalties to serve and with cleared ones only', () => {
    render(<LivePenalties />);
    const [clean, active, cleared, alsoClean] = standings;

    expect(statusOf(active)).toBe('active');
    expect(statusOf(cleared)).toBe('cleared');
    expect(statusOf(clean)).toBeUndefined();
    expect(statusOf(alsoClean)).toBeUndefined();
    expect(screen.getByText('1 to serve')).toBeInTheDocument();
    expect(screen.getByText('2 to serve')).toBeInTheDocument();
  });

  // To serve first, then cleared, whatever the running order.
  it('should put penalties to serve above cleared ones', () => {
    render(<LivePenalties />);

    const order = screen
      .getAllByTestId(/^penalty-row-/)
      .map((row) => row.getAttribute('data-status'));

    expect(order).toEqual(['active', 'cleared']);
  });

  it('should show every driver when asked', () => {
    render(<LivePenalties />);

    fireEvent.click(
      screen.getByRole('switch', { name: 'Show drivers with no penalty' }),
    );

    expect(screen.getAllByTestId(/^penalty-row-/)).toHaveLength(
      standings.length,
    );
    expect(statusOf(standings[0])).toBe('none');
  });

  it('should say so when there is nothing to list', () => {
    penaltyHistory = new Map();
    standings = withPenalties([0, 0]);
    render(<LivePenalties />);

    expect(
      screen.getByText(/Nobody has a penalty to serve/),
    ).toBeInTheDocument();
  });

  it('should offer the same commands as the SimGrid page for a selected driver', () => {
    render(<LivePenalties />);
    expect(screen.queryByLabelText('Server command')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByTestId(`penalty-row-${livePenaltyKey(standings[1])}`),
    );

    const options = Array.from(
      (screen.getByLabelText('Server command') as HTMLSelectElement).options,
    ).map((option) => option.textContent);
    expect(options).toEqual([
      'Disqualify',
      'Undisqualify',
      'Add Time Penalty',
      'Add Penalty',
      'Remove Penalty',
      'Add Weight Penalty',
    ]);
  });

  it('should ask to send the chosen command for the chosen driver', () => {
    render(<LivePenalties />);
    const driver = standings[1];
    fireEvent.click(
      screen.getByTestId(`penalty-row-${livePenaltyKey(driver)}`),
    );

    fireEvent.change(screen.getByLabelText('Server command'), {
      target: { value: 'add_penalty' },
    });
    // A command that takes a value cannot go without one.
    expect(screen.getByRole('button', { name: 'Send command' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Server command value'), {
      target: { value: '-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send command' }));

    expect(onRequestServerCommand).toHaveBeenCalledWith({
      driverName: driver.displayName,
      carNumber: driver.carNumber,
      description: 'Add Penalty: Drive-thru',
      simgrid: { command: 'add_penalty', code: -1 },
    });
  });

  it('should send a disqualification with no value', () => {
    render(<LivePenalties />);
    fireEvent.click(
      screen.getByTestId(`penalty-row-${livePenaltyKey(standings[1])}`),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send command' }));

    expect(onRequestServerCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Disqualify',
        simgrid: { command: 'disqualify', code: undefined },
      }),
    );
  });

  it('should reach a driver with no penalty through the toggle', () => {
    render(<LivePenalties />);
    fireEvent.click(
      screen.getByRole('switch', { name: 'Show drivers with no penalty' }),
    );

    fireEvent.click(
      screen.getByTestId(`penalty-row-${livePenaltyKey(standings[0])}`),
    );

    expect(
      screen.getByRole('region', { name: 'Server commands' }),
    ).toHaveTextContent(standings[0].displayName);
  });

  it('should not send without the SimGrid connector set up', () => {
    simgridServerCommandsUrl = '';
    render(<LivePenalties />);
    fireEvent.click(
      screen.getByTestId(`penalty-row-${livePenaltyKey(standings[1])}`),
    );

    expect(screen.getByRole('button', { name: 'Send command' })).toBeDisabled();
    expect(
      screen.getByText(/Set up the SimGrid connector/),
    ).toBeInTheDocument();
  });
});

describe('the SimGrid page commands', () => {
  it('should offer the values the page offers', () => {
    const byCommand = Object.fromEntries(
      SIMGRID_PAGE_COMMANDS.map((entry) => [entry.command, entry]),
    );

    expect(byCommand.add_time_penalty.options).toHaveLength(60);
    expect(byCommand.add_penalty.options?.[0]).toEqual({
      code: -1,
      label: 'Drive-thru',
    });
    expect(byCommand.add_penalty.options).toHaveLength(61);
    expect(byCommand.remove_penalty.options?.map((o) => o.code)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(byCommand.set_mass.options).toHaveLength(256);
    expect(byCommand.disqualify.options).toBeUndefined();
  });

  it('should word a command the way the page does', () => {
    expect(describeSimgridCommand('add_time_penalty', 5)).toBe(
      'Add Time Penalty: 5s',
    );
    expect(describeSimgridCommand('remove_penalty', 4)).toBe(
      'Remove Penalty: All Penalties',
    );
    expect(describeSimgridCommand('undisqualify')).toBe('Undisqualify');
  });
});
