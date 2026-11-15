import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import {
  LIVE_MAGNITUDE_THRESHOLDS,
  LiveIncidentClassification,
  LiveIncidentFilterOptions,
  LiveIncidentFilters as LiveIncidentFilterState,
  LiveIncidentSort,
  hasActiveLiveIncidentFilters,
  liveClassificationLabel,
} from './liveFixtures';

const ALL = 'ALL';

interface LiveIncidentFiltersProps {
  filters: LiveIncidentFilterState;
  options: LiveIncidentFilterOptions;
  /** How many of the session's incidents survive the current filters. */
  matchCount: number;
  totalCount: number;
  /** How the queue is ordered. Not a filter: it never hides anything. */
  sort: LiveIncidentSort;
  onChange: (patch: Partial<LiveIncidentFilterState>) => void;
  onChangeSort: (next: LiveIncidentSort) => void;
  onReset: () => void;
}

/**
 * Narrows the triage queue without changing what the session contains.
 *
 * It sits above both columns rather than inside the queue for a reason worth
 * stating: at four hundred incidents, finding the one contact a driver has
 * complained about is the actual task, and a filter row squeezed into a 420px
 * column would have to be a menu. The counts the queue shows are all relative
 * to what survives here, which is why the total is spelled out — a steward
 * looking at "12 incidents" needs to know whether that is the session or the
 * filter.
 *
 * Filter state lives in `LiveSessionContext`, so a narrowing set here survives
 * navigating to another live section and back.
 */
export const LiveIncidentFilters: React.FC<LiveIncidentFiltersProps> = ({
  filters,
  options,
  matchCount,
  totalCount,
  sort,
  onChange,
  onChangeSort,
  onReset,
}) => {
  const active = hasActiveLiveIncidentFilters(filters);
  const hidden = filters.hiddenClassifications;

  return (
    <Paper
      variant="outlined"
      sx={{
        borderColor: 'divider',
        borderRadius: 2,
        px: 2,
        py: 1.25,
      }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
        >
          Show
        </Typography>

        {/*
          A chip row rather than a select: classification is the filter a
          steward reaches for most, and it is worth the horizontal space to
          make it one click. Only the kinds this session has actually produced
          are offered — an empty bucket is a dead control.

          Each chip is its own switch. Lit means that kind is in the queue;
          clicking it takes that kind out, and any number can be out at once —
          "no track limits, no spins" is two clicks, not a choice between them.
        */}
        <Stack
          direction="row"
          spacing={0.5}
          flexWrap="wrap"
          useFlexGap
          role="group"
          aria-label="Incident type"
        >
          <Chip
            size="small"
            label="All"
            clickable
            aria-pressed={hidden.length === 0}
            variant={hidden.length === 0 ? 'filled' : 'outlined'}
            color={hidden.length === 0 ? 'primary' : 'default'}
            onClick={() => onChange({ hiddenClassifications: [] })}
          />
          {options.classifications.map((classification) => {
            const isShown = !hidden.includes(classification);
            return (
              <Chip
                key={classification}
                size="small"
                label={liveClassificationLabel[classification]}
                clickable
                aria-pressed={isShown}
                variant={isShown ? 'filled' : 'outlined'}
                color={isShown ? 'primary' : 'default'}
                sx={
                  isShown
                    ? undefined
                    : { textDecoration: 'line-through', opacity: 0.7 }
                }
                onClick={() =>
                  onChange({
                    hiddenClassifications: isShown
                      ? [
                          ...hidden,
                          classification as LiveIncidentClassification,
                        ]
                      : hidden.filter((entry) => entry !== classification),
                  })
                }
              />
            );
          })}
        </Stack>

        <Box sx={{ flex: 1, minWidth: 0 }} />

        {/*
          Beside the filters because it is set in the same breath, but kept out
          of their state: "Clear" resets what is hidden and leaves the order
          alone, since an order is a preference rather than a narrowing.
        */}
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="live-incident-sort-label">Sort</InputLabel>
          <Select
            labelId="live-incident-sort-label"
            id="live-incident-sort"
            label="Sort"
            value={sort}
            onChange={(event) =>
              onChangeSort(event.target.value as LiveIncidentSort)
            }
          >
            <MenuItem value="newest">Newest first</MenuItem>
            <MenuItem value="biggest">Biggest first</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 128 }}>
          <InputLabel id="live-incident-class-label">Car class</InputLabel>
          <Select
            labelId="live-incident-class-label"
            id="live-incident-class"
            label="Car class"
            value={filters.carClass}
            onChange={(event) => onChange({ carClass: event.target.value })}
          >
            <MenuItem value={ALL}>All classes</MenuItem>
            {options.carClasses.map((carClass) => (
              <MenuItem key={carClass} value={carClass}>
                {carClass}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 190 }}>
          <InputLabel id="live-incident-driver-label">Driver</InputLabel>
          <Select
            labelId="live-incident-driver-label"
            id="live-incident-driver"
            label="Driver"
            value={filters.driverSteamId}
            onChange={(event) =>
              onChange({ driverSteamId: event.target.value })
            }
          >
            <MenuItem value={ALL}>All drivers</MenuItem>
            {options.drivers.map((driver) => (
              <MenuItem key={driver.steamId} value={driver.steamId}>
                {driver.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="live-incident-magnitude-label">Magnitude</InputLabel>
          <Select
            labelId="live-incident-magnitude-label"
            id="live-incident-magnitude"
            label="Magnitude"
            value={String(filters.minMagnitude)}
            onChange={(event) =>
              onChange({ minMagnitude: Number(event.target.value) })
            }
          >
            {LIVE_MAGNITUDE_THRESHOLDS.map((threshold) => (
              <MenuItem key={threshold} value={String(threshold)}>
                {threshold === 0 ? 'Any magnitude' : `${threshold}+`}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/*
          Spelled out rather than left to the queue's own chip: once a
          threshold is set the queue is showing contacts only, and a steward who
          has forgotten that reads a filtered list as the whole session.
        */}
        <Typography
          variant="caption"
          color={active ? 'primary.main' : 'text.secondary'}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {active
            ? `${matchCount} of ${totalCount}`
            : `${totalCount} incidents`}
        </Typography>

        {active ? (
          <Button size="small" color="inherit" onClick={onReset}>
            Clear
          </Button>
        ) : null}
      </Stack>
    </Paper>
  );
};
