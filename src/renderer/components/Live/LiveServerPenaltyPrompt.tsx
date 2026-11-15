import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Snackbar,
} from '@mui/material';
import { CONSTANTS } from '@constants';
import { useApi } from '../../providers/ApiContext';
import { useLiveSession } from '../../providers/LiveSessionContext';

interface Outcome {
  status: 'success' | 'error';
  message: string;
}

/**
 * "Apply this on the server?" — asked after a call whose action carries a
 * server penalty, and never answered for the steward.
 *
 * Recording a decision and penalising a car are different acts. The first is a
 * note in this app that can be revised; the second changes somebody's race and
 * goes through a third party. So the decision is saved the moment it is made,
 * as always, and this asks about the second part separately, naming the driver
 * and the penalty in full. Declining leaves the decision exactly as recorded.
 *
 * SimGrid's answer is shown either way. A penalty the steward believes was
 * applied and was not is worse than one they know failed.
 */
export const LiveServerPenaltyPrompt: React.FC = () => {
  const { subscribeToApiChannel } = useApi();
  const { pendingServerPenalty, onApplyServerPenalty, onDismissServerPenalty } =
    useLiveSession();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Outcome | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = subscribeToApiChannel(
      CONSTANTS.API.POST_SIMGRID_COMMAND,
      (payload: unknown) => {
        const response = payload as Partial<Outcome> | undefined;
        setSending(false);
        setResult({
          status: response?.status === 'success' ? 'success' : 'error',
          message:
            response?.message ??
            'SimGrid did not answer. Nothing was confirmed.',
        });
      },
    );

    return () => unsubscribe?.();
  }, [subscribeToApiChannel]);

  const pending = pendingServerPenalty;

  return (
    <>
      <Dialog
        open={Boolean(pending)}
        onClose={onDismissServerPenalty}
        aria-labelledby="server-penalty-title"
      >
        {pending ? (
          <>
            <DialogTitle id="server-penalty-title">
              Send this to the server?
            </DialogTitle>
            <DialogContent>
              <DialogContentText>
                <strong>{pending.description}</strong> for{' '}
                <strong>
                  {pending.driverName} #{pending.carNumber}
                </strong>
                , sent through SimGrid.
                {pending.outcome
                  ? ` Your decision (${pending.outcome}) is already recorded either way.`
                  : ''}
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={onDismissServerPenalty}>Not now</Button>
              <Button
                variant="contained"
                color="warning"
                onClick={() => {
                  setSending(true);
                  setResult(undefined);
                  onApplyServerPenalty();
                }}
              >
                Apply on server
              </Button>
            </DialogActions>
          </>
        ) : null}
      </Dialog>
      <Snackbar
        open={sending || Boolean(result)}
        autoHideDuration={sending ? null : 10000}
        onClose={() => setResult(undefined)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        {sending ? (
          <Alert severity="info" variant="filled">
            Sending to SimGrid…
          </Alert>
        ) : (
          <Alert
            severity={result?.status ?? 'info'}
            variant="filled"
            onClose={() => setResult(undefined)}
          >
            {result?.message}
          </Alert>
        )}
      </Snackbar>
    </>
  );
};
