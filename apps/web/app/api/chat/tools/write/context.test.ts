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
  editLimit: { limit: vi.fn(async () => ({ success: true, reset: Date.now() })) },
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

  it('resolves the profile entity from the space topic, not the space id', async () => {
    queries.getSpaceByAddress.mockReturnValue(
      Effect.succeed({ id: 'personal-space-id', topicId: 'Profile-Entity-Id', entity: { id: 'ignored-entity-id' } })
    );

    const context = buildWriteContext({ walletAddress: '0xabc' });
    if (context.kind !== 'member') throw new Error('expected a member context');

    await expect(context.profileEntityId()).resolves.toBe('profileentityid');
    await expect(context.personalSpaceId()).resolves.toBe('personalspaceid');
  });

  it('falls back to the space home entity when no topic id is indexed', async () => {
    queries.getSpaceByAddress.mockReturnValue(
      Effect.succeed({ id: 'personal-space-id', topicId: null, entity: { id: 'home-entity-id' } })
    );

    const context = buildWriteContext({ walletAddress: '0xabc' });
    if (context.kind !== 'member') throw new Error('expected a member context');

    await expect(context.profileEntityId()).resolves.toBe('homeentityid');
  });

  it('resolves the profile to null rather than substituting the space id', async () => {
    // An empty `entity.id` is what SpaceEntityDto produces for a space with no
    // topic entity. Handing the space id over instead would aim writes at the
    // wrong entity, so "unknown" has to stay unknown.
    queries.getSpaceByAddress.mockReturnValue(
      Effect.succeed({ id: 'personal-space-id', topicId: null, entity: { id: '' } })
    );

    const context = buildWriteContext({ walletAddress: '0xabc' });
    if (context.kind !== 'member') throw new Error('expected a member context');

    await expect(context.profileEntityId()).resolves.toBeNull();
    await expect(context.personalSpaceId()).resolves.toBe('personalspaceid');
  });

  it('survives a space record with no entity attached', async () => {
    // Guards the membership lookup's shared try/catch: a throw in profile
    // derivation would surface as "no personal space" and swallow access errors.
    queries.getSpaceByAddress.mockReturnValue(Effect.succeed({ id: 'personal-space-id' }));
    access.getSpaceAccessById.mockReturnValue(Effect.succeed({ isEditor: true, isMember: false, canEdit: true }));

    const context = buildWriteContext({ walletAddress: '0xabc' });
    if (context.kind !== 'member') throw new Error('expected a member context');

    await expect(context.profileEntityId()).resolves.toBeNull();
    await expect(context.personalSpaceId()).resolves.toBe('personalspaceid');
    await expect(context.isMember('dao-space-id')).resolves.toBe(true);
  });

  it('drops rejected access cache entries so later checks can retry', async () => {
    queries.getSpaceByAddress.mockReturnValue(Effect.succeed({ id: 'personal-space-id' }));
    access.getSpaceAccessById
      .mockReturnValueOnce(Effect.fail(new Error('temporary failure')))
      .mockReturnValueOnce(Effect.succeed({ isEditor: false, isMember: true, canEdit: true }));

    const context = buildWriteContext({ walletAddress: '0xabc' });

    await expect(context.isMember('dao-space-id')).rejects.toThrow('temporary failure');
    await expect(context.isMember('dao-space-id')).resolves.toBe(true);
    expect(access.getSpaceAccessById).toHaveBeenCalledTimes(2);
  });
});
