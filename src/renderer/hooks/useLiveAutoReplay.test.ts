import { useCallback, useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import {
  LiveIncident,
  liveIncidentsFixture,
} from '../components/Live/liveFixtures';
import { useLiveAutoReplay } from './useLiveAutoReplay';

const incident = (
  id: string,
  over: Partial<LiveIncident> = {},
): LiveIncident => ({
  ...liveIncidentsFixture[0],
  id,
  timestampLabel: `T-${id}`,
  classification: 'contact',
  contactMagnitude: 900,
  state: 'NEW',
  decision: undefined,
  ...over,
});

interface Outside {
  incidents: LiveIncident[];
  listKey: string;
  isReplayActive: boolean | null;
}

const onRewatchIncident = jest.fn();
const onReturnToLive = jest.fn();

/**
 * The hook, with the screen's side of the contract held in real state: a
 * selection that follows `onSelectIncident`, and a counter that follows
 * `onReturnToLive`, the way `LiveSessionContext` wires them. Real state
 * matters — the hook relies on its own updates and the selection landing in
 * the same render.
 */
const useHarness = (outside: Outside) => {
  const [selectedIncidentId, setSelectedIncidentId] = useState<
    string | undefined
  >(undefined);
  const [returnToLiveCount, setReturnToLiveCount] = useState(0);

  const returnToLive = useCallback(() => {
    onReturnToLive();
    setReturnToLiveCount((count) => count + 1);
  }, []);
  const clearSelected = useCallback(() => setSelectedIncidentId(undefined), []);

  const state = useLiveAutoReplay({
    enabled: true,
    minMagnitude: 200,
    canReplay: true,
    incidents: outside.incidents,
    listKey: outside.listKey,
    isReplayActive: outside.isReplayActive,
    returnToLiveCount,
    selectedIncidentId,
    onSelectIncident: setSelectedIncidentId,
    onClearSelectedIncident: clearSelected,
    onRewatchIncident,
    onReturnToLive: returnToLive,
  });

  return {
    state,
    selectedIncidentId,
    // The steward's own press of Live: the counter moves, nothing else.
    pressLive: () => setReturnToLiveCount((count) => count + 1),
  };
};

const setup = () => {
  let outside: Outside = {
    incidents: [],
    listKey: 'session|live',
    isReplayActive: false,
  };
  const view = renderHook((props: Outside) => useHarness(props), {
    initialProps: outside,
  });

  return {
    update: (patch: Partial<Outside>) => {
      outside = { ...outside, ...patch };
      view.rerender(outside);
    },
    tick: (ms: number) =>
      act(() => {
        jest.advanceTimersByTime(ms);
      }),
    pressLive: () => act(() => view.result.current.pressLive()),
    state: () => view.result.current.state,
    selected: () => view.result.current.selectedIncidentId,
  };
};

describe('useLiveAutoReplay', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => jest.useRealTimers());

  it('should replay a new incident and open it', () => {
    const hook = setup();

    hook.update({ incidents: [incident('one')] });

    expect(onRewatchIncident).toHaveBeenCalledWith('one');
    expect(hook.selected()).toBe('one');
    expect(hook.state().current?.id).toBe('one');
  });

  // The app's Live button: whatever was waiting is dropped, for good.
  it('should clear the queue when the steward presses Live', () => {
    const hook = setup();
    hook.update({ incidents: [incident('one')] });
    hook.update({ incidents: [incident('one'), incident('two')] });
    expect(hook.state().next?.id).toBe('two');

    hook.pressLive();

    expect(hook.state().current).toBeUndefined();
    expect(hook.state().next).toBeUndefined();
    expect(hook.selected()).toBeUndefined();

    hook.tick(30_000);
    expect(onRewatchIncident).toHaveBeenCalledTimes(1);
  });

  // The game's own LIVE button: only the replay reading says it happened.
  it('should clear the queue when the game leaves the replay by itself', () => {
    const hook = setup();
    hook.update({ incidents: [incident('one')] });
    hook.update({ isReplayActive: true });
    hook.update({ incidents: [incident('one'), incident('two')] });

    hook.update({ isReplayActive: false });

    expect(hook.state().current).toBeUndefined();
    expect(hook.state().next).toBeUndefined();
    expect(hook.selected()).toBeUndefined();
    expect(onReturnToLive).not.toHaveBeenCalled();
  });

  // The reading lags the command; "not active yet" must not look like LIVE.
  it('should not mistake a replay that has not started yet for a press of Live', () => {
    const hook = setup();

    hook.update({ incidents: [incident('one')] });
    hook.tick(3_000);

    expect(hook.state().current?.id).toBe('one');
  });

  it('should treat what is listed after a reset as already seen', () => {
    const hook = setup();
    hook.update({ incidents: [incident('one')] });
    hook.pressLive();

    hook.update({ incidents: [incident('one'), incident('two')] });

    expect(onRewatchIncident).toHaveBeenCalledTimes(2);
    expect(onRewatchIncident).toHaveBeenLastCalledWith('two');
  });

  // Another session's list is a different list, not a batch of arrivals.
  it('should not replay a list that was swapped in', () => {
    const hook = setup();

    hook.update({
      listKey: 'other|record',
      incidents: [incident('a'), incident('b'), incident('c')],
    });
    hook.tick(15_000);

    expect(onRewatchIncident).not.toHaveBeenCalled();
  });

  it('should go back to live by itself without losing later arrivals', () => {
    const hook = setup();
    hook.update({ incidents: [incident('one')] });

    hook.tick(21_000);
    expect(onReturnToLive).toHaveBeenCalledTimes(1);
    expect(hook.selected()).toBeUndefined();

    hook.update({ incidents: [incident('one'), incident('two')] });
    expect(onRewatchIncident).toHaveBeenLastCalledWith('two');
  });
});
