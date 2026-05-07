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
    const [isMember, isEditor] = yield* Effect.all([
      getIsMemberOfSpace(normalizedSpaceId, normalizedPersonalSpaceId, signal),
      getIsEditorOfSpace(normalizedSpaceId, normalizedPersonalSpaceId, signal),
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
