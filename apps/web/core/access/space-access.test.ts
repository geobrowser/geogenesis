import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queries = {
  getIsMemberOfSpace: vi.fn(),
  getIsEditorOfSpace: vi.fn(),
};

vi.mock('~/core/io/queries', () => queries);

const { getEditorSpaceIdsForSpace, getSpaceAccess } = await import('./space-access');

describe('space-access', () => {
  beforeEach(() => {
    queries.getIsMemberOfSpace.mockReset();
    queries.getIsEditorOfSpace.mockReset();
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

    const access = await Effect.runPromise(getSpaceAccess({ id: 'dao-space-id', type: 'DAO' } as any, 'member-space-id'));

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

  it('resolves editor badges from server-filtered access checks', async () => {
    queries.getIsEditorOfSpace.mockImplementation((_spaceId: string, memberSpaceId: string) =>
      Effect.succeed(memberSpaceId === 'editorspaceid')
    );

    const editorIds = await Effect.runPromise(
      getEditorSpaceIdsForSpace('dao-space-id', ['editor-space-id', 'member-space-id'])
    );

    expect(editorIds).toEqual(new Set(['editorspaceid']));
  });
});
