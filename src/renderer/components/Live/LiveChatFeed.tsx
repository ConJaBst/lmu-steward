import { useEffect, useRef, useState } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import { CONSTANTS } from '@constants';
import { useApi } from '../../providers/ApiContext';
import { sendMessage } from '../../utils/postMessage';
import { STEWARD_CHAT_PREFIX } from '../../utils/stewardChat';

/** How often the game's chat is read. */
export const CHAT_FEED_POLL_MS = 3000;

/** The most lines shown at once; older ones give way to newer. */
export const CHAT_FEED_MAX_LINES = 3;

interface RawChatMessage {
  message?: unknown;
  timestamp?: unknown;
}

interface FeedLine {
  key: string;
  username?: string;
  text: string;
  isSteward: boolean;
  shownAt: number;
}

/** `Name: text`, split at the first colon the way the game's own chat does. */
const splitChatMessage = (
  message: string,
): { username?: string; text: string } => {
  const at = message.indexOf(':');

  return at > 0
    ? {
        username: message.slice(0, at).trim(),
        text: message.slice(at + 1).trim(),
      }
    : { text: message.trim() };
};

/**
 * New in-game chat, as it arrives, in the header beside the circuit name.
 *
 * A glance, not a log: the newest few messages, each a one-line card in the
 * same outlined style as the rest of the live screen. How long a card stays is
 * the steward's setting — and at 0 it has no time limit at all, staying until
 * newer messages push it off the end. Nothing that was already in the chat when
 * the screen opened is shown: a steward arriving mid-session does not want the
 * last hour replayed at them.
 *
 * Steward messages are white with a gavel; everything else is dimmed, so a
 * steward can see at once that their own call went out — and that somebody is
 * answering it. A steward message is one carrying the `[Steward]` tag, or one
 * this app sent itself (the announcement and typed messages carry no tag).
 *
 * The main process reads the chat only while the game is in a multiplayer
 * session, for the reason at the top of `steward-chat.ts`.
 */
export const LiveChatFeed: React.FC = () => {
  const { subscribeToApiChannel, liveChatFeedVisibleSeconds } = useApi();
  const [lines, setLines] = useState<FeedLine[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const sentByApp = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribeSent = subscribeToApiChannel(
      CONSTANTS.API.POST_STEWARD_CHAT_MESSAGE,
      (payload: unknown) => {
        const response = payload as { status?: string; message?: string };
        if (response?.status === 'success' && response.message) {
          sentByApp.current.add(response.message);
        }
      },
    );

    const unsubscribeFeed = subscribeToApiChannel(
      CONSTANTS.API.GET_STEWARD_CHAT_MESSAGES,
      (payload: unknown) => {
        const response = payload as {
          status?: string;
          data?: RawChatMessage[];
        };
        if (response?.status !== 'success' || !Array.isArray(response.data)) {
          return;
        }

        const incoming = response.data
          .filter((entry) => typeof entry?.message === 'string')
          .map((entry) => ({
            key: `${String(entry.timestamp ?? '')}|${entry.message as string}`,
            message: entry.message as string,
          }));

        // The first reading is history: remember it, show none of it.
        if (seen.current === null) {
          seen.current = new Set(incoming.map((entry) => entry.key));
          return;
        }

        const known = seen.current;
        const fresh = incoming.filter((entry) => !known.has(entry.key));
        if (fresh.length === 0) {
          return;
        }
        fresh.forEach((entry) => known.add(entry.key));

        const shownAt = Date.now();
        setLines((held) =>
          [
            ...held,
            ...fresh.map((entry) => {
              const { username, text } = splitChatMessage(entry.message);
              return {
                key: entry.key,
                username,
                text,
                isSteward:
                  text.includes(STEWARD_CHAT_PREFIX) ||
                  sentByApp.current.has(text),
                shownAt,
              };
            }),
          ].slice(-CHAT_FEED_MAX_LINES),
        );
      },
    );

    const poll = () => sendMessage(CONSTANTS.API.GET_STEWARD_CHAT_MESSAGES);
    poll();
    const pollTimer = window.setInterval(poll, CHAT_FEED_POLL_MS);

    return () => {
      unsubscribeSent?.();
      unsubscribeFeed?.();
      window.clearInterval(pollTimer);
    };
  }, [subscribeToApiChannel]);

  /*
    Expiry, on its own clock so a card goes even when chat is quiet.

    Not started at all when the setting is 0: with no time limit the only thing
    that removes a card is a newer one arriving, which the list's own length cap
    already does.
  */
  useEffect(() => {
    if (liveChatFeedVisibleSeconds <= 0) {
      return undefined;
    }

    const visibleMs = liveChatFeedVisibleSeconds * 1000;
    const expiryTimer = window.setInterval(() => {
      const cutoff = Date.now() - visibleMs;
      setLines((held) =>
        held.some((line) => line.shownAt <= cutoff)
          ? held.filter((line) => line.shownAt > cutoff)
          : held,
      );
    }, 1000);

    return () => window.clearInterval(expiryTimer);
  }, [liveChatFeedVisibleSeconds]);

  if (lines.length === 0) {
    return null;
  }

  return (
    <Stack
      role="log"
      aria-label="New chat messages"
      spacing={0.5}
      sx={{
        // Bounded on both axes: a long message is cut, never pushed off screen.
        width: 'min(560px, 44vw)',
        maxWidth: '100%',
        minWidth: 0,
      }}
    >
      {lines.map((line) => (
        <Paper
          key={line.key}
          variant="outlined"
          data-steward={line.isSteward ? 'true' : 'false'}
          title={line.username ? `${line.username}: ${line.text}` : line.text}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.25,
            py: 0.5,
            minWidth: 0,
            borderRadius: 2,
            borderColor: line.isSteward ? 'common.white' : 'divider',
            backgroundColor: (theme) =>
              line.isSteward
                ? alpha(theme.palette.common.white, 0.08)
                : 'transparent',
          }}
        >
          {line.isSteward ? (
            <GavelOutlinedIcon sx={{ fontSize: 14, color: 'common.white' }} />
          ) : (
            <ChatBubbleOutlineIcon
              sx={{ fontSize: 14, color: 'text.secondary' }}
            />
          )}
          {line.username ? (
            <Typography
              variant="caption"
              noWrap
              sx={{
                flexShrink: 0,
                maxWidth: '40%',
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                fontWeight: 700,
                color: line.isSteward ? 'common.white' : 'text.secondary',
              }}
            >
              {line.username}
            </Typography>
          ) : null}
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant="body2"
              noWrap
              sx={{
                color: line.isSteward ? 'common.white' : 'text.secondary',
                fontWeight: line.isSteward ? 700 : 400,
              }}
            >
              {line.text}
            </Typography>
          </Box>
        </Paper>
      ))}
    </Stack>
  );
};
