import { describe, expect, it } from 'vitest';

import type { BrowseSidebarData, BrowseSpaceRow } from '~/core/browse/fetch-browse-sidebar-data';
import { type RequestedMembershipSpace } from '~/core/state/requested-membership';
import { normId } from '~/core/utils/norm-id';

import {
  REQUESTED_MEMBERSHIP_SETTLE_MS,
  awaitsRequestedMembership,
  browseSidebarClaimSpaceAllowlist,
  browseSidebarMemberSpaceIds,
  buildClaimSpaceAllowlist,
  buildMemberSpaceIds,
  isClaimSpaceAllowed,
} from './claim-space-allowlist';

function row(id: string, overrides: Partial<BrowseSpaceRow> = {}): BrowseSpaceRow {
  return { id, name: id, image: null, ...overrides };
}

const FEATURED = '019fedae-72b6-7ab2-927a-df044d57c566';
const EDITOR = '019fedae-72b6-7ab2-927a-df044d57c567';
const MEMBER = '019fedae-72b6-7ab2-927a-df044d57c568';
const PENDING = '019fedae-72b6-7ab2-927a-df044d57c569';
const PERSONAL = '019fedae-72b6-7ab2-927a-df044d57c570';
const STRANGER = '019fedae-72b6-7ab2-927a-df044d57c571';
const WALLET = '0x1234567890abcdef1234567890abcdef12345678';

describe('buildClaimSpaceAllowlist', () => {
  it('covers featured spaces and the spaces the viewer belongs to', () => {
    const allowlist = buildClaimSpaceAllowlist({
      featured: [row(FEATURED)],
      editorOf: [row(EDITOR)],
      memberOf: [row(MEMBER)],
      personalSpaceId: PERSONAL,
    });

    for (const id of [FEATURED, EDITOR, MEMBER, PERSONAL]) {
      expect(isClaimSpaceAllowed(id, allowlist)).toBe(true);
    }
    expect(isClaimSpaceAllowed(STRANGER, allowlist)).toBe(false);
  });

  // Requested counts as theirs, which is a wider line than `useGlobalSearchSpaceIds` draws off the
  // same lists. Sign-up collects the viewer's spaces before any approval exists,
  // so a new account has nothing else for its first few minutes — and excluding these left it
  // looking at a panel with none of the spaces it had just chosen, which then filled in on its own
  // once the approvals landed.
  it('covers spaces whose membership or editorship is only requested', () => {
    const allowlist = buildClaimSpaceAllowlist({
      featured: [],
      editorOf: [row(PENDING, { pendingLabel: 'Editorship pending' })],
      memberOf: [row(MEMBER, { pendingLabel: 'Membership pending' })],
      personalSpaceId: null,
    });

    expect(isClaimSpaceAllowed(PENDING, allowlist)).toBe(true);
    expect(isClaimSpaceAllowed(MEMBER, allowlist)).toBe(true);
  });

  // Featured ids arrive UUID-formatted and claim rows carry canonical hex, so a raw comparison
  // would silently allow nothing.
  it('compares ids regardless of hyphens or case', () => {
    const allowlist = buildClaimSpaceAllowlist({
      featured: [row(FEATURED.toUpperCase())],
      editorOf: [],
      memberOf: [],
      personalSpaceId: null,
    });

    expect(isClaimSpaceAllowed(FEATURED.replace(/-/g, ''), allowlist)).toBe(true);
  });

  it('allows a signed-out viewer the featured spaces and nothing else', () => {
    const allowlist = buildClaimSpaceAllowlist({
      featured: [row(FEATURED)],
      editorOf: [],
      memberOf: [],
      personalSpaceId: null,
    });

    expect(isClaimSpaceAllowed(FEATURED, allowlist)).toBe(true);
    expect(isClaimSpaceAllowed(STRANGER, allowlist)).toBe(false);
  });
});

describe('browseSidebarClaimSpaceAllowlist', () => {
  // The sidebar subtracts the viewer's own spaces from `featured`, so only the union of all three
  // lists is the full set.
  it('unions the sidebar sections and falls back to the sidebar personal space', () => {
    const data: BrowseSidebarData = {
      featured: [row(FEATURED)],
      editorOf: [row(EDITOR)],
      memberOf: [row(MEMBER)],
      documentationImage: null,
      personalSpaceId: PERSONAL,
    };

    const allowlist = browseSidebarClaimSpaceAllowlist(data, null);

    for (const id of [FEATURED, EDITOR, MEMBER, PERSONAL]) {
      expect(isClaimSpaceAllowed(id, allowlist)).toBe(true);
    }
  });
});

describe('isClaimSpaceAllowed', () => {
  // Null means the sources haven't resolved, not that nothing is allowed.
  it('passes everything while the allowlist is unresolved', () => {
    expect(isClaimSpaceAllowed(STRANGER, null)).toBe(true);
    expect(isClaimSpaceAllowed(null, null)).toBe(true);
  });

  // A claim the picker can't attribute to a space has no space to check, and acting on it would
  // publish a response against the wrong one.
  it('rejects a claim with no home space once the allowlist is known', () => {
    expect(isClaimSpaceAllowed(null, new Set([FEATURED]))).toBe(false);
    expect(isClaimSpaceAllowed('', new Set([FEATURED]))).toBe(false);
  });
});

