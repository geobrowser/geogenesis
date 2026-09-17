import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queries = {
  getIsMemberOfSpace: vi.fn(),
  getIsEditorOfSpace: vi.fn(),
  getSpaceRolesForParticipants: vi.fn(),
};

vi.mock('~/core/io/queries', () => queries);

const { getEditorSpaceIdsForSpace, getSpaceAccess, getSpaceRoles } = await import('./space-access');

describe('space-access', () => {
  beforeEach(() => {
    queries.getIsMemberOfSpace.mockReset();
    queries.getIsEditorOfSpace.mockReset();
    queries.getSpaceRolesForParticipants.mockReset();
  });

  it('treats the owner of a personal space as editor and member without participant-list queries', async () => {
    const access = await Effect.runPromise(
      getSpaceAccess({ id: 'personal-space-id', type: 'PERSONAL' } as any, 'personal-space-id')
    );

    expect(access).toEqual({
      isEditor: true,
      isMember: true,
      canEdit: true,
    });
    expect(queries.getIsMemberOfSpace).not.toHaveBeenCalled();
    expect(queries.getIsEditorOfSpace).not.toHaveBeenCalled();
  });

  it('uses server-filtered participant checks for DAO access', async () => {
    queries.getIsMemberOfSpace.mockReturnValue(Effect.succeed(true));
    queries.getIsEditorOfSpace.mockReturnValue(Effect.succeed(false));

    const access = await Effect.runPromise(
      getSpaceAccess({ id: 'dao-space-id', type: 'DAO' } as any, 'member-space-id')
    );

    expect(queries.getIsMemberOfSpace).toHaveBeenCalledWith('daospaceid', 'memberspaceid', undefined);
    expect(queries.getIsEditorOfSpace).toHaveBeenCalledWith('daospaceid', 'memberspaceid', undefined);
    expect(access).toEqual({
      isEditor: false,
      isMember: true,
      canEdit: true,
    });
  });

  it('normalizes dashed and uppercase IDs before checking DAO access', async () => {
    queries.getIsMemberOfSpace.mockReturnValue(Effect.succeed(true));
    queries.getIsEditorOfSpace.mockReturnValue(Effect.succeed(false));

    await Effect.runPromise(
      getSpaceAccess(
        { id: 'C9F267DC-B0D2-7071-8C2A-3C45A64AFD32', type: 'DAO' } as any,
        '68E800D1-D89E-8F0C-3293-82F4C3106D78'
      )
    );

    expect(queries.getIsMemberOfSpace).toHaveBeenCalledWith(
      'c9f267dcb0d270718c2a3c45a64afd32',
      '68e800d1d89e8f0c329382f4c3106d78',
      undefined
    );
  });

  it('derives DAO access from the participant lists without queries when the lists are complete', async () => {
    const access = await Effect.runPromise(
      getSpaceAccess(
        {
          id: 'dao-space-id',
          type: 'DAO',
          members: ['MEMBER-SPACE-ID', 'other-member'],
          totalMembers: 2,
          editors: ['other-editor'],
          totalEditors: 1,
        } as any,
        'member-space-id'
      )
    );

    expect(access).toEqual({
      isEditor: false,
      isMember: true,
      canEdit: true,
    });
    expect(queries.getIsMemberOfSpace).not.toHaveBeenCalled();
    expect(queries.getIsEditorOfSpace).not.toHaveBeenCalled();
  });

  it('falls back to server-filtered queries when a participant list is truncated', async () => {
    queries.getIsMemberOfSpace.mockReturnValue(Effect.succeed(true));

    const access = await Effect.runPromise(
      getSpaceAccess(
        {
          id: 'dao-space-id',
          type: 'DAO',
          // Truncated: more members exist than were loaded, so a scan can't be trusted.
          members: ['other-member'],
          totalMembers: 150,
          editors: ['editor-space-id'],
          totalEditors: 1,
        } as any,
        'member-space-id'
      )
    );

    expect(queries.getIsMemberOfSpace).toHaveBeenCalledWith('daospaceid', 'memberspaceid', undefined);
    expect(queries.getIsEditorOfSpace).not.toHaveBeenCalled();
    expect(access).toEqual({
      isEditor: false,
      isMember: true,
      canEdit: true,
    });
  });

  it('resolves editor badges from a server-filtered role lookup', async () => {
    queries.getSpaceRolesForParticipants.mockReturnValue(
      Effect.succeed({
        editorSpaceIds: ['4cd9cca5530b69056aead853c8088e7e'],
        memberSpaceIds: ['4cd9cca5530b69056aead853c8088e7e', 'cc0bf85a27c217d75993bc785a15b198'],
      })
    );

    const editorIds = await Effect.runPromise(
      getEditorSpaceIdsForSpace('d4bee092-8fb5-405b-aba3-b1513f085835', [
        '4cd9cca5-530b-6905-6aea-d853c8088e7e',
        'cc0bf85a-27c2-17d7-5993-bc785a15b198',
      ])
    );

    expect(editorIds).toEqual(new Set(['4cd9cca5530b69056aead853c8088e7e']));
  });

  /**
   * One request for both roles rather than one per person per role. A thread's authors are asked
   * about as a set, so the cost does not grow with the number of people in it.
   */
  it('asks about every participant at once, for both roles', async () => {
    queries.getSpaceRolesForParticipants.mockReturnValue(
      Effect.succeed({
        editorSpaceIds: ['4cd9cca5530b69056aead853c8088e7e'],
        memberSpaceIds: ['cc0bf85a27c217d75993bc785a15b198'],
      })
    );

    const roles = await Effect.runPromise(
      getSpaceRoles('d4bee092-8fb5-405b-aba3-b1513f085835', [
        '4cd9cca5-530b-6905-6aea-d853c8088e7e',
        'cc0bf85a-27c2-17d7-5993-bc785a15b198',
        '4CD9CCA5-530B-6905-6AEA-D853C8088E7E',
      ])
    );

    expect(queries.getSpaceRolesForParticipants).toHaveBeenCalledTimes(1);
    const [askedSpaceId, askedIds] = queries.getSpaceRolesForParticipants.mock.calls[0];
    expect(askedSpaceId).toBe('d4bee0928fb5405baba3b1513f085835');
    // Deduped across spellings, so the same person is not asked about twice.
    expect(askedIds).toEqual(['4cd9cca5530b69056aead853c8088e7e', 'cc0bf85a27c217d75993bc785a15b198']);
    expect(roles.editorSpaceIds).toEqual(new Set(['4cd9cca5530b69056aead853c8088e7e']));
    expect(roles.memberSpaceIds).toEqual(new Set(['cc0bf85a27c217d75993bc785a15b198']));
  });

  /**
   * A comment that has not published yet stands in with `pending:<wallet>` for its author's space, and
   * that is not a UUID. Batched into a `[UUID!]` variable it fails coercion and takes the whole
   * request down — so every badge on the page would vanish because one comment was mid-publish.
   */
  it('leaves out ids the API could not accept, rather than failing the batch', async () => {
    queries.getSpaceRolesForParticipants.mockReturnValue(
      Effect.succeed({ editorSpaceIds: ['4cd9cca5530b69056aead853c8088e7e'], memberSpaceIds: [] })
    );

    const roles = await Effect.runPromise(
      getSpaceRoles('d4bee092-8fb5-405b-aba3-b1513f085835', [
        '4cd9cca5-530b-6905-6aea-d853c8088e7e',
        'pending:0x5D6d0E45D76D360AB4F94941CE9a005b0AEa2ebD',
        '',
      ])
    );

    const [, askedIds] = queries.getSpaceRolesForParticipants.mock.calls[0];
    expect(askedIds).toEqual(['4cd9cca5530b69056aead853c8088e7e']);
    // The real author keeps their badge; the one still publishing simply has none yet.
    expect(roles.editorSpaceIds).toEqual(new Set(['4cd9cca5530b69056aead853c8088e7e']));
  });

  it('asks nothing at all when the space id itself is not an id', async () => {
    const roles = await Effect.runPromise(getSpaceRoles('pending:0xabc', ['4cd9cca5-530b-6905-6aea-d853c8088e7e']));

    expect(queries.getSpaceRolesForParticipants).not.toHaveBeenCalled();
    expect(roles.editorSpaceIds.size).toBe(0);
  });

  /** A personal space holds every role in itself, and the participant lists do not say so. */
  it('grants a personal space both roles in itself without asking', async () => {
    queries.getSpaceRolesForParticipants.mockReturnValue(Effect.succeed({ editorSpaceIds: [], memberSpaceIds: [] }));

    const roles = await Effect.runPromise(
      getSpaceRoles('fcf1ddb1-4f46-1bf7-47bb-f148254935ed', ['fcf1ddb1-4f46-1bf7-47bb-f148254935ed'])
    );

    expect(queries.getSpaceRolesForParticipants).not.toHaveBeenCalled();
    expect(roles.editorSpaceIds).toEqual(new Set(['fcf1ddb14f461bf747bbf148254935ed']));
    expect(roles.memberSpaceIds).toEqual(new Set(['fcf1ddb14f461bf747bbf148254935ed']));
  });
});
