import { Effect } from 'effect';

import type { Space } from '~/core/io/dto/spaces';
import { getIsEditorOfSpace, getIsMemberOfSpace, getSpaceRolesForParticipants } from '~/core/io/queries';
import { validateSpaceId } from '~/core/io/rest/validation';

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
 * Chunk size for the role lookup. The query caps returned rows by the number of ids asked about, so
 * the two have to move together; this keeps both the URL and the response bounded.
 */
const ROLE_LOOKUP_CHUNK = 100;

export type SpaceRoles = {
  editorSpaceIds: Set<string>;
  memberSpaceIds: Set<string>;
};

const EMPTY_SPACE_ROLES: SpaceRoles = { editorSpaceIds: new Set(), memberSpaceIds: new Set() };

function isSpaceId(id: string | null): id is string {
  return id !== null;
}

/**
 * Both roles, for the people asked about, in one request per chunk of 100.
 *
 * Server-filtered by the set rather than read out of the space's participant lists, because those
 * lists are capped: a space with more participants than the cap would report everyone past it as
 * holding no role, which is indistinguishable from a correct answer. Filtering by the people we
 * actually care about has no such ceiling, and costs one request rather than one per person per role.
 */
export function getSpaceRoles(
  spaceId: string,
  participantSpaceIds: string[],
  signal?: AbortController['signal']
): Effect.Effect<SpaceRoles, unknown> {
  // Only ids the API can actually accept reach the query. A comment that has not published yet stands
  // in with `pending:<wallet>` for its author's space (see `useCreateComment`), and one of those in
  // the batch fails coercion against a `[UUID!]` variable — which takes down the whole request, and
  // with it every badge on the page rather than only that author's. Batching for one request is
  // exactly what makes a single bad id everyone's problem, so this boundary has to be strict.
  const normalizedSpaceId = validateSpaceId(spaceId);
  const normalizedIds = [...new Set(participantSpaceIds.map(validateSpaceId).filter(isSpaceId))];

  if (!normalizedSpaceId) return Effect.succeed(EMPTY_SPACE_ROLES);

  return Effect.gen(function* () {
    const editorSpaceIds = new Set<string>();
    const memberSpaceIds = new Set<string>();

    // A personal space holds every role in itself, and the participant lists do not say so.
    if (normalizedIds.includes(normalizedSpaceId)) {
      editorSpaceIds.add(normalizedSpaceId);
      memberSpaceIds.add(normalizedSpaceId);
    }

    const toAsk = normalizedIds.filter(id => id !== normalizedSpaceId);
    const chunks: string[][] = [];
    for (let index = 0; index < toAsk.length; index += ROLE_LOOKUP_CHUNK) {
      chunks.push(toAsk.slice(index, index + ROLE_LOOKUP_CHUNK));
    }

    const pages = yield* Effect.forEach(
      chunks,
      chunk => getSpaceRolesForParticipants(normalizedSpaceId, chunk, signal),
      { concurrency: 4 }
    );

    for (const page of pages) {
      for (const id of page.editorSpaceIds) editorSpaceIds.add(normalizeSpaceId(id));
      for (const id of page.memberSpaceIds) memberSpaceIds.add(normalizeSpaceId(id));
    }

    return { editorSpaceIds, memberSpaceIds };
  });
}
