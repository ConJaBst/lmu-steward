import { DEFAULT_STEWARD_AUTHOR } from './stewardAuthor';
import { StewardAction, stewardActionChatLabel } from './stewardActions';

/**
 * What a steward's call says in the in-game chat.
 *
 * Composed here, in the renderer, rather than where the line is sent: with
 * autosend off the steward reads and edits the message before it goes, so the
 * text has to exist on screen first. `src/main/api/steward-chat.ts` only decides
 * whether a line is safe to post.
 *
 * Two shapes, following the action's own `driverScoped` flag:
 *
 *   a call against one driver   [Steward] Driver #Number: Penalty - Reason
 *   a finding about an incident [Steward] Finding: Driver 1 #N, Driver 2 #N: Reason
 *
 * The reason is optional in both, and its separator goes with it.
 */

export const STEWARD_CHAT_PREFIX = '[Steward]';

/** `{steward}` in an announcement is replaced with the steward's name. */
export const STEWARD_NAME_PLACEHOLDER = '{steward}';

export const DEFAULT_STEWARD_ANNOUNCEMENT = `Steward ${STEWARD_NAME_PLACEHOLDER} is watching over this session`;

export const MAX_STEWARD_ANNOUNCEMENT_LENGTH = 110;

export interface StewardChatDriver {
  displayName: string;
  carNumber?: string;
}

const clean = (value: unknown): string =>
  (typeof value === 'string' ? value : '').replace(/\s+/g, ' ').trim();

/** `Driver Name #19`, or just the name when the car has no number. */
export const formatChatDriver = (driver: StewardChatDriver): string => {
  const name = clean(driver.displayName);
  const carNumber = clean(driver.carNumber).replace(/^#/, '');

  return carNumber ? `${name} #${carNumber}` : name;
};

/** `[Steward] Driver #Number: Penalty - Reason` */
export const formatPenaltyChatMessage = (
  driver: StewardChatDriver,
  penalty: string,
  reason?: string,
): string => {
  const why = clean(reason);

  return `${STEWARD_CHAT_PREFIX} ${formatChatDriver(driver)}: ${clean(penalty)}${
    why ? ` - ${why}` : ''
  }`;
};

/** `[Steward] Under Investigation: Driver 1 #N, Driver 2 #N: Reason` */
export const formatIncidentChatMessage = (
  finding: string,
  drivers: readonly StewardChatDriver[],
  reason?: string,
): string => {
  const why = clean(reason);
  const parties = drivers.map(formatChatDriver).filter(Boolean).join(', ');

  return [`${STEWARD_CHAT_PREFIX} ${clean(finding)}`, parties, why]
    .filter(Boolean)
    .join(': ');
};

/**
 * The chat line for one call, whichever shape its action takes.
 *
 * `target` decides the shape, not the action list: the caller has already
 * resolved whether this call names a driver, and an outcome that has since been
 * renamed out of the tariff still has to produce a line.
 */
export const formatDecisionChatMessage = ({
  actions,
  outcome,
  target,
  drivers,
  reason,
}: {
  actions: readonly StewardAction[];
  outcome: string;
  target?: StewardChatDriver;
  drivers: readonly StewardChatDriver[];
  reason?: string;
}): string => {
  const action = actions.find((entry) => entry.label === outcome);
  const said = action ? stewardActionChatLabel(action) : outcome;

  return target
    ? formatPenaltyChatMessage(target, said, reason)
    : formatIncidentChatMessage(said, drivers, reason);
};

/**
 * The announcement as it will be sent.
 *
 * An empty setting means the shipped wording. With no steward name set there is
 * nobody to name, so the shipped wording becomes "A steward is watching…"
 * rather than "Steward Steward is watching…".
 */
export const resolveStewardAnnouncement = (
  template: unknown,
  stewardAuthor: string,
): string => {
  const wording = clean(template) || DEFAULT_STEWARD_ANNOUNCEMENT;
  const name = clean(stewardAuthor);
  const isNamed = Boolean(name) && name !== DEFAULT_STEWARD_AUTHOR;

  return isNamed
    ? wording.split(STEWARD_NAME_PLACEHOLDER).join(name)
    : wording
        .replace(`Steward ${STEWARD_NAME_PLACEHOLDER}`, 'A steward')
        .split(STEWARD_NAME_PLACEHOLDER)
        .join('the steward');
};
