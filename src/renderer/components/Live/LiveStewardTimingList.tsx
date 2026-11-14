import React from 'react';
import {
  Box,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { CarClassBadge } from '../CarClassBadge/CarClassBadge';
import { LiveStanding } from './liveFixtures';
import {
  LiveCarTone,
  LiveCarTones,
  liveCarToneColor,
  liveCarToneLabel,
  toneForStanding,
} from '../../utils/liveCarTones';

const LEGEND: LiveCarTone[] = ['battle', 'traffic', 'loss', 'contact'];

interface Props {
  standings: LiveStanding[];
  /** Which cars are marked, and how. See `liveCarKeys`. */
  tones: LiveCarTones;
  focusedSlotId?: number;
  onFocusCar: (slotId: number | undefined) => void;
}

/**
 * The field in running order, cut down to what a steward watching for trouble
 * reads: who, where, and how close.
 *
 * Not the timing screen. That one answers "how fast is everyone" and needs
 * sectors and bests to do it; this one sits beside the track map and answers
 * "who should I be looking at", which is the colour on the driver's name.
 *
 * Clicking a row points the game's camera at that car, the same as the timing
 * screen and the map.
 */
const LiveStewardTimingListComponent: React.FC<Props> = ({
  standings,
  tones,
  focusedSlotId,
  onFocusCar,
}) => (
  <Paper
    variant="outlined"
    sx={{
      borderColor: 'divider',
      borderRadius: 2,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
      overflow: 'hidden',
    }}
  >
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      flexWrap="wrap"
      useFlexGap
      sx={{
        px: 2,
        py: 1.25,
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Typography variant="subtitle2" fontWeight={700}>
        Timing
      </Typography>
      <Box sx={{ flex: 1 }} />
      {/* What the colours mean, where the colours are. */}
      {LEGEND.map((tone) => (
        <Chip
          key={tone}
          size="small"
          variant="outlined"
          color={liveCarToneColor[tone]}
          label={liveCarToneLabel[tone]}
          sx={{ height: 20, fontSize: 10 }}
        />
      ))}
    </Stack>

    <TableContainer sx={{ flex: 1, minHeight: 0 }}>
      <Table size="small" stickyHeader aria-label="Live steward timing">
        <TableHead>
          <TableRow>
            <TableCell>Pos</TableCell>
            <TableCell>Class</TableCell>
            <TableCell>Driver</TableCell>
            <TableCell align="right">Gap</TableCell>
            <TableCell align="right">Int</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {standings.map((standing) => {
            const tone = toneForStanding(tones, standing);
            const isFocused =
              standing.slotId !== undefined &&
              standing.slotId === focusedSlotId;

            return (
              <TableRow
                hover
                key={`${standing.steamId}-${standing.slotId ?? standing.position}`}
                data-testid={`steward-timing-row-${standing.slotId ?? standing.steamId}`}
                data-tone={tone ?? 'none'}
                selected={isFocused}
                onClick={() => onFocusCar(standing.slotId)}
                sx={{
                  cursor: 'pointer',
                  // A car in the pits is still in the classification, just not
                  // racing anyone right now.
                  opacity: standing.pitStatus === 'TRK' ? 1 : 0.6,
                  ...(tone
                    ? {
                        backgroundColor: (theme) =>
                          alpha(
                            theme.palette[liveCarToneColor[tone]].main,
                            0.12,
                          ),
                        boxShadow: (theme) =>
                          `inset 3px 0 0 ${theme.palette[liveCarToneColor[tone]].main}`,
                      }
                    : {}),
                }}
              >
                <TableCell sx={{ fontWeight: 700 }}>
                  {standing.position}
                </TableCell>
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <CarClassBadge carClass={standing.carClass} />
                    <Typography variant="caption" color="text.secondary">
                      {standing.classPosition}
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={0.75}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ minWidth: 28 }}
                    >
                      #{standing.carNumber}
                    </Typography>
                    <Typography
                      variant="body2"
                      fontWeight={700}
                      color={
                        tone ? `${liveCarToneColor[tone]}.main` : 'text.primary'
                      }
                      // Said as well as shown, for anyone not reading colour.
                      aria-label={
                        tone
                          ? `${standing.displayName}, ${liveCarToneLabel[tone]}`
                          : undefined
                      }
                    >
                      {standing.displayName}
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell align="right">{standing.gapToLeader}</TableCell>
                <TableCell align="right">{standing.interval}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  </Paper>
);

export const LiveStewardTimingList = React.memo(LiveStewardTimingListComponent);
