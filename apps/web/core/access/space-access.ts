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

/**
 * Which of these people hold `role` in the space, asked one person at a time.
 *
 * Server-filtered per person rather than read out of the space's participant lists, because those
 * lists are capped: a space with more participants than the cap would answer "not an editor" for
 * everyone past it, which is indistinguishable from a correct answer. Asking about the people we
 * actually care about has no such ceiling, and scales with them rather than with the space.
 */
function getRoleSpaceIdsForSpace(
  role: 'editor' | 'member',
  spaceId: string,
  participantSpaceIds: string[],
  signal?: AbortController['signal']
) {
  const normalizedSpaceId = normalizeSpaceId(spaceId);
  const normalizedIds = [...new Set(participantSpaceIds.map(normalizeSpaceId))];
  const hasRole = role === 'editor' ? getIsEditorOfSpace : getIsMemberOfSpace;

  return Effect.gen(function* () {
    const checks = yield* Effect.forEach(
      normalizedIds,
      memberSpaceId =>
        Effect.gen(function* () {
          // A personal space holds every role in itself.
          const holds =
            memberSpaceId === normalizedSpaceId ? true : yield* hasRole(normalizedSpaceId, memberSpaceId, signal);
          return { memberSpaceId, holds };
        }),
      { concurrency: 10 }
    );

    return new Set(checks.filter(check => check.holds).map(check => check.memberSpaceId));
  });
}

export function getEditorSpaceIdsForSpace(
  spaceId: string,
  memberSpaceIds: string[],
  signal?: AbortController['signal']
) {
  return getRoleSpaceIdsForSpace('editor', spaceId, memberSpaceIds, signal);
}

export function getMemberSpaceIdsForSpace(
  spaceId: string,
  memberSpaceIds: string[],
  signal?: AbortController['signal']
) {
  return getRoleSpaceIdsForSpace('member', spaceId, memberSpaceIds, signal);
}
