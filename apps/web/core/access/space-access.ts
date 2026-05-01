import { Effect } from 'effect';

import type { Space } from '~/core/io/dto/spaces';
import { getIsEditorOfSpace, getIsMemberOfSpace, getSpace } from '~/core/io/queries';

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

export function getSpaceAccess(space: Space, personalSpaceId: string, signal?: AbortController['signal']) {
  const normalizedPersonalSpaceId = personalSpaceId.toLowerCase();

  if (space.type === 'PERSONAL') {
    const isOwner = normalizedPersonalSpaceId === space.id.toLowerCase();
    return Effect.succeed(
      toSpaceAccess({
        isEditor: isOwner,
        isMember: isOwner,
      })
    );
  }

  return Effect.gen(function* () {
    const isMember = yield* getIsMemberOfSpace(space.id, normalizedPersonalSpaceId, signal);
    const isEditor = yield* getIsEditorOfSpace(space.id, normalizedPersonalSpaceId, signal);

    return toSpaceAccess({ isEditor, isMember });
  });
}

export function getSpaceAccessById(spaceId: string, personalSpaceId: string, signal?: AbortController['signal']) {
  return Effect.gen(function* () {
    const space = yield* getSpace(spaceId, signal);

    if (!space) {
      return noSpaceAccess;
    }

    return yield* getSpaceAccess(space, personalSpaceId, signal);
  });
}

export function getEditorSpaceIdsForSpace(
  spaceId: string,
  memberSpaceIds: string[],
  signal?: AbortController['signal']
) {
  const normalizedIds = [...new Set(memberSpaceIds.map(id => id.toLowerCase()))];

  return Effect.gen(function* () {
    const space = yield* getSpace(spaceId, signal);

    if (!space) {
      return new Set<string>();
    }

    const editorChecks = yield* Effect.forEach(
      normalizedIds,
      memberSpaceId =>
        Effect.gen(function* () {
          const access = yield* getSpaceAccess(space, memberSpaceId, signal);
          return { memberSpaceId, isEditor: access.isEditor };
        }),
      { concurrency: 10 }
    );

    return new Set(editorChecks.filter(check => check.isEditor).map(check => check.memberSpaceId));
  });
}
