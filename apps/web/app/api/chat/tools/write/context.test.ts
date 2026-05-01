import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queries = {
  getSpaceByAddress: vi.fn(),
};

const access = {
  getSpaceAccessById: vi.fn(),
};

vi.mock('~/core/io/queries', () => queries);
vi.mock('~/core/access/space-access', () => access);
vi.mock('../../rate-limit', () => ({
  editBurstLimit: { limit: vi.fn(async () => ({ success: true, reset: Date.now() })) },
  editHourlyLimit: { limit: vi.fn(async () => ({ success: true, reset: Date.now() })) },
}));

const { buildWriteContext } = await import('./context');

describe('buildWriteContext', () => {
  beforeEach(() => {
    queries.getSpaceByAddress.mockReset();
    access.getSpaceAccessById.mockReset();
  });

  it('authorizes writes through centralized space access checks', async () => {
    queries.getSpaceByAddress.mockReturnValue(Effect.succeed({ id: 'personal-space-id' }));
    access.getSpaceAccessById.mockReturnValue(Effect.succeed({ isEditor: true, isMember: false, canEdit: true }));

    const context = buildWriteContext({ walletAddress: '0xabc' });

    await expect(context.isMember('dao-space-id')).resolves.toBe(true);
    expect(access.getSpaceAccessById).toHaveBeenCalledWith('daospaceid', 'personalspaceid');
  });
});
