import { useEffect, useMemo, useRef, useState } from 'react';
import { LiveIncident } from '../components/Live/liveFixtures';
import {
  LIVE_ALERT_WINDOW_MS,
  LiveCarAlert,
  alertToneFor,
} from '../utils/liveCarTones';

/**
 * The incidents that have *just* happened, for marking their cars.
 *
 * "Just" is measured from when this screen first saw the incident, on the wall
 * clock — a loss of control for ten seconds, a contact for thirty. The capture
 * does not carry the session's current elapsed time up to the renderer, so an
 * incident's own timestamp has nothing to be compared against; and first-seen
 * is the honest reading anyway, since the mark exists to say "this is new to
 * you".
 *
 * Everything already in the queue when the screen opens is treated as old. A
 * steward arriving mid-race should not be greeted by every car that has ever
 * touched another lit up red.
 *
 * Re-evaluated once a second, which is what expires a mark.
 */
export const useLiveIncidentAlerts = (
  incidents: readonly LiveIncident[],
  enabled = true,
): LiveCarAlert[] => {
  const firstSeenAt = useRef<Map<string, number> | null>(null);
  const [now, setNow] = useState(() => Date.now());

  /*
    Stamped during render rather than in an effect, so an incident is marked on
    the very render that first shows it instead of one tick later. Idempotent:
    an id is only ever stamped once.
  */
  if (firstSeenAt.current === null) {
    firstSeenAt.current = new Map(
      incidents.map((incident) => [incident.id, 0]),
    );
  } else {
    const seen = firstSeenAt.current;
    incidents.forEach((incident) => {
      if (!seen.has(incident.id)) {
        seen.set(incident.id, Date.now());
      }
    });
  }

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  return useMemo(() => {
    if (!enabled) {
      return [];
    }

    const seen = firstSeenAt.current;
    // `now` only moves once a second; a newer stamp must not read as expired.
    const clock = Math.max(now, Date.now());

    return incidents.reduce<LiveCarAlert[]>((alerts, incident) => {
      const tone = alertToneFor(incident);
      const seenAt = seen?.get(incident.id) ?? 0;

      if (tone && clock - seenAt < LIVE_ALERT_WINDOW_MS[tone]) {
        alerts.push({ tone, drivers: incident.drivers });
      }
      return alerts;
    }, []);
  }, [enabled, incidents, now]);
};
