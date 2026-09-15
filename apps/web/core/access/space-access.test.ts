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
      Effect.succeed({ editorSpaceIds: ['editorspaceid'], memberSpaceIds: ['editorspaceid', 'memberspaceid'] })
    );

    const editorIds = await Effect.runPromise(
      getEditorSpaceIdsForSpace('dao-space-id', ['editor-space-id', 'member-space-id'])
    );

    expect(editorIds).toEqual(new Set(['editorspaceid']));
  });

  /**
   * One request for both roles rather than one per person per role. A thread's authors are asked
   * about as a set, so the cost does not grow with the number of people in it.
   */
  it('asks about every participant at once, for both roles', async () => {
    queries.getSpaceRolesForParticipants.mockReturnValue(
      Effect.succeed({ editorSpaceIds: ['editorspaceid'], memberSpaceIds: ['memberspaceid'] })
    );

    const roles = await Effect.runPromise(
      getSpaceRoles('dao-space-id', ['editor-space-id', 'member-space-id', 'Editor-Space-Id'])
    );

    expect(queries.getSpaceRolesForParticipants).toHaveBeenCalledTimes(1);
    const [askedSpaceId, askedIds] = queries.getSpaceRolesForParticipants.mock.calls[0];
    expect(askedSpaceId).toBe('daospaceid');
    // Deduped across spellings, so the same person is not asked about twice.
    expect(askedIds).toEqual(['editorspaceid', 'memberspaceid']);
    expect(roles.editorSpaceIds).toEqual(new Set(['editorspaceid']));
    expect(roles.memberSpaceIds).toEqual(new Set(['memberspaceid']));
  });

  /** A personal space holds every role in itself, and the participant lists do not say so. */
  it('grants a personal space both roles in itself without asking', async () => {
    queries.getSpaceRolesForParticipants.mockReturnValue(Effect.succeed({ editorSpaceIds: [], memberSpaceIds: [] }));

    const roles = await Effect.runPromise(getSpaceRoles('personal-space-id', ['personal-space-id']));

    expect(queries.getSpaceRolesForParticipants).not.toHaveBeenCalled();
    expect(roles.editorSpaceIds).toEqual(new Set(['personalspaceid']));
    expect(roles.memberSpaceIds).toEqual(new Set(['personalspaceid']));
  });
});
