import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { DEBATE_OPPOSED_BY_PROPERTY, DEBATE_SUPPORTED_BY_PROPERTY, DEBATE_TYPE } from '~/core/profile/history-ontology';
import { visibleDebateCount } from '~/core/profile/profile-debate-visibility';
import { type ProfileFacts, type ProfileSpace, type Verifier, orderSpaces } from '~/core/profile/profile-facts';

import { graphql } from './graphql';
import { hiddenProfileRelationTargetsConnection } from './hidden-profile-relations-query';

/** A space, named the way `SpaceDto` names one: topic first, then page. */
type NamedSpace = {
  type?: string;
  topic: { name: string | null } | null;
  page: { name: string | null } | null;
} | null;

type SpaceNode = {
  spaceId: string;
  space: NamedSpace;
};

type VerifierNode = {
  parentSpaceId: string;
  parentSpace: NamedSpace;
};

interface NetworkResult {
  members: { nodes: SpaceNode[] } | null;
  editors: { nodes: SpaceNode[] } | null;
  proposals: { totalCount: number } | null;
  positions: { totalCount: number } | null;
  supported: { nodes: { fromEntity: { id: string } | null }[] } | null;
  opposed: { nodes: { fromEntity: { id: string } | null }[] } | null;
  hidden: { nodes: { toEntityId: string }[] } | null;
  verifiedBy: { nodes: VerifierNode[] } | null;
  person: { createdAt: string | null } | null;
}

/**
 * The vote kinds that mean "a position on a claim".
 *
 * 1 is a stance and 2 is veracity. The table holds other kinds, and counting it
 * unfiltered overstates the figure roughly threefold.
 */
const POSITION_KINDS = '[1, 2]';

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

/**
 * What to call a space, from `topic` then `page`.
 *
 * `SpaceDto` builds a space's entity as `topic ?? page` and every other surface
 * therefore gets this for free; these three queries hand-select their columns
 * and so have to do it themselves. Reading `topic.name` alone is the same
 * mistake `isPersonProfileSpace` exists to correct, one layer down.
 *
 * Measured on the reference account: 4 of its 33 memberships are named only by
 * `page` — "EE Solutions", "Baseball", "Cincinnati", "Geo<>Factorylabs" — and
 * one of its three verifiers is a personal space with no topic at all, whose
 * person is called Nate. All five rendered unnamed.
 *
 * Worth noting the four are **DAO** spaces, not personal ones. A missing topic
 * is not only the personal-space case it was first found as, so the fallback
 * belongs on every one of these reads rather than the ones that look like
 * people.
 */
const spaceName = (space: NamedSpace): string | null => space?.topic?.name ?? space?.page?.name ?? null;

/**
 * Everything the rail states, in one request.
 *
 * No per-person summary exists in the API, so the choice is one round trip with
 * seven aliases or seven round trips. The page streams the header first either
 * way; this only decides how long the rail takes to arrive after it.
 *
 * `personEntityId` is here for the join date alone. Everything else keys on the
 * space, and passing the entity id to any of them returns zero rather than an
 * error, which is the whole trap this file exists to close.
 */
function profileFactsQuery(spaceId: string, personEntityId: string | null) {
  const sp = JSON.stringify(spaceId);
  const person = personEntityId ? JSON.stringify(personEntityId) : null;

  return `query {
    members: membersConnection(filter: { memberSpaceId: { is: ${sp} } }, first: 200) {
      nodes { spaceId space { topic { name } page { name } } }
    }
    editors: editorsConnection(filter: { memberSpaceId: { is: ${sp} } }, first: 200) {
      nodes { spaceId space { topic { name } page { name } } }
    }
    proposals: proposalsConnection(filter: { proposedBy: { is: ${sp} } }) { totalCount }
    positions: entitiesConnection(votedBy: ${sp}, votedByKinds: ${POSITION_KINDS}) { totalCount }
    supported: ${debateSide(DEBATE_SUPPORTED_BY_PROPERTY, sp)}
    opposed: ${debateSide(DEBATE_OPPOSED_BY_PROPERTY, sp)}
    hidden: ${hiddenProfileRelationTargetsConnection(spaceId)}
    verifiedBy: subspacesConnection(
      filter: { childSpaceId: { is: ${sp} }, type: { is: VERIFIED } }, first: 60
    ) {
      nodes { parentSpaceId parentSpace { type topic { name } page { name } } }
    }
    ${person ? `person: entity(id: ${person}) { createdAt }` : ''}
  }`;
}

export function profileFactsQueryKey(spaceId: string, personEntityId: string | null) {
  return [...profileFactsQueryPrefix(spaceId), personEntityId] as const;
}

export function profileFactsQueryPrefix(spaceId: string) {
  return ['profile-facts', spaceId] as const;
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
    // Thrown, so the caller can tell "we could not read this" from "this person
    // has done nothing". Answering `NO_FACTS` here made the rail state a
    // confident 0 against all three counts — the one reading it cannot know it
    // is looking at a failed request, and 0 debates is a claim about a person.
    console.error(`[profile-facts] failed to fetch facts for ${spaceId}:`, result.left);
    throw result.left;
  }

  const data = result.right;

  // Membership and editorship are separate rows that almost entirely overlap,
  // so they are merged into one list with the role on each. Two lists that agree
  // 33 times out of 33 read as a bug.
  const byId = new Map<string, ProfileSpace>();

  for (const node of data.members?.nodes ?? []) {
    byId.set(node.spaceId, {
      id: node.spaceId,
      name: spaceName(node.space),
      isEditor: false,
    });
  }

  for (const node of data.editors?.nodes ?? []) {
    const existing = byId.get(node.spaceId);
    byId.set(node.spaceId, {
      id: node.spaceId,
      name: existing?.name ?? spaceName(node.space),
      isEditor: true,
    });
  }

  const verifiedBy: Verifier[] = (data.verifiedBy?.nodes ?? []).map(node => ({
    spaceId: node.parentSpaceId,
    name: spaceName(node.parentSpace),
    // Avatars need a second read per verifier; the stack renders initials until
    // that is worth doing.
    avatarUrl: null,
    isPerson: node.parentSpace?.type === 'PERSONAL',
  }));

  return {
    proposals: data.proposals?.totalCount ?? 0,
    // Claims, not vote rows. `votedBy` counts entities, so the stance and
    // veracity votes somebody cast on the same claim are one row here — which
    // is what the tab shows, and what `userVotesConnection.totalCount` could
    // never say. Verified against both: 194 vote rows, 190 claims.
    positions: data.positions?.totalCount ?? 0,
    // Distinct debates across both sides. Adding the two totals counts a debate
    // twice where it names the same person on both — and counts duplicate writes
    // as separate debates, which is how 10 becomes 13.
    debates: visibleDebateCount(
      [...(data.supported?.nodes ?? []), ...(data.opposed?.nodes ?? [])].flatMap(node =>
        node.fromEntity?.id ? [node.fromEntity.id] : []
      ),
      (data.hidden?.nodes ?? []).map(node => node.toEntityId)
    ),
    spaces: orderSpaces([...byId.values()]),
    verifiedBy,
    joinedAt: data.person?.createdAt ? Number(data.person.createdAt) : null,
  };
}
