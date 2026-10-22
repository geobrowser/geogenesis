import { act, renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Relation } from '~/core/types';

import type { BountyDetail } from './fetch-bounty-detail';
import {
  PAYOUT_BOUNTY_PROPERTY_ID,
  PAYOUT_PROPOSALS_PROPERTY_ID,
  PAYOUT_RECIPIENT_PROPERTY_ID,
  PAYOUT_TYPE_ID,
} from './ontology';
import { PayoutCreditError } from './payout-credit';
import { pendingPayoutStorageKey, savePendingPayout } from './pending-payout-storage';
import { type PendingPayout, useDirectPayout } from './use-direct-payout';

const mocks = vi.hoisted(() => ({
  makeProposal: vi.fn(),
  invalidateQueries: vi.fn(() => Promise.resolve()),
  recordPayoutCredit: vi.fn(),
  token: 'jwt' as string | null,
  calls: [] as string[],
  /** Payout relation ids the graph currently shows for the bounty. */
  landed: new Set<string>(),
  /** Whether a successful publish shows up in the graph (an executed FAST proposal). */
  publishLands: true,
  /** The graph read fails (subgraph/API error). */
  graphDown: false,
}));

vi.mock('./fetch-submissions', async () => {
  const { Effect } = await import('effect');
  return {
    fetchPayoutItems: () =>
      mocks.graphDown ? Effect.fail(new Error('graph down')) : Effect.succeed([...mocks.landed].map(id => ({ id }))),
  };
});

