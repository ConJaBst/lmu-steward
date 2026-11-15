import { DEFAULT_STEWARD_ACTIONS } from './stewardActions';
import {
  formatChatDriver,
  formatDecisionChatMessage,
  formatIncidentChatMessage,
  formatPenaltyChatMessage,
  resolveStewardAnnouncement,
} from './stewardChat';

const drake = { displayName: 'B. Drake', carNumber: '51' };
const lindqvist = { displayName: 'M. Lindqvist', carNumber: '7' };

describe('formatChatDriver', () => {
  it('should name the driver and their car number', () => {
    expect(formatChatDriver(drake)).toBe('B. Drake #51');
  });

  it('should not double a hash the number already carries', () => {
    expect(
      formatChatDriver({ displayName: 'B. Drake', carNumber: '#51' }),
    ).toBe('B. Drake #51');
  });

  it('should leave the number off when there is none', () => {
    expect(formatChatDriver({ displayName: 'B. Drake' })).toBe('B. Drake');
  });
});

describe('a call against one driver', () => {
  it('should read Driver #Number: Penalty - Reason', () => {
    expect(
      formatPenaltyChatMessage(drake, '5s penalty', 'Avoidable contact'),
    ).toBe('[Steward] B. Drake #51: 5s penalty - Avoidable contact');
  });

  it('should drop the separator along with a missing reason', () => {
    expect(formatPenaltyChatMessage(drake, 'Drive Through')).toBe(
      '[Steward] B. Drake #51: Drive Through',
    );
    expect(formatPenaltyChatMessage(drake, 'Drive Through', '   ')).toBe(
      '[Steward] B. Drake #51: Drive Through',
    );
  });
});

describe('a finding about an incident', () => {
  it('should list every driver, then the reason', () => {
    expect(
      formatIncidentChatMessage(
        'Under Investigation',
        [drake, lindqvist],
        'Contact at T4',
      ),
    ).toBe(
      '[Steward] Under Investigation: B. Drake #51, M. Lindqvist #7: Contact at T4',
    );
  });

  it('should stop after the drivers when no reason was given', () => {
    expect(
      formatIncidentChatMessage('Racing Incident', [drake, lindqvist]),
    ).toBe('[Steward] Racing Incident: B. Drake #51, M. Lindqvist #7');
  });
});

describe('formatDecisionChatMessage', () => {
  const base = {
    actions: DEFAULT_STEWARD_ACTIONS,
    drivers: [drake, lindqvist],
  };

  it('should use the penalty shape when the call names a driver', () => {
    expect(
      formatDecisionChatMessage({
        ...base,
        outcome: '10s penalty',
        target: lindqvist,
        reason: 'Unsafe rejoin',
      }),
    ).toBe('[Steward] M. Lindqvist #7: 10s penalty - Unsafe rejoin');
  });

  // The record keeps the long label; the chat line says the short one.
  it("should say an action's chat text rather than its label", () => {
    expect(
      formatDecisionChatMessage({
        ...base,
        outcome: 'Racing incident: No investigation necessary',
      }),
    ).toBe('[Steward] Racing Incident: B. Drake #51, M. Lindqvist #7');
    expect(
      formatDecisionChatMessage({ ...base, outcome: 'Under investigation' }),
    ).toBe('[Steward] Under Investigation: B. Drake #51, M. Lindqvist #7');
  });

  // An outcome renamed out of the tariff still has to produce a line.
  it('should fall back to the outcome text for an unknown action', () => {
    expect(
      formatDecisionChatMessage({
        ...base,
        outcome: 'Reprimand',
        target: drake,
      }),
    ).toBe('[Steward] B. Drake #51: Reprimand');
  });
});

describe('resolveStewardAnnouncement', () => {
  it('should name the steward in the shipped wording', () => {
    expect(resolveStewardAnnouncement('', 'Connor')).toBe(
      'Steward Connor is watching over this session',
    );
  });

  it('should not say "Steward Steward" when no name is set', () => {
    expect(resolveStewardAnnouncement('', 'Steward')).toBe(
      'A steward is watching over this session',
    );
    expect(resolveStewardAnnouncement(undefined, '')).toBe(
      'A steward is watching over this session',
    );
  });

  it('should use custom wording, with or without the placeholder', () => {
    expect(
      resolveStewardAnnouncement('Race control: {steward} on duty', 'Connor'),
    ).toBe('Race control: Connor on duty');
    expect(resolveStewardAnnouncement('Race control is live', 'Connor')).toBe(
      'Race control is live',
    );
  });
});
