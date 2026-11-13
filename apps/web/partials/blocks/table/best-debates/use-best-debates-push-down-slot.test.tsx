import { act, cleanup, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PushDownRunResult } from '~/core/blocks/ranking/push-down';

import type { PushDownSlot } from './push-down-slot';
import { useBestDebatesPushDownSlot } from './use-best-debates-push-down-slot';

const mocks = vi.hoisted(() => ({
  isVoteKnown: false,
  pushDown: vi.fn(async (): Promise<PushDownRunResult> => ({ ok: true })),
  rank: vi.fn(async (publish: () => Promise<boolean>): Promise<PushDownRunResult> => {
    await publish();
    return { ok: true };
  }),
  calls: [] as string[],
}));

vi.mock('~/core/blocks/ranking/use-push-down', () => ({
  usePushDown: (debateId: string) => {
    mocks.calls.push(debateId);
    return { isVoteKnown: mocks.isVoteKnown, pushDown: mocks.pushDown, rank: mocks.rank };
  },
}));

afterEach(() => {
  cleanup();
  mocks.isVoteKnown = false;
  mocks.calls.length = 0;
  vi.clearAllMocks();
});

type Slot = (PushDownSlot & { pushedDownEntityIds: readonly string[] }) | undefined;
let slot: Slot;

function Screen({ blockId, active }: { blockId: string | null; active: string | null }) {
  const pushDown = useBestDebatesPushDownSlot({ blockId, pushedDownEntityIds: ['gone'] });
  slot = pushDown.slot;
  return <>{pushDown.binding(active)}</>;
}

describe('useBestDebatesPushDownSlot (GEO-3678 x GEO-3679)', () => {
  it('offers no slot and binds nothing off the Best debates block', () => {
    render(<Screen blockId={null} active="debate" />);
    expect(slot).toBeUndefined();
    expect(mocks.calls).toEqual([]);
  });

  it('reads one debate at a time, and holds both choices until its vote is known', () => {
    const view = render(<Screen blockId="block" active="debate" />);
    expect(mocks.calls.every(id => id === 'debate')).toBe(true);
    expect(slot?.isReady?.('debate')).toBe(false);
    expect(slot?.pushedDownEntityIds).toEqual(['gone']);

    mocks.isVoteKnown = true;
    view.rerender(<Screen blockId="block" active="debate" />);
    expect(slot?.isReady?.('debate')).toBe(true);
    expect(slot?.isReady?.('another')).toBe(false);
  });

  it('pushes the bound debate down, with the pre-cutover description', () => {
    mocks.isVoteKnown = true;
    render(<Screen blockId="block" active="debate" />);
    slot?.onSelect('debate');
    expect(mocks.pushDown).toHaveBeenCalledTimes(1);
    expect(slot?.description).toBeTruthy();
  });

  it('ranks through usePushDown, and counts a ranking that went out but left a clear to retry', async () => {
    mocks.isVoteKnown = true;
    render(<Screen blockId="block" active="debate" />);
    const publish = vi.fn(async () => true);

    await act(async () => expect(await slot!.rank!('debate', publish)).toBe(true));
    expect(mocks.rank).toHaveBeenCalledWith(publish);
    expect(publish).toHaveBeenCalledTimes(1);

    mocks.rank.mockResolvedValueOnce({ ok: false, step: 'vote', partly: true, message: 'clear failed' });
    await act(async () => expect(await slot!.rank!('debate', publish)).toBe(true));

    mocks.rank.mockResolvedValueOnce({ ok: false, step: 'ballot', partly: false, message: 'publish failed' });
    await act(async () => expect(await slot!.rank!('debate', publish)).toBe(false));
  });

  it('publishes as a plain placement when no vote is known for the debate', async () => {
    render(<Screen blockId="block" active={null} />);
    const publish = vi.fn(async () => true);
    await act(async () => expect(await slot!.rank!('debate', publish)).toBe(true));
    expect(mocks.rank).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledTimes(1);
  });
});
