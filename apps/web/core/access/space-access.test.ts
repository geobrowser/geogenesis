import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queries = {
  getIsMemberOfSpace: vi.fn(),
  getIsEditorOfSpace: vi.fn(),
  getSpace: vi.fn(),
};

vi.mock('~/core/io/queries', () => queries);

const { getEditorSpaceIdsForSpace, getSpaceAccess } = await import('./space-access');

describe('space-access', () => {
  beforeEach(() => {
    queries.getIsMemberOfSpace.mockReset();
    queries.getIsEditorOfSpace.mockReset();
    queries.getSpace.mockReset();
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

    expect(queries.getIsMemberOfSpace).toHaveBeenCalledWith('dao-space-id', 'member-space-id', undefined);
    expect(queries.getIsEditorOfSpace).toHaveBeenCalledWith('dao-space-id', 'member-space-id', undefined);
    expect(access).toEqual({
      isEditor: false,
      isMember: true,
      canEdit: true,
    });
  });

  it('resolves editor badges from server-filtered access checks', async () => {
    queries.getSpace.mockReturnValue(Effect.succeed({ id: 'dao-space-id', type: 'DAO' }));
    queries.getIsMemberOfSpace.mockReturnValue(Effect.succeed(true));
    queries.getIsEditorOfSpace.mockImplementation((_spaceId: string, memberSpaceId: string) =>
      Effect.succeed(memberSpaceId === 'editor-space-id')
    );

    const editorIds = await Effect.runPromise(
      getEditorSpaceIdsForSpace('dao-space-id', ['editor-space-id', 'member-space-id'])
    );

    expect(editorIds).toEqual(new Set(['editor-space-id']));
  });
});
