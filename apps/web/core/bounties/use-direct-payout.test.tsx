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
import { useDirectPayout } from './use-direct-payout';

const mocks = vi.hoisted(() => ({
  makeProposal: vi.fn(),
  invalidateQueries: vi.fn(() => Promise.resolve()),
  recordPayoutCredit: vi.fn(),
  token: 'jwt' as string | null,
  balance: 1000 as number | null,
}));

vi.mock('~/core/hooks/use-publish', () => ({ usePublish: () => ({ makeProposal: mocks.makeProposal }) }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  useQuery: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('~/core/auth/identity-token', () => ({ getCachedIdentityToken: async () => mocks.token }));
vi.mock('./payout-credit', () => ({
  recordPayoutCredit: (...args: unknown[]) => mocks.recordPayoutCredit(...args),
  fetchSpaceBalance: async () => mocks.balance,
}));

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

function publishSucceeds() {
  mocks.makeProposal.mockImplementation(async ({ onSuccess }: { onSuccess: () => void }) => onSuccess());
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.balance = 1000;
  mocks.makeProposal.mockReset();
  mocks.recordPayoutCredit.mockReset();
  mocks.recordPayoutCredit.mockResolvedValue({ newBalance: 750 });
  mocks.token = 'jwt';
});

describe('useDirectPayout', () => {
  it('publishes a submission-free Payout to the curator space, then credits the ledger for that payout', async () => {
    publishSucceeds();
    const { result } = renderHook(() => useDirectPayout(detail));
    let outcome;
    await act(async () => {
      outcome = await result.current.pay(ibrahim, 250);
    });
    expect(outcome).toEqual({ status: 'paid' });

    const published = mocks.makeProposal.mock.calls[0][0];
    expect(published.spaceId).toBe(SPACE);
    const relations = published.relations as Relation[];
    const outer = relations.find(r => r.type.id === PAYOUT_RECIPIENT_PROPERTY_ID)!;
    // Same graph shape as a review payout: DAO space → recipient, carrying the Payout entity.
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
    expect(result.current.pendingCredit).toBeNull();
  });

  it('touches no ledger when the publish fails', async () => {
    mocks.makeProposal.mockImplementation(async ({ onError }: { onError: () => void }) => onError());
    const { result } = renderHook(() => useDirectPayout(detail));
    await act(async () => {
      expect(await result.current.pay(ibrahim, 250)).toEqual({ status: 'publish-failed' });
    });
    expect(mocks.recordPayoutCredit).not.toHaveBeenCalled();
    expect(result.current.pendingCredit).toBeNull();
  });

  it('keeps a failed credit pending and retries it without publishing a second Payout', async () => {
    publishSucceeds();
    mocks.recordPayoutCredit.mockRejectedValueOnce(new Error('ledger down'));
    const { result } = renderHook(() => useDirectPayout(detail));

    await act(async () => {
      expect(await result.current.pay(ibrahim, 250)).toEqual({ status: 'credit-failed', message: 'ledger down' });
    });
    const pending = result.current.pendingCredit!;
    expect(pending).toMatchObject({ recipient: ibrahim, amount: 250 });

    // A second Pay while a credit is outstanding must not publish another payout.
    await act(async () => {
      expect(await result.current.pay(ibrahim, 250)).toEqual({ status: 'publish-failed' });
    });
    expect(mocks.makeProposal).toHaveBeenCalledTimes(1);

    await act(async () => {
      expect(await result.current.retryCredit()).toEqual({ status: 'paid' });
    });
    expect(mocks.makeProposal).toHaveBeenCalledTimes(1);
    expect(mocks.recordPayoutCredit).toHaveBeenCalledTimes(2);
    expect(mocks.recordPayoutCredit.mock.calls[1][0].payoutEntityId).toBe(pending.payoutRelationId);
    expect(result.current.pendingCredit).toBeNull();
  });

  // The publish can't be taken back, so anything the ledger would refuse for good is
  // caught before it: each of these must leave the graph untouched.
  it.each([
    ['no identity token', () => (mocks.token = null), /sign-in expired/],
    ['an unreadable balance', () => (mocks.balance = null), /Couldn't read the space's balance/],
    ['a balance below the amount (fresh, not the cached one)', () => (mocks.balance = 249), /only has 249 points/],
  ])('refuses before publishing on %s', async (_label, arrange, message) => {
    publishSucceeds();
    arrange();
    const { result } = renderHook(() => useDirectPayout(detail));
    await act(async () => {
      const outcome = await result.current.pay(ibrahim, 250);
      expect(outcome).toMatchObject({ status: 'not-paid', message: expect.stringMatching(message) });
    });
    expect(mocks.makeProposal).not.toHaveBeenCalled();
    expect(mocks.recordPayoutCredit).not.toHaveBeenCalled();
    expect(result.current.pendingCredit).toBeNull();
  });

  it('keeps an uncredited payout across a reload and clears it once credited', async () => {
    publishSucceeds();
    mocks.recordPayoutCredit.mockRejectedValueOnce(new Error('ledger down'));
    const first = renderHook(() => useDirectPayout(detail));
    await act(async () => {
      await first.result.current.pay(ibrahim, 250);
    });
    const pending = first.result.current.pendingCredit!;
    first.unmount();

    // A fresh mount (reload, or another visit to the bounty) offers the same credit.
    const second = renderHook(() => useDirectPayout(detail));
    await act(async () => {});
    expect(second.result.current.pendingCredit).toEqual(pending);

    await act(async () => {
      expect(await second.result.current.retryCredit()).toEqual({ status: 'paid' });
    });
    expect(mocks.makeProposal).toHaveBeenCalledTimes(1);
    expect(mocks.recordPayoutCredit.mock.calls[1][0].payoutEntityId).toBe(pending.payoutRelationId);
    second.unmount();

    const third = renderHook(() => useDirectPayout(detail));
    await act(async () => {});
    expect(third.result.current.pendingCredit).toBeNull();
  });
});
