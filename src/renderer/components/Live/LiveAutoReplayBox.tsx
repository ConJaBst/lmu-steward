import {
  Box,
  FormControlLabel,
  Paper,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material';
import { LiveAutoReplayState } from '../../hooks/useLiveAutoReplay';
import { LiveIncident, liveClassificationLabel } from './liveFixtures';

interface Props {
  enabled: boolean;
  minMagnitude: number;
  state: LiveAutoReplayState;
  onToggle: (enabled: boolean) => void;
}

/** `12:41 · Drake vs Lindqvist · 900` — enough to know what is coming. */
export const summariseAutoReplayIncident = (incident: LiveIncident): string =>
  [
    incident.timestampLabel,
    incident.drivers.map((driver) => driver.displayName).join(' vs ') ||
      liveClassificationLabel[incident.classification],
    incident.contactMagnitude !== undefined
      ? `${Math.round(incident.contactMagnitude)} magnitude`
      : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * The auto replay switch, and what it is doing.
 *
 * Auto replay moves the game's picture by itself, so the box says what it is
 * showing, how long it has been showing it, and what happens next and when —
 * the next replay, or back to live. A picture that changes with no warning
 * reads as a fault.
 */
export const LiveAutoReplayBox: React.FC<Props> = ({
  enabled,
  minMagnitude,
  state,
  onToggle,
}) => {
  const { current, next, elapsedSeconds, secondsUntilNext, queuedBehindNext } =
    state;
  const more = queuedBehindNext > 0 ? ` (+${queuedBehindNext} more)` : '';

  let nowLine: string;
  let nextLine: string | undefined;

  if (!enabled) {
    nowLine = `${minMagnitude}+ magnitude`;
  } else if (current) {
    nowLine = `Replaying ${current.timestampLabel} · ${elapsedSeconds}s`;
    nextLine = next
      ? `Next in ${secondsUntilNext ?? 0}s: ${summariseAutoReplayIncident(next)}${more}`
      : `Back to live in ${secondsUntilNext ?? 0}s`;
  } else if (next) {
    // Something is waiting on the steward, not on a clock.
    nowLine = 'Waiting for you to finish';
    nextLine = `Next: ${summariseAutoReplayIncident(next)}${more}`;
  } else {
    nowLine = `Watching for ${minMagnitude}+ magnitude`;
  }

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-label="Auto replay"
      sx={{
        borderColor: enabled ? 'primary.main' : 'divider',
        borderRadius: 2,
        px: 2,
        py: 0.75,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        flexShrink: 0,
        minWidth: 0,
        maxWidth: { lg: 420 },
      }}
    >
      <Tooltip
        describeChild
        title={`When on, a new incident of magnitude ${minMagnitude} or more opens here and rewinds the game's picture to it. After 10 seconds the most recent one waiting takes over; with none waiting, the picture returns to live after 20. Pressing Live, or switching this off and on, clears what is waiting. It never interrupts an incident you opened yourself. Change the number in User Settings.`}
      >
        <FormControlLabel
          sx={{ mr: 0, flexShrink: 0 }}
          control={
            <Switch
              size="small"
              checked={enabled}
              onChange={(_event, checked) => onToggle(checked)}
            />
          }
          label="Auto replay"
        />
      </Tooltip>
      <Box sx={{ minWidth: 0 }} aria-live="polite">
        <Typography
          variant="caption"
          color={current ? 'primary.main' : 'text.secondary'}
          fontWeight={current ? 700 : 400}
          noWrap
          sx={{ display: 'block' }}
        >
          {nowLine}
        </Typography>
        {nextLine ? (
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            title={nextLine}
            sx={{ display: 'block' }}
          >
            {nextLine}
          </Typography>
        ) : null}
      </Box>
    </Paper>
  );
};
