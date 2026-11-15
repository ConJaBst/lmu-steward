import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import { CarClassBadge } from '../../components/CarClassBadge/CarClassBadge';
import { LiveStanding } from '../../components/Live/liveFixtures';
import { livePenaltyKey } from '../../hooks/useLivePenaltyHistory';
import { useApi } from '../../providers/ApiContext';
import { useLiveSession } from '../../providers/LiveSessionContext';
import {
  SIMGRID_PAGE_COMMANDS,
  describeSimgridCommand,
} from '../../utils/simgridCommands';

type Standing = 'active' | 'cleared' | 'none';

interface Row {
  key: string;
  standing: LiveStanding;
  active: number;
  cleared: number;
  status: Standing;
}

const statusRank: Record<Standing, number> = { active: 0, cleared: 1, none: 2 };

/**
 * `/live/penalties` — who has a penalty to serve, who has had one, and a way to
 * give one.
 *
 * The list is the game's own count of penalties outstanding per driver, off the
 * live feed, with a history built by watching that count (see
 * `useLivePenaltyHistory` for what that can and cannot see). Red is a penalty
 * still to serve; grey is one that has come off. Drivers with neither are
 * hidden until asked for, because on a clean night the interesting list is
 * short.
 *
 * Selecting a driver opens the same commands SimGrid's Server Commands page
 * offers, for that driver. They go through the SimGrid connector and through
 * the same confirmation as a penalty that follows a decision: nothing is sent
 * until the steward has read the driver and the command back and said yes.
 */
