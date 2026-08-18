import { Effect } from 'effect';

import type { Space } from '~/core/io/dto/spaces';
import { getIsEditorOfSpace, getIsMemberOfSpace } from '~/core/io/queries';

export type SpaceAccess = {
  isEditor: boolean;
  isMember: boolean;
  canEdit: boolean;
};

export const noSpaceAccess: SpaceAccess = {
  isEditor: false,
  isMember: false,
  canEdit: false,
};

function toSpaceAccess(access: Pick<SpaceAccess, 'isEditor' | 'isMember'>): SpaceAccess {
  return {
    ...access,
    canEdit: access.isEditor || access.isMember,
  };
}

export function normalizeSpaceId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

/**
 * Decide membership from the denormalized participant list when it provably
 * contains every participant — the API caps these lists, so only trust a scan
 * when totalCount fits within what was loaded. Returns null when the list is
 * absent or truncated and a server-filtered query is required.
 */
function membershipFromCompleteList(
  list: string[] | undefined,
  totalCount: number | undefined,
  normalizedParticipantId: string
): boolean | null {
  if (!list || typeof totalCount !== 'number' || totalCount > list.length) return null;
  return list.some(id => normalizeSpaceId(id) === normalizedParticipantId);
}

export function getSpaceAccess(space: Space, personalSpaceId: string, signal?: AbortController['signal']) {
  const normalizedSpaceId = normalizeSpaceId(space.id);
  const normalizedPersonalSpaceId = normalizeSpaceId(personalSpaceId);

  if (space.type === 'PERSONAL') {
    const isOwner = normalizedPersonalSpaceId === normalizedSpaceId;
    return Effect.succeed(
      toSpaceAccess({
        isEditor: isOwner,
        isMember: isOwner,
      })
    );
  }

  return Effect.gen(function* () {
    const memberFromList = membershipFromCompleteList(space.members, space.totalMembers, normalizedPersonalSpaceId);
    const editorFromList = membershipFromCompleteList(space.editors, space.totalEditors, normalizedPersonalSpaceId);

    const [isMember, isEditor] = yield* Effect.all([
      memberFromList === null
        ? getIsMemberOfSpace(normalizedSpaceId, normalizedPersonalSpaceId, signal)
        : Effect.succeed(memberFromList),
      editorFromList === null
        ? getIsEditorOfSpace(normalizedSpaceId, normalizedPersonalSpaceId, signal)
        : Effect.succeed(editorFromList),
    ]);

    return toSpaceAccess({ isEditor, isMember });
  });
}

export function getSpaceAccessById(spaceId: string, personalSpaceId: string, signal?: AbortController['signal']) {
  const normalizedSpaceId = normalizeSpaceId(spaceId);
  const normalizedPersonalSpaceId = normalizeSpaceId(personalSpaceId);

  if (normalizedSpaceId === normalizedPersonalSpaceId) {
    return Effect.succeed(
      toSpaceAccess({
        isEditor: true,
        isMember: true,
      })
    );
  }

  return Effect.gen(function* () {
    const [isMember, isEditor] = yield* Effect.all([
      getIsMemberOfSpace(normalizedSpaceId, normalizedPersonalSpaceId, signal),
      getIsEditorOfSpace(normalizedSpaceId, normalizedPersonalSpaceId, signal),
    ]);

    return toSpaceAccess({ isEditor, isMember });
  });
}

export function getEditorSpaceIdsForSpace(
  spaceId: string,
  memberSpaceIds: string[],
  signal?: AbortController['signal']
) {
  const normalizedSpaceId = normalizeSpaceId(spaceId);
  const normalizedIds = [...new Set(memberSpaceIds.map(normalizeSpaceId))];

  return Effect.gen(function* () {
    const editorChecks = yield* Effect.forEach(
      normalizedIds,
      memberSpaceId =>
        Effect.gen(function* () {
          const isEditor =
            memberSpaceId === normalizedSpaceId
              ? true
              : yield* getIsEditorOfSpace(normalizedSpaceId, memberSpaceId, signal);
          return { memberSpaceId, isEditor };
        }),
      { concurrency: 10 }
    );

    return new Set(editorChecks.filter(check => check.isEditor).map(check => check.memberSpaceId));
  });
}