// GEO-2789. The space filter defaults to what the viewer belongs to, which is the allowlist minus
// the part of it that is on offer to everybody.
describe('buildMemberSpaceIds', () => {
  it('covers the spaces the viewer belongs to, and their own', () => {
    const mine = buildMemberSpaceIds({
      editorOf: [row(EDITOR)],
      memberOf: [row(MEMBER)],
      personalSpaceId: PERSONAL,
    });

    expect([...mine].sort()).toEqual([EDITOR, MEMBER, PERSONAL].map(normId).sort());
  });

  // The difference from the allowlist, and the whole point of a second function: a featured space
  // is one the viewer may browse, not one that is theirs, so defaulting the filter to it would
  // answer a question about them with a list about everyone.
  it('leaves out featured spaces, which the allowlist includes', () => {
    const data = {
      featured: [row(FEATURED)],
      editorOf: [row(EDITOR)],
      memberOf: [],
      personalSpaceId: PERSONAL,
    } as unknown as BrowseSidebarData;

    expect(browseSidebarClaimSpaceAllowlist(data, PERSONAL).has(normId(FEATURED))).toBe(true);
    expect(browseSidebarMemberSpaceIds(data, PERSONAL).has(normId(FEATURED))).toBe(false);
    expect(browseSidebarMemberSpaceIds(data, PERSONAL).has(normId(EDITOR))).toBe(true);
  });

  // The default has to reach them for the same reason the allowlist does: a new account's spaces
  // are all pending at once, and a default that skipped them would open on everything for exactly
  // the viewers it exists for.
  it('counts spaces the viewer has asked to join', () => {
    const mine = buildMemberSpaceIds({
      editorOf: [],
      memberOf: [row(MEMBER), row(PENDING, { pendingLabel: 'Membership pending' })],
      personalSpaceId: null,
    });

    expect(mine.has(normId(PENDING))).toBe(true);
    expect(mine.has(normId(MEMBER))).toBe(true);
  });

  it('is empty for a viewer who belongs to nothing, which is the fallback case', () => {
    expect(buildMemberSpaceIds({ editorOf: [], memberOf: [], personalSpaceId: null }).size).toBe(0);
  });
});

// GEO-2815. A membership request reaches the indexer about a minute after the transaction, so the
// payload fetched at the moment of writing answers a question that has already changed — and
// nothing asked again until a remount or a tab refocus, which in practice meant a hard refresh.
describe('awaitsRequestedMembership', () => {
  const NOW = 1_700_000_000_000;

  function requested(id: string, overrides: Partial<RequestedMembershipSpace> = {}): RequestedMembershipSpace {
    return { id, ownerId: PERSONAL, requestedAt: NOW - 1_000, ...overrides };
  }

  function data(overrides: Partial<BrowseSidebarData> = {}): BrowseSidebarData {
    return {
      featured: [row(FEATURED)],
      editorOf: [],
      memberOf: [],
      personalSpaceId: PERSONAL,
      ...overrides,
    } as unknown as BrowseSidebarData;
  }

  const awaits = (requestedSpaces: RequestedMembershipSpace[], sidebar: BrowseSidebarData | undefined) =>
    awaitsRequestedMembership({
      requestedSpaces,
      personalSpaceId: PERSONAL,
      walletAddress: null,
      data: sidebar,
      now: NOW,
    });

  it('waits while a request the viewer just made is missing from the payload', () => {
    expect(awaits([requested(PENDING)], data())).toBe(true);
  });

  it('stops once the payload reports it', () => {
    const sidebar = data({ memberOf: [row(PENDING, { pendingLabel: 'Membership pending' })] });

    expect(awaits([requested(PENDING)], sidebar)).toBe(false);
  });

  it('does not wait when the viewer has made no request', () => {
    expect(awaits([], data())).toBe(false);
  });

  // The bound on a request that never lands, and it has to be much tighter than the bridge's own
  // five-minute TTL: a rejected or vote-ended proposal is dropped by `fetchPendingMembershipSpaceIds`
  // outright, so it can never arrive, and every tick spent waiting is a full sidebar payload while
  // the filter sits open on nothing.
  it('gives up on a request that has passed the settle window', () => {
    const stale = requested(PENDING, { requestedAt: NOW - REQUESTED_MEMBERSHIP_SETTLE_MS - 1 });

    expect(awaits([stale], data())).toBe(false);
  });

  it('is still waiting just inside the settle window', () => {
    const recent = requested(PENDING, { requestedAt: NOW - REQUESTED_MEMBERSHIP_SETTLE_MS + 1_000 });

    expect(awaits([recent], data())).toBe(true);
  });

  // The window the whole ticket is about, and the one case that must NOT poll: onboarding seeds
  // bridge entries under the wallet address before the personal space exists, while its own
  // membership requests are still queued behind that space being created. There is nothing for the
  // server to report yet, and on this branch the query is a server action.
  it('does not wait before the viewer has a personal space', () => {
    const seeded: RequestedMembershipSpace = { id: PENDING, ownerId: WALLET, requestedAt: NOW - 1_000 };

    expect(
      awaitsRequestedMembership({
        requestedSpaces: [seeded],
        personalSpaceId: null,
        walletAddress: WALLET,
        data: undefined,
        now: NOW,
      })
    ).toBe(false);
  });

  // A featured space is what sign-up offers, so a request for one is the ordinary case. Comparing
  // against the allowlist rather than the viewer's own spaces would read it as already answered.
  it('waits for a request whose space is also featured', () => {
    expect(awaits([requested(FEATURED)], data())).toBe(true);
  });

  it('does not wait when there is no request and no payload either', () => {
    expect(awaits([], undefined)).toBe(false);
  });

  it('treats a payload that has not arrived as still owing', () => {
    expect(awaits([requested(PENDING)], undefined)).toBe(true);
  });

  // A request belonging to a different account says nothing about this viewer, and waiting on it
  // would poll for the rest of the bridge's life.
  it('ignores a request made by another account', () => {
    expect(awaits([requested(PENDING, { ownerId: STRANGER })], data())).toBe(false);
  });
});
