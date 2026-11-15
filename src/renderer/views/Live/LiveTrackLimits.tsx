import { useMemo } from 'react';
import {
  Box,
  Chip,
  LinearProgress,
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
import { CarClassBadge } from '../../components/CarClassBadge/CarClassBadge';
import { useLiveSession } from '../../providers/LiveSessionContext';
import {
  formatTrackLimitPoints,
  formatTrackLimitStanding,
  trackLimitProgress,
} from '../../utils/trackLimits';

/** Where the bar changes colour: half way is worth a look, three quarters a warning. */
const toneFor = (progress: number): 'error' | 'warning' | 'primary' => {
  if (progress >= 0.75) {
    return 'error';
  }
  return progress >= 0.5 ? 'warning' : 'primary';
};

/**
 * `/live/track-limits` — every driver, ordered by how close they are to a
 * track-limits penalty.
 *
 * The number is the game's own: the running points total it reports with each
 * track-limit message, against the server's limit. Closest to the limit first,
 * so the driver about to get a drive-through is the top row.
 *
 * One thing the number is not: live. The game only says a driver's total when
 * it sends a track-limit message about them, so each figure is "as of their
 * last message" — exact at that moment, and silent about anything the game has
 * done to the total since without saying so.
 */
export const LiveTrackLimits: React.FC = () => {
  const { standings, session, onFocusCar } = useLiveSession();
  const limit = session.trackLimitPointsLimit;

  const rows = useMemo(
    () =>
      standings
        .map((standing) => ({
          standing,
          points: standing.trackLimitPoints ?? 0,
          progress: trackLimitProgress(standing.trackLimitPoints, limit),
        }))
        .sort(
          (a, b) =>
            b.points - a.points ||
            b.standing.trackLimitStrikes - a.standing.trackLimitStrikes ||
            a.standing.position - b.standing.position,
        ),
    [limit, standings],
  );

  const onPoints = rows.filter((row) => row.points > 0).length;

  return (
    <Paper
      variant="outlined"
      sx={{
        borderColor: 'divider',
        borderRadius: 2,
        display: 'flex',
        flexDirection: 'column',
        height: { xs: 'auto', lg: '100%' },
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
          Track Limits
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          label={
            limit === undefined
              ? 'Penalty limit not reported'
              : `Penalty at ${formatTrackLimitPoints(limit)} points`
          }
        />
        <Chip
          size="small"
          variant="outlined"
          label={`${onPoints} driver${onPoints === 1 ? '' : 's'} on points`}
        />
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">
          Each total is as of that driver&apos;s last track-limit message.
        </Typography>
      </Stack>

      <TableContainer sx={{ flex: 1, minHeight: 0 }}>
        <Table size="small" stickyHeader aria-label="Track limits by driver">
          <TableHead>
            <TableRow>
              <TableCell>Pos</TableCell>
              <TableCell>Class</TableCell>
              <TableCell>Driver</TableCell>
              <TableCell sx={{ width: '34%' }}>Points</TableCell>
              <TableCell align="right">To penalty</TableCell>
              <TableCell align="right">Warnings</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(({ standing, points, progress }) => {
              const tone = toneFor(progress);

              return (
                <TableRow
                  hover
                  key={`${standing.steamId}-${standing.slotId ?? standing.position}`}
                  data-testid={`track-limits-row-${standing.slotId ?? standing.steamId}`}
                  onClick={() => onFocusCar(standing.slotId)}
                  sx={{ cursor: 'pointer', opacity: points > 0 ? 1 : 0.6 }}
                >
                  <TableCell sx={{ fontWeight: 700 }}>
                    {standing.position}
                  </TableCell>
                  <TableCell>
                    <CarClassBadge carClass={standing.carClass} />
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
                      <Typography variant="body2" fontWeight={700}>
                        {standing.displayName}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography
                        variant="body2"
                        fontWeight={700}
                        color={points > 0 ? `${tone}.main` : 'text.secondary'}
                        sx={{ minWidth: 68 }}
                      >
                        {formatTrackLimitStanding(points, limit)}
                      </Typography>
                      {limit !== undefined ? (
                        <LinearProgress
                          variant="determinate"
                          value={progress * 100}
                          color={tone}
                          aria-label={`${standing.displayName} track limit points`}
                          sx={{ flex: 1, height: 6, borderRadius: 3 }}
                        />
                      ) : null}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    {limit !== undefined && points > 0
                      ? formatTrackLimitPoints(Math.max(0, limit - points))
                      : '—'}
                  </TableCell>
                  <TableCell align="right">
                    {standing.trackLimitStrikes}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};
