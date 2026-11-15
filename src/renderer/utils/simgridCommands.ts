/**
 * What a steward action does on the server, when it does anything.
 *
 * An action is the league's own wording — `5s penalty`, `DT` — and the server
 * understands none of it. This is the other half: the concrete penalty the
 * SimGrid connector should apply when that action is called. Absent means the
 * action is a record and a chat line only, which is right for a warning, a
 * racing incident or anything else the server has no penalty for.
 *
 * The values are what SimGrid's Server Commands page offers; see
 * `src/main/api/simgrid.ts` for where each code comes from.
 */
export type StewardServerCommand =
  | { kind: 'time-penalty'; seconds: number }
  | { kind: 'stop-go'; seconds: number }
  | { kind: 'drive-through' }
  | { kind: 'disqualify' };

export type StewardServerCommandKind = StewardServerCommand['kind'];

export const SERVER_COMMAND_KIND_OPTIONS: {
  kind: StewardServerCommandKind;
  label: string;
}[] = [
  { kind: 'time-penalty', label: 'Time penalty' },
  { kind: 'drive-through', label: 'Drive-through' },
  { kind: 'stop-go', label: 'Stop-go' },
  { kind: 'disqualify', label: 'Disqualify' },
];

/** SimGrid offers a stop-go of 1 to 60 seconds. */
export const MAX_STOP_GO_PENALTY_SECONDS = 60;
export const MAX_TIME_PENALTY_SECONDS = 60;
const DEFAULT_PENALTY_SECONDS = 5;

const clampSeconds = (value: unknown, max: number): number => {
  const parsed = Math.round(Number(value));

  return Number.isFinite(parsed) && parsed >= 1
    ? Math.min(parsed, max)
    : DEFAULT_PENALTY_SECONDS;
};

/** A server command of this kind, keeping the seconds where they still apply. */
export const serverCommandOfKind = (
  kind: StewardServerCommandKind | '',
  seconds?: unknown,
): StewardServerCommand | undefined => {
  switch (kind) {
    case 'time-penalty':
      return {
        kind,
        seconds: clampSeconds(seconds, MAX_TIME_PENALTY_SECONDS),
      };
    case 'stop-go':
      return {
        kind,
        seconds: clampSeconds(seconds, MAX_STOP_GO_PENALTY_SECONDS),
      };
    case 'drive-through':
    case 'disqualify':
      return { kind };
    default:
      return undefined;
  }
};

/** A stored value as a usable server command, or undefined if it is not one. */
export const sanitizeServerCommand = (
  value: unknown,
): StewardServerCommand | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const { kind, seconds } = value as { kind?: unknown; seconds?: unknown };
  return serverCommandOfKind(
    typeof kind === 'string' ? (kind as StewardServerCommandKind) : '',
    seconds,
  );
};

export const serverCommandsEqual = (
  a: StewardServerCommand | undefined,
  b: StewardServerCommand | undefined,
): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** `5s time penalty`, `Drive-through` — for the steward to read before applying. */
export const describeServerCommand = (
  command: StewardServerCommand,
): string => {
  switch (command.kind) {
    case 'time-penalty':
      return `${command.seconds}s time penalty`;
    case 'stop-go':
      return `${command.seconds}s stop-go`;
    case 'drive-through':
      return 'Drive-through';
    default:
      return 'Disqualification';
  }
};

/** The command as SimGrid's endpoint takes it. */
export const toSimgridCommand = (
  command: StewardServerCommand,
): { command: string; code?: number } => {
  switch (command.kind) {
    case 'time-penalty':
      return { command: 'add_time_penalty', code: command.seconds };
    case 'stop-go':
      return { command: 'add_penalty', code: command.seconds };
    case 'drive-through':
      return { command: 'add_penalty', code: -1 };
    default:
      return { command: 'disqualify' };
  }
};

/**
 * The commands on SimGrid's Server Commands page, as that page offers them:
 * the same names, the same order, and for each one the same list of values.
 *
 * Read off the page's own option lists on 2026-11-15. "Call Vote" is left out
 * because the page offered no votes to call.
 */
export interface SimgridPageCommand {
  command: string;
  label: string;
  /** What the second box is called, when the command takes a value. */
  valueLabel?: string;
  options?: { code: number; label: string }[];
}

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_unused, index) => from + index);

export const SIMGRID_PAGE_COMMANDS: SimgridPageCommand[] = [
  { command: 'disqualify', label: 'Disqualify' },
  { command: 'undisqualify', label: 'Undisqualify' },
  {
    command: 'add_time_penalty',
    label: 'Add Time Penalty',
    valueLabel: 'Time Penalty',
    options: range(1, MAX_TIME_PENALTY_SECONDS).map((seconds) => ({
      code: seconds,
      label: `${seconds}s`,
    })),
  },
  {
    command: 'add_penalty',
    label: 'Add Penalty',
    valueLabel: 'Penalty',
    options: [
      { code: -1, label: 'Drive-thru' },
      ...range(1, MAX_STOP_GO_PENALTY_SECONDS).map((seconds) => ({
        code: seconds,
        label: `Stop/go ${seconds} sec`,
      })),
    ],
  },
  {
    command: 'remove_penalty',
    label: 'Remove Penalty',
    valueLabel: 'Penalty',
    options: [
      { code: 0, label: 'Stop/go' },
      { code: 1, label: 'Drive-thru' },
      { code: 2, label: 'Longest Line' },
      { code: 3, label: 'All Time Penalties' },
      { code: 4, label: 'All Penalties' },
    ],
  },
  {
    command: 'set_mass',
    label: 'Add Weight Penalty',
    valueLabel: 'Weight Penalty',
    options: range(0, 255).map((kg) => ({
      code: kg,
      label: kg === 0 ? '0 Kg (Remove Penalty)' : `${kg} Kg`,
    })),
  },
];

/** `Add Time Penalty: 5s` — the command and its value, as the page words them. */
export const describeSimgridCommand = (
  command: string,
  code?: number,
): string => {
  const spec = SIMGRID_PAGE_COMMANDS.find((entry) => entry.command === command);
  const value = spec?.options?.find((option) => option.code === code)?.label;

  return [spec?.label ?? command, value].filter(Boolean).join(': ');
};
