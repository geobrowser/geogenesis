import { QueryClient } from '@tanstack/react-query';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ingestionWriteTarget, pickIngestionSpace } from './ingestion-space';

const mocks = vi.hoisted(() => ({ access: vi.fn(), ensure: vi.fn() }));

vi.mock('~/core/access/space-access', () => ({ getSpaceAccessById: mocks.access }));
vi.mock('~/core/access/request-space-membership', () => ({ ensureSpaceMembership: mocks.ensure }));

const PAGE_SPACE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const PERSONAL_SPACE = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const tx = vi.fn();

function pick(pageSpaceId: string | null = PAGE_SPACE) {
  return pickIngestionSpace({ pageSpaceId, personalSpaceId: PERSONAL_SPACE, tx, queryClient: new QueryClient() });
}

beforeEach(() => {
  mocks.access.mockReset();
  mocks.ensure.mockReset().mockResolvedValue(false);
});

describe('pickIngestionSpace', () => {
  it('a member of the page space imports into it, with no membership request', async () => {
    mocks.access.mockReturnValue(Effect.succeed({ canEdit: true }));

    expect(await pick()).toBe(PAGE_SPACE);
    expect(mocks.access).toHaveBeenCalledWith(PAGE_SPACE, PERSONAL_SPACE);
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  it('a non-member imports into their personal space without waiting on the membership request', async () => {
    mocks.access.mockReturnValue(Effect.succeed({ canEdit: false }));
    // A request that never settles: the pick must not wait on it.
    mocks.ensure.mockReturnValue(new Promise(() => {}));

    expect(await pick()).toBe(PERSONAL_SPACE);
    expect(mocks.ensure).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: PAGE_SPACE, personalSpaceId: PERSONAL_SPACE, tx })
    );
  });

  it('a failed access read imports into the personal space', async () => {
    mocks.access.mockReturnValue(Effect.fail(new Error('index down')));

    expect(await pick()).toBe(PERSONAL_SPACE);
  });

  it('with no page space, imports into the personal space and requests nothing', async () => {
    expect(await pick(null)).toBe(PERSONAL_SPACE);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.ensure).not.toHaveBeenCalled();
  });
});

describe('ingestionWriteTarget', () => {
  it('writes into the route space when the seed names none', () => {
    expect(ingestionWriteTarget(undefined, PAGE_SPACE)).toEqual({ spaceId: PAGE_SPACE, personalWrite: false });
  });

  it("writes into the seed's personal space, and flags it, when that isn't the route's", () => {
    expect(ingestionWriteTarget(PERSONAL_SPACE, PAGE_SPACE)).toEqual({ spaceId: PERSONAL_SPACE, personalWrite: true });
  });

  it("a seed naming the route's own space (a member) is not a personal write, whatever its spelling", () => {
    const dashed = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    expect(ingestionWriteTarget(dashed, PAGE_SPACE)).toEqual({ spaceId: dashed, personalWrite: false });
  });
});
