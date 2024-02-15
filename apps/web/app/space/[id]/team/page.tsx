import { AVATAR_ATTRIBUTE, NAME, ROLE_ATTRIBUTE } from '@geogenesis/ids/system-ids';
import { Effect, Either } from 'effect';
import { Environment } from '~/core/environment';

import { Subgraph } from '~/core/io';
import { graphql } from '~/core/io/subgraph/graphql';
import type { Triple as TripleType } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { Triple } from '~/core/utils/triple';
import { Value } from '~/core/utils/value';

import { TeamMembers } from '~/partials/team/team-members';


// We fetch for geoEntities -> name because the id of the wallet entity might not be the
// same as the actual wallet address.
function getFetchProfileQuery(entityId: string) {
  // Have to fetch the profiles as an array as we can't query an individual profile by it's account.
  // account_starts_with_nocase is also a hack since our subgraph does not store the account the same
  // way as the profiles. Profiles are a string but `createdBy` in our subgraph is stored as Bytes.
  return `query {
    geoProfile(id: "${entityId}") {
      id
      homeSpace
      account
    }
  }`;
}

interface OnchainGeoProfile {
  id: string;
  homeSpace: string;
  account: string;
}

interface NetworkResult {
  geoProfile: OnchainGeoProfile | null;
}

async function fetchOnchainProfileByEntityId(entityId: string): Promise<OnchainGeoProfile | null> {
  const config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);

  const fetchWalletsGraphqlEffect = graphql<NetworkResult>({
    endpoint: config.profileSubgraph,
    query: getFetchProfileQuery(entityId),
  });

  const graphqlFetchWithErrorFallbacks = Effect.gen(function*(awaited) {
    const resultOrError = yield* awaited(Effect.either(fetchWalletsGraphqlEffect));

    if (Either.isLeft(resultOrError)) {
      const error = resultOrError.left;

      switch (error._tag) {
        case 'AbortError':
          // Right now we re-throw AbortErrors and let the callers handle it. Eventually we want
          // the caller to consume the error channel as an effect. We throw here the typical JS
          // way so we don't infect more of the codebase with the effect runtime.
          throw error;
        case 'GraphqlRuntimeError':
          console.error(
            `Encountered runtime graphql error in fetchProfile. endpoint: ${config.profileSubgraph
            } entityId: ${entityId}

              queryString: ${getFetchProfileQuery(entityId)}
              `,
            error.message
          );

          return {
            geoProfile: null,
          };
        default:
          console.error(
            `${error._tag}: Unable to fetch wallets to derive profile, endpoint: ${config.profileSubgraph} entityId: ${entityId}`
          );

          return {
            geoProfile: null,
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  return result.geoProfile;
}

type TeamPageProps = {
  params: { id: string; entityId: string };
};

export type TeamMember = {
  entityId: string;
  space: string;
  name: string;
  role: string;
  roleTriple: TripleType;
  avatar: string;
  linked: boolean;
};

export default async function TeamPage({ params }: TeamPageProps) {
  const spaceId = params.id;
  const teamMembers = await getTeamMembers(spaceId);

  return <TeamMembers spaceId={spaceId} teamMembers={teamMembers} />;
}

const getTeamMembers = async (spaceId: string) => {
  const teamMembers: Array<TeamMember> = [];

  const [roleTriples, nameTriples, avatarTriples] = await Promise.all([
    Subgraph.fetchTriples({
      space: spaceId,
      query: '',
      skip: 0,
      first: 1000,
      filter: [{ field: 'attribute-id', value: ROLE_ATTRIBUTE }],
    }),
    Subgraph.fetchTriples({
      space: spaceId,
      query: '',
      skip: 0,
      first: 1000,
      filter: [{ field: 'attribute-id', value: NAME }],
    }),
    Subgraph.fetchTriples({
      space: spaceId,
      query: '',
      skip: 0,
      first: 1000,
      filter: [{ field: 'attribute-id', value: AVATAR_ATTRIBUTE }],
    }),
  ]);

  if (roleTriples.length === 0) {
    return [];
  }

  roleTriples.forEach(triple => {
    if (triple.value.type !== 'entity') return;

    const teamMember = {
      entityId: triple.entityId,
      space: triple.space,
      name: triple.entityName ?? '',
      role: triple.value.name ?? '',
      roleTriple: triple,
      avatar: '',
      linked: false,
    };

    teamMembers.push(teamMember);
  });

  const [entities, profiles] = await Promise.all(
    [
      Promise.all(
        teamMembers.map(teamMember => {
          return Subgraph.fetchEntity({ id: teamMember.entityId });
        })),
      // @TODO: Once we index profiles in the substream this can be put into a single graphql query
      Promise.all(
        teamMembers.map(teamMember => {
          return fetchOnchainProfileByEntityId(teamMember.entityId);
        }))
    ]);

  entities.forEach(entity => {
    if (!entity) return;

    const entityId = entity.id;
    const entitySpaceId = entity.nameTripleSpace;
    const teamMemberIndex = teamMembers.findIndex(teamMember => teamMember.entityId === entityId);

    const isLinked = entitySpaceId && spaceId !== entitySpaceId;

    if (isLinked) {
      teamMembers[teamMemberIndex].space = entitySpaceId;
      teamMembers[teamMemberIndex].linked = true;

      const nameTriple = nameTriples.find(nameTriple => nameTriple.entityId === entityId);

      if (nameTriple) {
        const name = Triple.getValue(nameTriple);

        if (name) {
          teamMembers[teamMemberIndex].name = name;
        }
      } else {
        const name = Entity.name(entity.triples);

        if (name) {
          teamMembers[teamMemberIndex].name = name;
        }
      }

      const avatarTriple = avatarTriples.find(avatarTriple => avatarTriple.entityId === entityId);

      if (avatarTriple) {
        const avatar = Value.imageValue(avatarTriple);

        if (avatar) {
          teamMembers[teamMemberIndex].avatar = avatar;
        }
      } else {
        const avatar = Entity.avatar(entity.triples);

        if (avatar) {
          teamMembers[teamMemberIndex].avatar = avatar;
        }
      }
    } else {
      const name = Entity.name(entity.triples);

      if (name) {
        teamMembers[teamMemberIndex].name = name;
      }

      const avatar = Entity.avatar(entity.triples);

      if (avatar) {
        teamMembers[teamMemberIndex].avatar = avatar;
      }
    }
  });

  return teamMembers;
};
