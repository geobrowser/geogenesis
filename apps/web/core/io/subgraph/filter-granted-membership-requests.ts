import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import { normalizeSpaceId } from '~/core/access/space-access';
import { Environment } from '~/core/environment';
import { type ApiAction, isValidUUID } from '~/core/io/rest';

import { graphql } from './graphql';

type ProposalLike = {
  spaceId: string;
  actions: readonly Pick<ApiAction, 'actionType' | 'targetId'>[];
};

type SpaceRoster = {
  members: Set<string>;
  editors: Set<string>;
};

type RosterResult = {
  space: {
    membersList: { memberSpaceId: string }[];
    editorsList: { memberSpaceId: string }[];
  } | null;
};

function addActionsOf(p: ProposalLike): { actionType: 'ADD_MEMBER' | 'ADD_EDITOR'; targetId: string }[] {
  return p.actions.flatMap(a =>
    (a.actionType === 'ADD_MEMBER' || a.actionType === 'ADD_EDITOR') && a.targetId
      ? [{ actionType: a.actionType, targetId: a.targetId }]
      : []
  );
}

/**
 * Which of `candidateSpaceIds` already belong to `spaceId`. Returns null on
 * error so callers fail open instead of hiding requests they can't verify.
 */
async function fetchSpaceRoster(spaceId: string, candidateSpaceIds: string[]): Promise<SpaceRoster | null> {
  const ids = [...new Set(candidateSpaceIds.filter(isValidUUID).map(normalizeSpaceId))];

  if (!isValidUUID(spaceId) || ids.length === 0) {
    return { members: new Set(), editors: new Set() };
  }

  const idList = ids.map(id => `"${id}"`).join(', ');
  const query = `query {
    space(id: "${normalizeSpaceId(spaceId)}") {
      membersList(filter: { memberSpaceId: { in: [${idList}] } }, first: ${ids.length}) {
        memberSpaceId
      }
      editorsList(filter: { memberSpaceId: { in: [${idList}] } }, first: ${ids.length}) {
        memberSpaceId
      }
    }
  }`;

  const result = await Effect.runPromise(
    Effect.either(graphql<RosterResult>({ endpoint: Environment.getConfig().api, query }))
  );

  if (Either.isLeft(result)) {
    console.error(`Failed to fetch member/editor roster for space ${spaceId}:`, result.left);
    return null;
  }

  return {
    members: new Set(result.right.space?.membersList.map(m => normalizeSpaceId(m.memberSpaceId)) ?? []),
    editors: new Set(result.right.space?.editorsList.map(e => normalizeSpaceId(e.memberSpaceId)) ?? []),
  };
}

/**
 * Drops add-member requests whose target is already a member (or editor) of the
 * space and add-editor requests whose target is already an editor. Once one of
 * several duplicate requests is accepted, the rest stay PROPOSED forever — the
 * live roster is the source of truth. Only call this for open proposals;
 * completed history should stay intact.
 */
export async function filterGrantedMembershipRequests<T extends ProposalLike>(proposals: readonly T[]): Promise<T[]> {
  const targetsBySpace = proposals.reduce((acc, p) => {
    const targets = addActionsOf(p).map(a => a.targetId);
    if (targets.length > 0) {
      acc.set(p.spaceId, [...(acc.get(p.spaceId) ?? []), ...targets]);
    }
    return acc;
  }, new Map<string, string[]>());

  if (targetsBySpace.size === 0) {
    return [...proposals];
  }

  const spaceIds = [...targetsBySpace.keys()];
  const rosters = await Promise.all(spaceIds.map(spaceId => fetchSpaceRoster(spaceId, targetsBySpace.get(spaceId)!)));
  const rosterBySpaceId = new Map(spaceIds.map((id, i) => [id, rosters[i]]));

  return proposals.filter(p => {
    const roster = rosterBySpaceId.get(p.spaceId);
    if (!roster) return true;

    const addActions = addActionsOf(p);
    if (addActions.length === 0) return true;

    return !addActions.every(a => {
      const target = normalizeSpaceId(a.targetId);
      // Editors aren't always in the members list, but they already belong to
      // the space — an add-member request for an editor is just as stale.
      return a.actionType === 'ADD_MEMBER'
        ? roster.members.has(target) || roster.editors.has(target)
        : roster.editors.has(target);
    });
  });
}
