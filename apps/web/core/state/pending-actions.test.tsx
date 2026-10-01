import { act, cleanup, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Provider as JotaiProvider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pendingActionsAtom, useQueuedAction } from './pending-actions';

let store = createStore();
const queued = () => store.get(pendingActionsAtom);
const wrapper = ({ children }: { children: ReactNode }) => <JotaiProvider store={store}>{children}</JotaiProvider>;

function renderControl(run: (intent: string | undefined) => Promise<void> | void, ready = true) {
  return renderHook(
    (props: { ready: boolean; run: typeof run }) =>
      useQueuedAction({ id: 'action-1', component: 'claim_position_control', label: 'x', ...props }),
    { wrapper, initialProps: { ready, run } }
  );
}

beforeEach(() => {
  store = createStore();
});
afterEach(cleanup);

describe('useQueuedAction', () => {
  it('replays through the control on screen, with the intent it was queued with', async () => {
    const run = vi.fn();
    const { result } = renderControl(run);

    act(() => result.current.queue('positive'));
    expect(result.current.intent).toBe('positive');
    await queued()[0]!.run();

    expect(run).toHaveBeenCalledWith('positive');
  });

  // The control decides from its own data, which is still loading right after sign-in.
  it('holds a replay until the control on screen is ready', async () => {
    const run = vi.fn();
    const view = renderControl(run, false);

    act(() => view.result.current.queue('positive'));
    const running = Promise.resolve(queued()[0]!.run());
    await Promise.resolve();
    expect(run).not.toHaveBeenCalled();

    view.rerender({ ready: true, run });
    await running;

    expect(run).toHaveBeenCalledWith('positive');
  });

  // A control that unmounts while the replay waits on it hands the replay on rather than stranding it.
  it('moves on to another control if the one it waited on unmounts', async () => {
    const waiting = vi.fn();
    const other = vi.fn();
    const first = renderControl(waiting, false);
    act(() => first.result.current.queue('positive'));
    const running = Promise.resolve(queued()[0]!.run());
    await Promise.resolve();

    renderControl(other);
    first.unmount();
    await running;

    expect(waiting).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledWith('positive');
  });

  // Several controls for one action — the same claim in the feed and a side panel. Closing the
  // latest leaves the other able to carry it out.
  it('keeps the other control live when one of two unmounts', async () => {
    const remaining = vi.fn();
    renderControl(remaining);
    const closing = renderControl(vi.fn());
    act(() => closing.result.current.queue('negative'));
    closing.unmount();

    await queued()[0]!.run();

    expect(remaining).toHaveBeenCalledWith('negative');
  });

  it('skips an action withdrawn while it waited', async () => {
    const run = vi.fn();
    const view = renderControl(run, false);
    act(() => view.result.current.queue('positive'));
    const action = queued()[0]!;
    const running = Promise.resolve(action.run());
    await Promise.resolve();

    act(() => view.result.current.cancel());
    view.unmount();
    await running;

    expect(run).not.toHaveBeenCalled();
  });
});
