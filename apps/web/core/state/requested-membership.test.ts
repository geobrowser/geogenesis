import { describe, expect, it } from 'vitest';

import {
  REQUEST_BRIDGE_TTL_MS,
  type RequestedMembershipSpace,
  activeRequestedSpacesForOwner,
  reconcileRequestedSpaces,
  removeRequestedMembershipSpace,
  upsertRequestedMembershipSpace,
} from './requested-membership';

const OWNER = 'owner-space';
const OTHER = 'other-owner';
const WALLET = '0xabc';

const entry = (id: string, ownerId = OWNER, requestedAt = 1_000): RequestedMembershipSpace => ({
  id,
  ownerId,
  requestedAt,
  name: id,
});

describe('removeRequestedMembershipSpace', () => {
  it('drops the matching owner+space entry', () => {
    const current = [entry('ai'), entry('health')];
    expect(removeRequestedMembershipSpace(current, 'ai', OWNER)).toEqual([entry('health')]);
  });

  it('leaves another owner’s entry for the same space', () => {
    const current = [entry('ai', OWNER), entry('ai', OTHER)];
    expect(removeRequestedMembershipSpace(current, 'ai', OWNER)).toEqual([entry('ai', OTHER)]);
  });

  it('returns the same array when nothing matches', () => {
    const current = [entry('ai')];
    expect(removeRequestedMembershipSpace(current, 'missing', OWNER)).toBe(current);
  });

  it('matches ids regardless of hyphens', () => {
    const current = [entry('aabbccdd-0011-2233-4455-66778899aabb')];
    expect(removeRequestedMembershipSpace(current, 'aabbccdd00112233445566778899aabb', OWNER)).toEqual([]);
  });
});

describe('upsertRequestedMembershipSpace', () => {
  it('appends a new entry', () => {
    expect(upsertRequestedMembershipSpace([], entry('ai'))).toEqual([entry('ai')]);
  });

  it('merges display data onto an existing owner+space entry', () => {
    const seeded: RequestedMembershipSpace = {
      id: 'ai',
      ownerId: WALLET,
      requestedAt: 1_000,
    };
    const enriched = upsertRequestedMembershipSpace([seeded], {
      id: 'ai',
      ownerId: WALLET,
      requestedAt: 2_000,
      name: 'AI',
      image: 'ipfs://x',
    });
    expect(enriched).toEqual([
      {
        id: 'ai',
        ownerId: WALLET,
        requestedAt: 2_000,
        name: 'AI',
        image: 'ipfs://x',
      },
    ]);
  });
});

describe('activeRequestedSpacesForOwner', () => {
  const now = 10_000;

  it('returns empty when signed out', () => {
    expect(activeRequestedSpacesForOwner([entry('ai')], null, now)).toEqual([]);
  });

  it('matches entries owned by the personal space id', () => {
    const current = [entry('ai', OWNER, now), entry('health', OTHER, now)];
    expect(activeRequestedSpacesForOwner(current, OWNER, now)).toEqual([entry('ai', OWNER, now)]);
  });

  it('matches onboarding entries owned by the wallet address', () => {
    const current = [entry('ai', WALLET, now), entry('health', OWNER, now)];
    expect(activeRequestedSpacesForOwner(current, null, now, WALLET)).toEqual([entry('ai', WALLET, now)]);
  });

  it('matches either personal space id or wallet address so onboarding rows survive resolve', () => {
    const current = [entry('ai', WALLET, now), entry('health', OWNER, now)];
    expect(activeRequestedSpacesForOwner(current, OWNER, now, WALLET)).toEqual([
      entry('ai', WALLET, now),
      entry('health', OWNER, now),
    ]);
  });

  it('drops expired entries', () => {
    const current = [entry('ai', WALLET, now - REQUEST_BRIDGE_TTL_MS - 1)];
    expect(activeRequestedSpacesForOwner(current, OWNER, now, WALLET)).toEqual([]);
  });
});

describe('reconcileRequestedSpaces', () => {
  const now = 10_000;

  it('drops expired entries for any owner', () => {
    const current = [entry('ai', WALLET, now - REQUEST_BRIDGE_TTL_MS - 1)];
    expect(reconcileRequestedSpaces(current, OWNER, new Set(), now, WALLET)).toEqual([]);
  });

  it('drops this account’s entries once the server tracks them, whether owned by space id or address', () => {
    const current = [entry('ai', WALLET, now), entry('health', OWNER, now), entry('other', OTHER, now)];
    const next = reconcileRequestedSpaces(current, OWNER, new Set(['ai', 'health']), now, WALLET);
    expect(next).toEqual([entry('other', OTHER, now)]);
  });

  it('returns the same array when nothing changes', () => {
    const current = [entry('ai', WALLET, now)];
    expect(reconcileRequestedSpaces(current, OWNER, new Set(), now, WALLET)).toBe(current);
  });
});
