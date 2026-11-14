/**
 * How long a new in-game chat message stays on the live screen.
 *
 * In seconds, and 0 is a real value rather than "unset": it means no time
 * limit, so a message stays until newer ones push it off the end of the list.
 */
export const DEFAULT_CHAT_FEED_VISIBLE_SECONDS = 15;

export const MAX_CHAT_FEED_VISIBLE_SECONDS = 3600;

/** The stored value as a usable number of seconds, whatever settings hold. */
export const resolveChatFeedVisibleSeconds = (value: unknown): number => {
  const parsed =
    typeof value === 'string' && value.trim() === '' ? NaN : Number(value);

  return Number.isFinite(parsed) && parsed >= 0
    ? Math.min(Math.round(parsed), MAX_CHAT_FEED_VISIBLE_SECONDS)
    : DEFAULT_CHAT_FEED_VISIBLE_SECONDS;
};
