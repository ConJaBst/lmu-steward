import { useMemo } from 'react';
import { Box, Button, Stack } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { LiveAutoReplayBox } from '../../components/Live/LiveAutoReplayBox';
import { LiveIncidentFilters } from '../../components/Live/LiveIncidentFilters';
import { LiveTriageQueue } from '../../components/Live/LiveTriageQueue';
import { LiveIncidentDossier } from '../../components/Live/LiveIncidentDossier';
import { LiveStewardTimingList } from '../../components/Live/LiveStewardTimingList';
import { LiveTrackMap } from '../../components/Live/LiveTrackMap';
import { matchesLiveIncidentFilters } from '../../components/Live/liveFixtures';
import {
  mergeLiveCarPositions,
  useLiveCarPositions,
} from '../../hooks/useLiveCarPositions';
import { useLiveAutoReplay } from '../../hooks/useLiveAutoReplay';
import { useLiveIncidentAlerts } from '../../hooks/useLiveIncidentAlerts';
import { useApi } from '../../providers/ApiContext';
import { useLiveSession } from '../../providers/LiveSessionContext';
import { buildLiveCarTones } from '../../utils/liveCarTones';
import { RESOLVED_QUIETLY_OUTCOME } from '../../utils/stewardActions';

/**
 * `/live/steward` — the one screen a steward can sit on for a whole session.
 *
 * The incident queue is always on the left. The right-hand side is whichever of
 * two things the steward needs at that moment:
 *
 *   nothing selected   the timing list and the track map, with cars marked by
 *                      what they are doing — green for a same-class battle,
 *                      blue for traffic, yellow for a loss of control, red for
 *                      contact
 *   an incident picked the dossier for it, with a way back
 *
 * Watching and adjudicating are the same job done in turns, and the incidents
 * and timing screens made it two places to be.
 *
 * **This view re-renders at 5 Hz** while the map is showing, because it owns
 * the position feed the map consumes — the same arrangement, for the same
 * reason, as `LiveTiming`.
 */
