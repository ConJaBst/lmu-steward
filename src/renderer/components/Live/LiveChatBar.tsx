import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  FormControlLabel,
  Paper,
  Snackbar,
  Switch,
  TextField,
  Tooltip,
} from '@mui/material';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import SendIcon from '@mui/icons-material/Send';
import { CONSTANTS } from '@constants';
import { useApi } from '../../providers/ApiContext';
import { useLiveSession } from '../../providers/LiveSessionContext';

/**
 * The room this bar takes in the shell, margin included. The shell subtracts it
 * from the height it gives the section below, the same way it does for the
 * camera bar.
 */
export const LIVE_CHAT_BAR_HEIGHT = 72;

/** Matches the limit the main process cuts a line to. */
const MAX_CHAT_INPUT_LENGTH = 128;

interface ChatResult {
  status: 'success' | 'error';
  message: string;
}

/**
 * The steward's line to the session's in-game chat.
 *
 * One text box that everything passes through. With autosend off, the announce
 * button and every decision button put their message here for the steward to
 * read, edit and send. With autosend on they post straight away and the box is
 * left for whatever the steward wants to type by hand.
 *
 * Every outcome comes back from the main process as a reply — including its
 * refusal to post outside a multiplayer session — and is shown rather than
 * assumed, because a 200 from the game is not proof anyone saw the line.
 */
export const LiveChatBar: React.FC = () => {
  const { subscribeToApiChannel } = useApi();
  const {
    chatDraft,
    chatAutosend,
    onChangeChatDraft,
    onSendChat,
    onAnnounce,
    onToggleChatAutosend,
  } = useLiveSession();
  const [result, setResult] = useState<ChatResult | undefined>(undefined);
  /*
    What the Send button last sent, so the box is cleared only when *that* line
    is confirmed. An autosent call confirming must not wipe a message the
    steward is halfway through typing.
  */
  const sentFromBox = useRef<string | undefined>(undefined);
  const draftRef = useRef(chatDraft);
  draftRef.current = chatDraft;

  useEffect(() => {
    const unsubscribe = subscribeToApiChannel(
      CONSTANTS.API.POST_STEWARD_CHAT_MESSAGE,
      (payload: unknown) => {
        const response = payload as Partial<ChatResult> | undefined;
        const succeeded = response?.status === 'success';

        if (succeeded && sentFromBox.current === draftRef.current) {
          onChangeChatDraft('');
        }
        sentFromBox.current = undefined;

        setResult(
          succeeded
            ? {
                status: 'success',
                message: `Sent to chat: ${response?.message ?? ''}`,
              }
            : {
                status: 'error',
                message:
                  response?.message ??
                  'Le Mans Ultimate did not answer the chat message.',
              },
        );
      },
    );

    return () => unsubscribe?.();
  }, [onChangeChatDraft, subscribeToApiChannel]);

  const canSend = chatDraft.trim().length > 0;

  const onSend = useCallback(() => {
    if (!draftRef.current.trim()) {
      return;
    }
    sentFromBox.current = draftRef.current;
    onSendChat(draftRef.current);
  }, [onSendChat]);

  return (
    <>
      <Paper
        variant="outlined"
        component="section"
        aria-label="In-game chat"
        sx={{
          borderColor: 'divider',
          borderRadius: 2,
          px: 1.5,
          py: 1,
          mb: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        {/* `describeChild` keeps each control's visible name as its name. */}
        <Tooltip
          describeChild
          title={
            chatAutosend
              ? 'Posts your steward announcement to the in-game chat.'
              : 'Puts your steward announcement in the box, ready to send.'
          }
        >
          <Button
            size="small"
            variant="outlined"
            startIcon={<CampaignOutlinedIcon />}
            onClick={onAnnounce}
            sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            Announce
          </Button>
        </Tooltip>
        <TextField
          size="small"
          fullWidth
          value={chatDraft}
          placeholder="Message to the in-game chat"
          inputProps={{
            maxLength: MAX_CHAT_INPUT_LENGTH,
            'aria-label': 'Chat message',
          }}
          onChange={(event) => onChangeChatDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onSend();
            }
          }}
        />
        <Button
          size="small"
          variant="contained"
          startIcon={<SendIcon />}
          disabled={!canSend}
          onClick={onSend}
          sx={{ flexShrink: 0 }}
        >
          Send
        </Button>
        <Tooltip
          describeChild
          title="On: a decision or announcement is posted to chat the moment you press its button. Off: it is put in the box for you to check and send."
        >
          <FormControlLabel
            sx={{ flexShrink: 0, mr: 0 }}
            control={
              <Switch
                size="small"
                checked={chatAutosend}
                onChange={(_event, checked) => onToggleChatAutosend(checked)}
              />
            }
            label="Autosend"
          />
        </Tooltip>
      </Paper>
      <Snackbar
        open={Boolean(result)}
        autoHideDuration={8000}
        onClose={() => setResult(undefined)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        {result ? (
          <Alert
            severity={result.status}
            variant="filled"
            onClose={() => setResult(undefined)}
          >
            {result.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
};