export const LivePenalties: React.FC = () => {
  const { simgridServerCommandsUrl } = useApi();
  const {
    standings,
    penaltyHistory,
    isReviewingRecord,
    onRequestServerCommand,
  } = useLiveSession();
  const [showAll, setShowAll] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);
  const [command, setCommand] = useState(SIMGRID_PAGE_COMMANDS[0].command);
  const [code, setCode] = useState('');

  const rows = useMemo<Row[]>(
    () =>
      standings
        .map((standing) => {
          const key = livePenaltyKey(standing);
          const record = penaltyHistory.get(key);
          const active = record?.active ?? standing.outstandingPenalties ?? 0;
          const cleared = record?.cleared ?? 0;
          let status: Standing = 'none';
          if (active > 0) {
            status = 'active';
          } else if (cleared > 0) {
            status = 'cleared';
          }

          return { key, standing, active, cleared, status };
        })
        .sort(
          (a, b) =>
            statusRank[a.status] - statusRank[b.status] ||
            b.active - a.active ||
            a.standing.position - b.standing.position,
        ),
    [penaltyHistory, standings],
  );

  const activeCount = rows.filter((row) => row.status === 'active').length;
  const clearedCount = rows.filter((row) => row.status === 'cleared').length;
  // A selected driver stays listed, whatever the toggle says.
  const visible = rows.filter(
    (row) => showAll || row.status !== 'none' || row.key === selectedKey,
  );
  const selected = rows.find((row) => row.key === selectedKey);

  const spec =
    SIMGRID_PAGE_COMMANDS.find((entry) => entry.command === command) ??
    SIMGRID_PAGE_COMMANDS[0];
  const needsValue = Boolean(spec.options);
  const connectorReady = Boolean(simgridServerCommandsUrl.trim());
  const canSend =
    Boolean(selected) &&
    connectorReady &&
    !isReviewingRecord &&
    (!needsValue || code !== '');

  const onSend = () => {
    if (!selected || !canSend) {
      return;
    }
    const value = needsValue ? Number(code) : undefined;
    onRequestServerCommand({
      driverName: selected.standing.displayName,
      carNumber: selected.standing.carNumber,
      description: describeSimgridCommand(spec.command, value),
      simgrid: { command: spec.command, code: value },
    });
  };

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: {
          xs: '1fr',
          lg: selected ? 'minmax(0, 1fr) minmax(320px, 36%)' : '1fr',
        },
        height: { xs: 'auto', lg: '100%' },
        minHeight: 0,
        boxSizing: 'border-box',
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          borderColor: 'divider',
          borderRadius: 2,
          display: 'flex',
          flexDirection: 'column',
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
            Penalties
          </Typography>
          <Chip
            size="small"
            color="error"
            variant={activeCount > 0 ? 'filled' : 'outlined'}
            label={`${activeCount} to serve`}
          />
          <Chip
            size="small"
            variant="outlined"
            label={`${clearedCount} cleared`}
          />
          <Box sx={{ flex: 1 }} />
          <FormControlLabel
            sx={{ mr: 0 }}
            control={
              <Switch
                size="small"
                checked={showAll}
                onChange={(_event, checked) => setShowAll(checked)}
              />
            }
            label="Show drivers with no penalty"
          />
        </Stack>

        {visible.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Nobody has a penalty to serve, and none have been cleared since
              this app started watching the session.
            </Typography>
            <Button
              size="small"
              sx={{ mt: 1 }}
              onClick={() => setShowAll(true)}
            >
              Show every driver
            </Button>
          </Box>
        ) : (
          <TableContainer sx={{ flex: 1, minHeight: 0 }}>
            <Table size="small" stickyHeader aria-label="Driver penalties">
              <TableHead>
                <TableRow>
                  <TableCell>Pos</TableCell>
                  <TableCell>Class</TableCell>
                  <TableCell>Driver</TableCell>
                  <TableCell>Penalties</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.map((row) => {
                  let nameColor = 'text.primary';
                  if (row.status === 'active') {
                    nameColor = 'error.main';
                  } else if (row.status === 'cleared') {
                    nameColor = 'text.secondary';
                  }

                  return (
                    <TableRow
                      hover
                      key={row.key}
                      data-testid={`penalty-row-${row.key}`}
                      data-status={row.status}
                      selected={row.key === selectedKey}
                      onClick={() =>
                        setSelectedKey(
                          row.key === selectedKey ? undefined : row.key,
                        )
                      }
                      sx={{
                        cursor: 'pointer',
                        ...(row.status === 'active'
                          ? {
                              backgroundColor: (theme) =>
                                alpha(theme.palette.error.main, 0.12),
                              boxShadow: (theme) =>
                                `inset 3px 0 0 ${theme.palette.error.main}`,
                            }
                          : {}),
                      }}
                    >
                      <TableCell sx={{ fontWeight: 700 }}>
                        {row.standing.position}
                      </TableCell>
                      <TableCell>
                        <CarClassBadge carClass={row.standing.carClass} />
                      </TableCell>
                      <TableCell>
                        <Stack
                          direction="row"
                          alignItems="center"
                          spacing={0.75}
                        >
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ minWidth: 28 }}
                          >
                            #{row.standing.carNumber}
                          </Typography>
                          <Typography
                            variant="body2"
                            fontWeight={700}
                            color={nameColor}
                          >
                            {row.standing.displayName}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5}>
                          {row.active > 0 ? (
                            <Chip
                              size="small"
                              color="error"
                              label={`${row.active} to serve`}
                            />
                          ) : null}
                          {row.cleared > 0 ? (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={`${row.cleared} cleared`}
                            />
                          ) : null}
                          {row.status === 'none' ? (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              None
                            </Typography>
                          ) : null}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {selected ? (
        <Paper
          variant="outlined"
          component="section"
          aria-label="Server commands"
          sx={{
            borderColor: 'divider',
            borderRadius: 2,
            p: 2,
            alignSelf: 'start',
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
          >
            Server commands
          </Typography>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
            #{selected.standing.carNumber} {selected.standing.displayName}
          </Typography>

          <Stack spacing={1.5}>
            {/* The same commands, in the same order, as SimGrid's own page. */}
            <TextField
              select
              size="small"
              label="Command"
              value={command}
              onChange={(event) => {
                setCommand(event.target.value);
                setCode('');
              }}
              SelectProps={{ native: true }}
              inputProps={{ 'aria-label': 'Server command' }}
            >
              {SIMGRID_PAGE_COMMANDS.map((entry) => (
                <option key={entry.command} value={entry.command}>
                  {entry.label}
                </option>
              ))}
            </TextField>

            {spec.options ? (
              <TextField
                select
                size="small"
                label={spec.valueLabel}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                SelectProps={{ native: true }}
                InputLabelProps={{ shrink: true }}
                inputProps={{ 'aria-label': 'Server command value' }}
              >
                <option value="">Select {spec.valueLabel}</option>
                {spec.options.map((option) => (
                  <option key={option.code} value={String(option.code)}>
                    {option.label}
                  </option>
                ))}
              </TextField>
            ) : null}

            {!connectorReady ? (
              <Alert severity="info">
                Set up the SimGrid connector in User Settings to send commands.
              </Alert>
            ) : null}
            {isReviewingRecord ? (
              <Alert severity="info">
                Commands go to the session that is running now, not to a
                finished one being read back.
              </Alert>
            ) : null}

            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                color="warning"
                startIcon={<GavelOutlinedIcon />}
                disabled={!canSend}
                onClick={onSend}
              >
                Send command
              </Button>
              <Button onClick={() => setSelectedKey(undefined)}>Close</Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              You are asked to confirm before anything is sent. A command sent
              from here is not recorded as a steward decision.
            </Typography>
          </Stack>
        </Paper>
      ) : null}
    </Box>
  );
};