vi.mock('~/core/hooks/use-publish', () => ({ usePublish: () => ({ makeProposal: mocks.makeProposal }) }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  useQuery: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('~/core/auth/identity-token', () => ({ getCachedIdentityToken: async () => mocks.token }));
vi.mock('./payout-credit', async importOriginal => {
  const actual = await importOriginal<typeof import('./payout-credit')>();
  return {
    ...actual,
    recordPayoutCredit: (...args: unknown[]) => {
      mocks.calls.push('ledger');
      return mocks.recordPayoutCredit(...args);
    },
    fetchSpaceBalance: async () => 1000,
  };
});

const SPACE = '3be38bb922bc80c6a6503fbbba28d2b0';
const BOUNTY = '020aefb3b2aa4156a3812e42f991f9a3';
const IBRAHIM_SPACE = 'b30570f0d43db28e6582e57eb9d5267c';
const ibrahim = { spaceId: IBRAHIM_SPACE, name: 'Ibrahim Hassan' };

const detail = {
  bounty: { id: BOUNTY, spaceId: SPACE, name: 'The ranked 25' },
  interest: [],
  submissions: [],
  allocationRelations: [],
} as unknown as BountyDetail;

function outerRelationId(relations: Relation[]) {
  return relations.find(r => r.type.id === PAYOUT_RECIPIENT_PROPERTY_ID)!.id;
}
function publishSucceeds() {
  mocks.makeProposal.mockImplementation(
    async ({ onSuccess, relations }: { onSuccess: () => void; relations: Relation[] }) => {
      mocks.calls.push('publish');
      if (mocks.publishLands) mocks.landed.add(outerRelationId(relations));
      onSuccess();
    }
  );
}
function publishFailsOnce() {
  mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => {
    mocks.calls.push('publish');
    onError();
  });
}

const noWait = async () => {};
const usePayout = () => useDirectPayout(detail, { wait: noWait });

beforeEach(() => {
  window.localStorage.clear();
  mocks.calls = [];
  mocks.landed = new Set();
  mocks.publishLands = true;
  mocks.graphDown = false;
  mocks.token = 'jwt';
  mocks.makeProposal.mockReset();
  mocks.recordPayoutCredit.mockReset();
  mocks.recordPayoutCredit.mockResolvedValue({ newBalance: 750 });
  publishSucceeds();
});

async function payIbrahim(result: { current: ReturnType<typeof useDirectPayout> }, amount = 250) {
  let outcome;
  await act(async () => {
    outcome = await result.current.pay(ibrahim, amount);
  });
  return outcome;
}

describe('useDirectPayout', () => {
  it('asks the ledger first, then publishes a submission-free Payout carrying the id the ledger recorded', async () => {
    const { result } = renderHook(usePayout);
    expect(await payIbrahim(result)).toEqual({ status: 'paid' });
    // The ledger's atomic balance check decides the payout before the graph hears of it.
    expect(mocks.calls).toEqual(['ledger', 'publish']);

    const published = mocks.makeProposal.mock.calls[0][0];
    expect(published.spaceId).toBe(SPACE);
    const relations = published.relations as Relation[];
    const outer = relations.find(r => r.type.id === PAYOUT_RECIPIENT_PROPERTY_ID)!;
    // Same graph shape as a review payout: DAO space → recipient, carrying the Payout entity…
    expect(outer.fromEntity.id).toBe(SPACE);
    expect(outer.toEntity.id).toBe(IBRAHIM_SPACE);
    expect(relations.some(r => r.toEntity.id === PAYOUT_TYPE_ID)).toBe(true);
    expect(relations.find(r => r.type.id === PAYOUT_BOUNTY_PROPERTY_ID)?.toEntity.id).toBe(BOUNTY);
    // …just with no linked proposals.
    expect(relations.some(r => r.type.id === PAYOUT_PROPOSALS_PROPERTY_ID)).toBe(false);
    expect(published.values.find((v: { value: string }) => v.value === '250')).toBeTruthy();

    expect(mocks.recordPayoutCredit).toHaveBeenCalledWith({
      spaceId: SPACE,
      bountyId: BOUNTY,
      payoutEntityId: outer.id,
      recipientEntityId: IBRAHIM_SPACE,
      amount: 250,
      identityToken: 'jwt',
    });
    expect(result.current.pendingPayout).toBeNull();
  });

  it('publishes nothing when the ledger refuses (e.g. the balance ran out to a concurrent payout)', async () => {
    mocks.recordPayoutCredit.mockRejectedValueOnce(
      new PayoutCreditError('Insufficient balance or space not found', 400, 'always')
    );
    const { result } = renderHook(usePayout);
    expect(await payIbrahim(result)).toEqual({
      status: 'not-paid',
      message: 'Insufficient balance or space not found',
    });
    expect(mocks.makeProposal).not.toHaveBeenCalled();
    expect(result.current.pendingPayout).toBeNull();
  });

  it('publishes nothing and keeps nothing pending without a sign-in token', async () => {
    mocks.token = null;
    const { result } = renderHook(usePayout);
    expect(await payIbrahim(result)).toMatchObject({ status: 'not-paid' });
    expect(mocks.calls).toEqual([]);
    expect(result.current.pendingPayout).toBeNull();
  });

  it('keeps an unconfirmed credit pending, refuses a second payout, and finishes with the same id', async () => {
    mocks.recordPayoutCredit.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = renderHook(usePayout);
    expect(await payIbrahim(result)).toEqual({ status: 'credit-unconfirmed', message: 'Failed to fetch' });
    expect(mocks.makeProposal).not.toHaveBeenCalled();
    const pending = result.current.pendingPayout!;
    expect(pending).toMatchObject({ stage: 'credit', recipient: ibrahim, amount: 250 });

    expect(await payIbrahim(result)).toMatchObject({ status: 'not-paid' });
    expect(mocks.recordPayoutCredit).toHaveBeenCalledTimes(1);

    await act(async () => {
      expect(await result.current.finish()).toEqual({ status: 'paid' });
    });
    expect(mocks.recordPayoutCredit.mock.calls[1][0].payoutEntityId).toBe(pending.payoutRelationId);
    expect(mocks.makeProposal).toHaveBeenCalledTimes(1);
    expect(result.current.pendingPayout).toBeNull();
  });

  it('does not drop a pending payout when a retry is refused, since an earlier attempt may have gone through', async () => {
    mocks.recordPayoutCredit
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      // A fresh call on Finish sees a clean 403, but the earlier call was ambiguous.
      .mockRejectedValueOnce(new PayoutCreditError('Only space editors can create payouts', 403, 'this-call'));
    const { result } = renderHook(usePayout);
    await payIbrahim(result);
    await act(async () => {
      expect(await result.current.finish()).toMatchObject({ status: 'credit-unconfirmed' });
    });
    expect(result.current.pendingPayout).toMatchObject({ stage: 'credit' });
    expect(mocks.makeProposal).not.toHaveBeenCalled();
  });

  it('after the points moved, retries only the publish, with the same Payout ids', async () => {
    publishFailsOnce();
    const { result } = renderHook(usePayout);
    expect(await payIbrahim(result)).toEqual({ status: 'publish-failed' });
    expect(result.current.pendingPayout?.stage).toBe('publish');

    await act(async () => {
      expect(await result.current.finish()).toEqual({ status: 'paid' });
    });
    expect(mocks.recordPayoutCredit).toHaveBeenCalledTimes(1);
    expect(mocks.makeProposal.mock.calls[1][0].relations).toEqual(mocks.makeProposal.mock.calls[0][0].relations);
    expect(result.current.pendingPayout).toBeNull();
  });

  it('keeps an unfinished payout across a reload and clears it once finished', async () => {
    publishFailsOnce();
    const first = renderHook(usePayout);
    await payIbrahim(first.result);
    const pending = first.result.current.pendingPayout!;
    first.unmount();

    // A fresh mount (reload, or another visit to the bounty) offers the same payout.
    const second = renderHook(usePayout);
    await act(async () => {});
    expect(second.result.current.pendingPayout).toEqual(pending);
    await act(async () => {
      expect(await second.result.current.finish()).toEqual({ status: 'paid' });
    });
    expect(mocks.recordPayoutCredit).toHaveBeenCalledTimes(1);
    second.unmount();

    const third = renderHook(usePayout);
    await act(async () => {});
    expect(third.result.current.pendingPayout).toBeNull();
  });

  it('clears a stuck payout when the ledger definitely refuses on Finish, so later payouts are not blocked', async () => {
    mocks.recordPayoutCredit
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new PayoutCreditError('Insufficient balance or space not found', 400, 'always'));
    const { result } = renderHook(usePayout);
    await payIbrahim(result);
    await act(async () => {
      expect(await result.current.finish()).toMatchObject({ status: 'not-paid' });
    });
    expect(result.current.pendingPayout).toBeNull();
    expect(mocks.makeProposal).not.toHaveBeenCalled();
  });

  it('is not paid while the published record has not appeared (a DAO proposal awaiting execution)', async () => {
    mocks.publishLands = false;
    const { result } = renderHook(usePayout);
    expect(await payIbrahim(result)).toEqual({ status: 'publish-unconfirmed' });
    expect(result.current.pendingPayout).toMatchObject({ stage: 'publish' });
  });

  it('on Finish, recognises a record that landed late instead of proposing it again', async () => {
    mocks.publishLands = false;
    const { result } = renderHook(usePayout);
    await payIbrahim(result);
    // Someone votes the proposal through from Governance.
    mocks.landed.add(outerRelationId(mocks.makeProposal.mock.calls[0][0].relations));

    await act(async () => {
      expect(await result.current.finish()).toEqual({ status: 'paid' });
    });
    expect(mocks.makeProposal).toHaveBeenCalledTimes(1);
    expect(result.current.pendingPayout).toBeNull();
  });

  // Copilot r4353760582: a failed graph read is not "absent".
  it('on Finish, does not propose again when the graph cannot be read', async () => {
    mocks.publishLands = false;
    const { result } = renderHook(usePayout);
    await payIbrahim(result);
    expect(result.current.pendingPayout?.stage).toBe('publish');
    // The first proposal executes, but the read that would show it fails.
    mocks.landed.add(outerRelationId(mocks.makeProposal.mock.calls[0][0].relations));
    mocks.graphDown = true;

    await act(async () => {
      expect(await result.current.finish()).toEqual({ status: 'publish-unconfirmed' });
    });
    expect(mocks.makeProposal).toHaveBeenCalledTimes(1);
    expect(result.current.pendingPayout?.stage).toBe('publish');
  });

  it('on Finish, recognises a payout another tab already finished rather than proposing it again', async () => {
    mocks.recordPayoutCredit.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = renderHook(usePayout);
    await payIbrahim(result);
    expect(result.current.pendingPayout?.stage).toBe('credit');
    // Meanwhile another tab credited and published it; the ledger answers "already processed".
    mocks.landed.add(result.current.pendingPayout!.payoutRelationId);

    await act(async () => {
      expect(await result.current.finish()).toEqual({ status: 'paid' });
    });
    expect(mocks.makeProposal).not.toHaveBeenCalled();
  });

  // Copilot r4353760521: one browser, two tabs.
  it('refuses a new payout when another tab has started one since this tab loaded', async () => {
    const { result } = renderHook(usePayout);
    await act(async () => {});
    expect(result.current.pendingPayout).toBeNull();

    const otherTab: PendingPayout = {
      stage: 'publish',
      payoutRelationId: 'ffff0000000000000000000000000099',
      recipient: { spaceId: 'eeee0000000000000000000000000088', name: 'Other' },
      amount: 40,
      values: [],
      relations: [],
    };
    savePendingPayout(BOUNTY, otherTab);

    expect(await payIbrahim(result)).toMatchObject({ status: 'not-paid' });
    expect(mocks.calls).toEqual([]);
    expect(result.current.pendingPayout).toEqual(otherTab);
    // The other tab's record is untouched.
    expect(JSON.parse(window.localStorage.getItem(pendingPayoutStorageKey(BOUNTY))!)).toEqual({
      [otherTab.payoutRelationId]: otherTab,
    });
  });

  it('shows a payout another tab started, via the storage event', async () => {
    const { result } = renderHook(usePayout);
    await act(async () => {});
    const otherTab: PendingPayout = {
      stage: 'credit',
      payoutRelationId: 'ffff0000000000000000000000000099',
      recipient: { spaceId: 'eeee0000000000000000000000000088', name: 'Other' },
      amount: 40,
      values: [],
      relations: [],
    };
    savePendingPayout(BOUNTY, otherTab);
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: pendingPayoutStorageKey(BOUNTY) }));
    });
    expect(result.current.pendingPayout).toEqual(otherTab);
  });
});
