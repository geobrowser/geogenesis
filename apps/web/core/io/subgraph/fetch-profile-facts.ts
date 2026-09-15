import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import {
  DEBATE_OPPOSED_BY_PROPERTY,
  DEBATE_SUPPORTED_BY_PROPERTY,
  DEBATE_TYPE,
} from '~/core/profile/history-ontology';
import {
  NO_FACTS,
  type ProfileFacts,
  type ProfileSpace,
  type Verifier,
  orderSpaces,
} from '~/core/profile/profile-facts';

import { graphql } from './graphql';

type SpaceNode = {
  spaceId: string;
  space: { topic: { name: string | null } | null } | null;
};

type VerifierNode = {
  parentSpaceId: string;
  parentSpace: { type: string; topic: { name: string | null } | null } | null;
};

interface NetworkResult {
  members: { nodes: SpaceNode[] } | null;
  editors: { nodes: SpaceNode[] } | null;
  proposals: { totalCount: number } | null;
  positions: { totalCount: number } | null;
  supported: { nodes: { fromEntity: { id: string } | null }[] } | null;
  opposed: { nodes: { fromEntity: { id: string } | null }[] } | null;
  verifiedBy: { nodes: VerifierNode[] } | null;
  person: { createdAt: string | null } | null;
}

/**
 * Everything the rail states, in one request.
 *
 * Seven counts that have no aggregate between them — there is no per-person
 * summary in the API, so the choice is one round trip with seven aliases or
 * seven round trips. The page streams the header first either way; this only
 * decides how long the rail takes to arrive after it.
 *
 * `personEntityId` is here for the join date alone. Everything else keys on the
 * space, and passing the entity id to any of them returns zero rather than an
 * error, which is the whole trap this file exists to close.
 */
/**
 * One side of a debate, pointed at this space.
 *
 * Nodes rather than a count, and typed to `Debate`, because neither shortcut
 * survives the data. `totalCount` counts *relations*: this account carries 13
 * rows across 10 debates, one of them written three times. And without the type
 * filter the same query picks up side relations on things that are not debates
 * at all — the rail would say 17 where the tab shows 10, which reads as a bug in
 * one of them.
 */
function debateSide(typeId: string, sp: string) {
  return `relationsConnection(
    filter: {
      typeId: { is: "${typeId}" }
      toEntityId: { is: ${sp} }
      fromEntity: { typeIds: { overlaps: ["${DEBATE_TYPE}"] } }
    }
    first: 200
  ) { nodes { fromEntity { id } } }`;
}

function profileFactsQuery(spaceId: string, personEntityId: string | null) {
  const sp = JSON.stringify(spaceId);
  const person = personEntityId ? JSON.stringify(personEntityId) : null;

  return `query {
    members: membersConnection(filter: { memberSpaceId: { is: ${sp} } }, first: 200) {
      nodes { spaceId space { topic { name } } }
    }
    editors: editorsConnection(filter: { memberSpaceId: { is: ${sp} } }, first: 200) {
      nodes { spaceId space { topic { name } } }
    }
    proposals: proposalsConnection(filter: { proposedBy: { is: ${sp} } }) { totalCount }
    positions: userVotesConnection(
      filter: { userId: { is: ${sp} }, or: [{ voteKind: { is: 1 } }, { voteKind: { is: 2 } }] }
    ) { totalCount }
    supported: ${debateSide(DEBATE_SUPPORTED_BY_PROPERTY, sp)}
    opposed: ${debateSide(DEBATE_OPPOSED_BY_PROPERTY, sp)}
    verifiedBy: subspacesConnection(
      filter: { childSpaceId: { is: ${sp} }, type: { is: VERIFIED } }, first: 60
    ) {
      nodes { parentSpaceId parentSpace { type topic { name } } }
    }
    ${person ? `person: entity(id: ${person}) { createdAt }` : ''}
  }`;
}

export function profileFactsQueryKey(spaceId: string, personEntityId: string | null) {
  return ['profile-facts', spaceId, personEntityId] as const;
}

export async function fetchProfileFacts(spaceId: string, personEntityId: string | null): Promise<ProfileFacts> {
  const result = await Effect.runPromise(
    Effect.either(
      graphql<NetworkResult>({
        query: profileFactsQuery(spaceId, personEntityId),
        endpoint: Environment.getConfig().api,
      })
    )
  );

  if (Either.isLeft(result)) {
    // Answered with nothing rather than thrown. Unlike the history sections,
    // none of this is editable — a count the reader never sees is a worse page,
    // not a wrong write. The rail hides the rows it has no answer for.
    console.error(`[profile-facts] failed to fetch facts for ${spaceId}:`, result.left);
    return NO_FACTS;
  }

  const data = result.right;

  // Membership and editorship are separate rows that almost entirely overlap,
  // so they are merged into one list with the role on each. Two lists that agree
  // 33 times out of 33 read as a bug.
  const byId = new Map<string, ProfileSpace>();

  for (const node of data.members?.nodes ?? []) {
    byId.set(node.spaceId, {
      id: node.spaceId,
      name: node.space?.topic?.name ?? null,
      isEditor: false,
    });
  }

  for (const node of data.editors?.nodes ?? []) {
    const existing = byId.get(node.spaceId);
    byId.set(node.spaceId, {
      id: node.spaceId,
      name: existing?.name ?? node.space?.topic?.name ?? null,
      isEditor: true,
    });
  }

  const verifiedBy: Verifier[] = (data.verifiedBy?.nodes ?? []).map(node => ({
    spaceId: node.parentSpaceId,
    name: node.parentSpace?.topic?.name ?? null,
    // Avatars need a second read per verifier; the stack renders initials until
    // that is worth doing.
    avatarUrl: null,
    isPerson: node.parentSpace?.type === 'PERSONAL',
  }));

  return {
    proposals: data.proposals?.totalCount ?? 0,
    positions: data.positions?.totalCount ?? 0,
    // Distinct debates across both sides. Adding the two totals counts a debate
    // twice where it names the same person on both — and counts duplicate writes
    // as separate debates, which is how 10 becomes 13.
    debates: new Set(
      [...(data.supported?.nodes ?? []), ...(data.opposed?.nodes ?? [])]
        .map(node => node.fromEntity?.id)
        .filter((id): id is string => id !== undefined)
    ).size,
    spaces: orderSpaces([...byId.values()]),
    verifiedBy,
    joinedAt: data.person?.createdAt ? Number(data.person.createdAt) : null,
  };
}
