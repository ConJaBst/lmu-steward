import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Stack, TextField } from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import { StewardAction } from '../../utils/stewardActions';
import { LiveIncident } from './liveFixtures';

export interface LiveCustomDecisionCall {
  targetSteamId: string;
  outcome: string;
  reasoning: string;
}

interface Props {
  incident: LiveIncident;
  /** The configured tariff. Only the calls against a driver are offered. */
  actions: readonly StewardAction[];
  /** The driver already selected in the dossier, offered as the starting pick. */
  defaultSteamId?: string;
  onSubmit: (call: LiveCustomDecisionCall) => void;
}

/**
 * The last button in the tariff row: a call assembled by hand.
 *
 * The one-press buttons take the driver from the dossier's selection and the
 * reason from the box above them. This asks for all three in one place — which
 * driver, which penalty, why — for the call that does not fit a single press.
 *
 * It records through the same path as every other button, so the result is an
 * ordinary decision and an ordinary chat line; nothing downstream can tell it
 * was made here.
 *
 * Native selects rather than MUI menus: they are keyboard-complete for free and
 * do not portal out of the dossier.
 */
export const LiveCustomDecision: React.FC<Props> = ({
  incident,
  actions,
  defaultSteamId,
  onSubmit,
}) => {
  const penalties = useMemo(
    () => actions.filter((action) => action.driverScoped),
    [actions],
  );
  const [open, setOpen] = useState(false);
  const [steamId, setSteamId] = useState('');
  const [outcome, setOutcome] = useState('');
  const [reasoning, setReasoning] = useState('');

  // A half-filled form belongs to the incident it was opened on.
  useEffect(() => {
    setOpen(false);
    setSteamId('');
    setOutcome('');
    setReasoning('');
  }, [incident.id]);

  const pickedSteamId =
    steamId || defaultSteamId || incident.drivers[0]?.steamId || '';
  const pickedOutcome = outcome || penalties[0]?.label || '';
  const canApply = Boolean(pickedSteamId && pickedOutcome);

  return (
    <>
      <Button
        size="small"
        variant={open ? 'contained' : 'outlined'}
        color="secondary"
        startIcon={<TuneIcon />}
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
      >
        Custom
      </Button>
      {open ? (
        // Full width, so it drops below the wrapped row of buttons.
        <Box sx={{ flexBasis: '100%' }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1}
            alignItems={{ md: 'center' }}
          >
            <TextField
              select
              size="small"
              label="Driver"
              value={pickedSteamId}
              onChange={(event) => setSteamId(event.target.value)}
              SelectProps={{ native: true }}
              inputProps={{ 'aria-label': 'Custom decision driver' }}
              sx={{ minWidth: 200 }}
            >
              {incident.drivers.map((driver) => (
                <option key={driver.steamId} value={driver.steamId}>
                  {driver.displayName} #{driver.carNumber}
                </option>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Penalty"
              value={pickedOutcome}
              onChange={(event) => setOutcome(event.target.value)}
              SelectProps={{ native: true }}
              inputProps={{ 'aria-label': 'Custom decision penalty' }}
              sx={{ minWidth: 170 }}
            >
              {penalties.map((action) => (
                <option key={action.id} value={action.label}>
                  {action.label}
                </option>
              ))}
            </TextField>
            <TextField
              size="small"
              fullWidth
              label="Reason"
              value={reasoning}
              onChange={(event) => setReasoning(event.target.value)}
              inputProps={{ 'aria-label': 'Custom decision reason' }}
            />
            <Button
              size="small"
              variant="contained"
              disabled={!canApply}
              onClick={() => {
                onSubmit({
                  targetSteamId: pickedSteamId,
                  outcome: pickedOutcome,
                  reasoning,
                });
                setOpen(false);
                setReasoning('');
              }}
              sx={{ flexShrink: 0 }}
            >
              Apply
            </Button>
          </Stack>
        </Box>
      ) : null}
    </>
  );
};
