import { describe, expect, it } from 'vitest';

import {
  type RequestedMembershipSpace,
  removeRequestedMembershipSpace,
  upsertRequestedMembershipSpace,
} from './requested-membership';

const OWNER = 'owner-space';
const OTHER = 'other-owner';

const entry = (id: string, ownerId = OWNER): RequestedMembershipSpace => ({
  id,
  ownerId,
  requestedAt: 1,
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
});
