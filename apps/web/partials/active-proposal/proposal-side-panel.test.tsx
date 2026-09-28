import { act, renderHook } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { describe, expect, it } from 'vitest';

import { useExclusiveProposalPanel } from './proposal-side-panel';

const PROPOSAL = 'aa11bb22cc33dd44ee55ff6677889900';
const OTHER_PROPOSAL = 'ffeeddccbbaa99887766554433221100';

function wrapper(store: ReturnType<typeof createStore>) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };
}

/** Both panels of one screen, so the exclusivity between them can be observed. */
function renderBoth(store: ReturnType<typeof createStore>, proposalId: string) {
  return renderHook(
    (props: { proposalId: string }) => ({
      comments: useExclusiveProposalPanel('comments', props.proposalId),
      bounties: useExclusiveProposalPanel('bounties', props.proposalId),
    }),
    { wrapper: wrapper(store), initialProps: { proposalId } }
  );
}

describe('useExclusiveProposalPanel', () => {
  it('opens nothing to begin with', () => {
    const { result } = renderBoth(createStore(), PROPOSAL);

    expect(result.current.comments.isPanelOpen).toBe(false);
    expect(result.current.bounties.isPanelOpen).toBe(false);
  });

  it('closes the other panel when one opens, since the screen has one slot', () => {
    const { result } = renderBoth(createStore(), PROPOSAL);

    act(() => result.current.comments.togglePanel());
    expect(result.current.comments.isPanelOpen).toBe(true);

    act(() => result.current.bounties.togglePanel());
    expect(result.current.bounties.isPanelOpen).toBe(true);
    expect(result.current.comments.isPanelOpen).toBe(false);
  });

  it('closes on a second press of the same panel', () => {
    const { result } = renderBoth(createStore(), PROPOSAL);

    act(() => result.current.comments.togglePanel());
    act(() => result.current.comments.togglePanel());

    expect(result.current.comments.isPanelOpen).toBe(false);
  });

  /**
   * Changing `proposalId` on the governance route keeps `ActiveProposal` in the same tree position, so
   * React reconciles these providers with new props rather than unmounting them — no cleanup runs. A
   * slot keyed on the panel alone would hand the next proposal a panel nobody asked for.
   */
  it('does not carry an open panel over to another proposal', () => {
    const { result, rerender } = renderBoth(createStore(), PROPOSAL);

    act(() => result.current.comments.togglePanel());
    expect(result.current.comments.isPanelOpen).toBe(true);

    rerender({ proposalId: OTHER_PROPOSAL });

    expect(result.current.comments.isPanelOpen).toBe(false);
  });

  /**
   * And not even for one frame. The effect below the hook also clears the slot when `proposalId`
   * changes, but an effect runs a commit *after* the render that needed it — so a slot read from the
   * panel alone would paint the previous proposal's panel once before closing it. Keying the read is
   * what makes the very first render right.
   */
  it('never renders the next proposal with the previous panel open', () => {
    const store = createStore();
    const seen: boolean[] = [];

    const { result, rerender } = renderHook(
      (props: { proposalId: string }) => {
        const comments = useExclusiveProposalPanel('comments', props.proposalId);
        seen.push(comments.isPanelOpen);
        return comments;
      },
      { wrapper: wrapper(store), initialProps: { proposalId: PROPOSAL } }
    );

    act(() => result.current.togglePanel());
    expect(result.current.isPanelOpen).toBe(true);

    seen.length = 0;
    rerender({ proposalId: OTHER_PROPOSAL });

    // Every render since the switch, not just the settled one.
    expect(seen).not.toContain(true);
  });

  it('opens independently on the other proposal, and going back does not resurrect the first', () => {
    const { result, rerender } = renderBoth(createStore(), PROPOSAL);

    act(() => result.current.comments.togglePanel());
    rerender({ proposalId: OTHER_PROPOSAL });

    act(() => result.current.bounties.togglePanel());
    expect(result.current.bounties.isPanelOpen).toBe(true);

    rerender({ proposalId: PROPOSAL });
    expect(result.current.comments.isPanelOpen).toBe(false);
    expect(result.current.bounties.isPanelOpen).toBe(false);
  });

  it('gives up the slot when the screen unmounts', () => {
    const store = createStore();
    const { result, unmount } = renderBoth(store, PROPOSAL);

    act(() => result.current.comments.togglePanel());
    unmount();

    const second = renderBoth(store, PROPOSAL);
    expect(second.result.current.comments.isPanelOpen).toBe(false);
  });

  /**
   * And gives up the right one. The cleanup closes over the proposal it was opened for, so if it did
   * not follow `proposalId` it would try to release the slot of whichever proposal happened to be
   * showing when the provider first mounted — leaving the current one claimed after the screen closes.
   */
  it('gives up the slot for the proposal it is actually showing', () => {
    const store = createStore();
    const { result, rerender, unmount } = renderBoth(store, PROPOSAL);

    rerender({ proposalId: OTHER_PROPOSAL });
    act(() => result.current.comments.togglePanel());
    unmount();

    const second = renderBoth(store, OTHER_PROPOSAL);
    expect(second.result.current.comments.isPanelOpen).toBe(false);
  });
});
