import React, { useCallback, useEffect, useState } from 'react';
import LoginIcon from '@mui/icons-material/Login';
import SyncIcon from '@mui/icons-material/Sync';
import {
  Alert,
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { CONSTANTS } from '@constants';
import { useApi } from '../../providers/ApiContext';
import { sendMessage } from '../../utils/postMessage';

type Status =
  | { state: 'unconfigured' }
  | { state: 'signed-out' }
  | { state: 'ready'; drivers: string[] }
  | { state: 'error'; message: string };

const describe = (
  status: Status,
): { severity: 'success' | 'warning' | 'error' | 'info'; text: string } => {
  switch (status.state) {
    case 'ready':
      return {
        severity: 'success',
        text: `Connected. SimGrid lists ${status.drivers.length} driver${
          status.drivers.length === 1 ? '' : 's'
        } on this server.`,
      };
    case 'signed-out':
      return {
        severity: 'warning',
        text: 'SimGrid did not show the Server Commands page. Sign in to SimGrid, and check that the link is for an event you can administer.',
      };
    case 'unconfigured':
      return {
        severity: 'info',
        text: 'Paste the Server Commands link first.',
      };
    default:
      return { severity: 'error', text: status.message };
  }
};

interface Props {
  disabled?: boolean;
}

/**
 * Sets up the SimGrid connector: which server, and whether the steward is
 * signed in.
 *
 * The link is the address of the event's Server Commands page on SimGrid — the
 * one place that identifies the server — and it changes with every event, so it
 * sits here to be pasted rather than being looked up.
 *
 * Signing in happens in a window showing SimGrid's own page. Nothing typed
 * there passes through this app; all it keeps is the resulting session, and
 * all it can do with that session is the handful of commands in
 * `src/main/api/simgrid.ts`.
 *
 * Saved straight to settings rather than through the settings view's autosave,
 * like the autosend switch: it is one value, and "Check connection" has to see
 * it the moment it is typed.
 */
export const SimgridConnectorSettings: React.FC<Props> = ({
  disabled = false,
}) => {
  const {
    subscribeToApiChannel,
    simgridServerCommandsUrl,
    setSimgridServerCommandsUrl,
  } = useApi();
  const [link, setLink] = useState(simgridServerCommandsUrl);
  const [status, setStatus] = useState<Status | null>(null);
  const [checking, setChecking] = useState(false);

  // Follows the stored value when it arrives or changes elsewhere.
  useEffect(
    () => setLink(simgridServerCommandsUrl),
    [simgridServerCommandsUrl],
  );

  const check = useCallback(() => {
    setChecking(true);
    sendMessage(CONSTANTS.API.GET_SIMGRID_STATUS);
  }, []);

  useEffect(() => {
    const unsubscribeStatus = subscribeToApiChannel(
      CONSTANTS.API.GET_SIMGRID_STATUS,
      (payload: unknown) => {
        setChecking(false);
        setStatus(payload as Status);
      },
    );
    // The sign-in window closing is the cue to look again.
    const unsubscribeSignIn = subscribeToApiChannel(
      CONSTANTS.API.POST_SIMGRID_SIGN_IN,
      () => check(),
    );

    return () => {
      unsubscribeStatus?.();
      unsubscribeSignIn?.();
    };
  }, [check, subscribeToApiChannel]);

  const save = () => {
    if (link.trim() !== simgridServerCommandsUrl) {
      setSimgridServerCommandsUrl(link.trim());
      setStatus(null);
    }
  };

  const shown = status ? describe(status) : null;

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 2,
      }}
    >
      <Typography variant="subtitle2" fontWeight={600}>
        SimGrid Connector (Experimental)
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mb: 1.5 }}
      >
        Applies penalties on a SimGrid-hosted server, the same way
        SimGrid&apos;s Server Commands page does. Paste that page&apos;s link
        for the event you are stewarding, and sign in to SimGrid in the window
        this opens — your password goes to SimGrid, never to this app. After a
        call whose action has a server penalty, the live screen asks before
        anything is applied. This relies on a SimGrid page that can change
        without notice.
      </Typography>

      <TextField
        size="small"
        fullWidth
        value={link}
        placeholder="https://www.thesimgrid.com/admin/race_server_configs/…/modules/server_commands"
        inputProps={{ 'aria-label': 'SimGrid Server Commands link' }}
        onChange={(event) => setLink(event.target.value)}
        onBlur={save}
        disabled={disabled}
      />

      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<LoginIcon />}
          onClick={() => {
            save();
            sendMessage(CONSTANTS.API.POST_SIMGRID_SIGN_IN);
          }}
          disabled={disabled}
        >
          Sign in to SimGrid
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<SyncIcon />}
          onClick={() => {
            save();
            check();
          }}
          disabled={disabled || checking}
        >
          {checking ? 'Checking…' : 'Check connection'}
        </Button>
      </Stack>

      {shown ? (
        <Alert severity={shown.severity} sx={{ mt: 1.5 }}>
          {shown.text}
        </Alert>
      ) : null}
    </Box>
  );
};