export const LiveSteward: React.FC = () => {
  const { liveAutoReplayMinMagnitude } = useApi();
  const {
    incidents,
    standings,
    battles,
    trackMap,
    focusedSlotId,
    liveIndicator,
    useFixtures,
    isReviewingRecord,
    canDriveCamera,
    isReplayActive,
    selectedIncident,
    selectedIncidentId,
    stateFilter,
    incidentFilters,
    incidentFilterOptions,
    incidentSort,
    priorCallsByDriver,
    reasoningDraft,
    targetSteamId,
    autoReplay,
    onToggleAutoReplay,
    onChangeReasoning,
    onSelectIncident,
    onClearSelectedIncident,
    onChangeStateFilter,
    onChangeIncidentFilters,
    onChangeIncidentSort,
    onResetIncidentFilters,
    onSelectTarget,
    onFocusCar,
    onRewatchIncident,
    onReturnToLive,
    returnToLiveCount,
    sessionKey,
    onFlag,
    onDefer,
    onDecide,
  } = useLiveSession();

  const showingMap = !selectedIncident;

  // Only while the map is on screen: nothing else here reads a position.
  const carPositions = useLiveCarPositions(
    showingMap && !useFixtures && liveIndicator.state === 'live',
  );
  const positioned = useMemo(
    () => mergeLiveCarPositions(standings, carPositions),
    [carPositions, standings],
  );

  /*
    Not against a record. A finished segment's incidents are not happening now,
    and the battles feed describes the session that is running, not the one
    being read back.
  */
  const alerts = useLiveIncidentAlerts(incidents, !isReviewingRecord);
  const tones = useMemo(
    () => buildLiveCarTones(isReviewingRecord ? [] : battles, alerts),
    [alerts, battles, isReviewingRecord],
  );

  const matchCount = useMemo(
    () =>
      incidents.filter((incident) =>
        matchesLiveIncidentFilters(incident, incidentFilters),
      ).length,
    [incidentFilters, incidents],
  );

  // The whole cycle — queue, timers, return to live — lives in the hook.
  const autoReplayState = useLiveAutoReplay({
    enabled: autoReplay,
    incidents,
    minMagnitude: liveAutoReplayMinMagnitude,
    canReplay: canDriveCamera && !isReviewingRecord,
    listKey: `${sessionKey}|${isReviewingRecord ? 'record' : 'live'}`,
    returnToLiveCount,
    selectedIncidentId,
    isReplayActive,
    onSelectIncident,
    onClearSelectedIncident,
    onRewatchIncident,
    onReturnToLive,
  });

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: {
          xs: '1fr',
          lg: 'minmax(360px, 30%) minmax(0, 1fr)',
        },
        gridTemplateRows: { xs: 'auto', lg: 'auto minmax(0, 1fr)' },
        gridAutoRows: { xs: 'minmax(360px, auto)', lg: 'minmax(0, 1fr)' },
        height: { xs: 'auto', lg: '100%' },
        boxSizing: 'border-box',
      }}
    >
      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        spacing={2}
        sx={{ gridColumn: '1 / -1' }}
      >
        <LiveAutoReplayBox
          enabled={autoReplay}
          minMagnitude={liveAutoReplayMinMagnitude}
          state={autoReplayState}
          onToggle={onToggleAutoReplay}
        />

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <LiveIncidentFilters
            filters={incidentFilters}
            options={incidentFilterOptions}
            matchCount={matchCount}
            totalCount={incidents.length}
            sort={incidentSort}
            onChange={onChangeIncidentFilters}
            onChangeSort={onChangeIncidentSort}
            onReset={onResetIncidentFilters}
          />
        </Box>
      </Stack>

      <LiveTriageQueue
        incidents={incidents}
        selectedIncidentId={selectedIncidentId}
        stateFilter={stateFilter}
        filters={incidentFilters}
        sort={incidentSort}
        onSelectIncident={onSelectIncident}
        onChangeStateFilter={onChangeStateFilter}
        onClearFilters={onResetIncidentFilters}
      />

      {selectedIncident ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            minHeight: 0,
            minWidth: 0,
          }}
        >
          <Box>
            <Button
              size="small"
              startIcon={<ArrowBackIcon />}
              onClick={onClearSelectedIncident}
            >
              Back to timing and map
            </Button>
          </Box>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <LiveIncidentDossier
              incident={selectedIncident}
              targetSteamId={targetSteamId}
              priorCallsByDriver={priorCallsByDriver}
              reasoning={reasoningDraft}
              onChangeReasoning={onChangeReasoning}
              onSelectTarget={onSelectTarget}
              // Neither against a record, for the reasons `LiveIncidents` gives.
              onFocusCar={isReviewingRecord ? undefined : onFocusCar}
              onRewatch={isReviewingRecord ? undefined : onRewatchIncident}
              onFlag={onFlag}
              onDefer={onDefer}
              onDecide={onDecide}
              onResolveQuietly={
                isReviewingRecord
                  ? undefined
                  : (incidentId) =>
                      onDecide(incidentId, RESOLVED_QUIETLY_OUTCOME)
              }
              onDecideCustom={(incidentId, call) =>
                onDecide(incidentId, call.outcome, {
                  targetSteamId: call.targetSteamId,
                  reasoning: call.reasoning,
                })
              }
            />
          </Box>
        </Box>
      ) : (
        /*
          List beside map. The map column is capped for the reason the timing
          screen gives: the geometry is drawn into a square viewBox, so past a
          certain width the extra space is letterbox.
        */
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {
              xs: '1fr',
              xl: 'minmax(0, 1fr) minmax(320px, 46%)',
            },
            gridTemplateRows: {
              xs: 'minmax(280px, auto) minmax(300px, auto)',
              lg: 'minmax(0, 1fr) minmax(0, 1fr)',
              xl: 'minmax(0, 1fr)',
            },
            minHeight: 0,
            minWidth: 0,
          }}
        >
          <LiveStewardTimingList
            standings={standings}
            tones={tones}
            focusedSlotId={focusedSlotId}
            onFocusCar={onFocusCar}
          />
          <Box sx={{ minHeight: { xs: 300, lg: 0 } }}>
            <LiveTrackMap
              points={trackMap.points}
              pitPoints={trackMap.pitPoints}
              state={trackMap.state}
              error={trackMap.error}
              visibleStandings={positioned.standings}
              classFilter="ALL"
              focusedSlotId={focusedSlotId}
              positionsFromFastFeed={positioned.fromFastFeed}
              tones={tones}
              onFocusCar={onFocusCar}
            />
          </Box>
        </Box>
      )}
    </Box>
  );
};
