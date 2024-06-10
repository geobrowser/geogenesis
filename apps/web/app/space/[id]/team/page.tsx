import { SYSTEM_IDS } from '@geogenesis/sdk';

import { Subgraph } from '~/core/io';
import { fetchOnchainProfileByEntityId } from '~/core/io/fetch-onchain-profile-by-entity-id';
import type { Triple as TripleType } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { Triples } from '~/core/utils/triples';
import { Value } from '~/core/utils/value';

import { TeamMembers } from '~/partials/team/team-members';

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
      filter: [{ field: 'attribute-id', value: SYSTEM_IDS.ROLE_ATTRIBUTE }],
    }),
    Subgraph.fetchTriples({
      space: spaceId,
      query: '',
      skip: 0,
      first: 1000,
      filter: [{ field: 'attribute-id', value: SYSTEM_IDS.NAME }],
    }),
    Subgraph.fetchTriples({
      space: spaceId,
      query: '',
      skip: 0,
      first: 1000,
      filter: [{ field: 'attribute-id', value: SYSTEM_IDS.AVATAR_ATTRIBUTE }],
    }),
  ]);

  if (roleTriples.length === 0) {
    return [];
  }

  roleTriples.forEach(triple => {
    if (triple.value.type !== 'ENTITY') return;

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

  const [entities, profiles] = await Promise.all([
    Promise.all(
      teamMembers.map(teamMember => {
        return Subgraph.fetchEntity({ id: teamMember.entityId });
      })
    ),
    // @TODO: Once we index profiles in the substream this can be put into a single graphql query
    Promise.all(
      teamMembers.map(teamMember => {
        return fetchOnchainProfileByEntityId(teamMember.entityId);
      })
    ),
  ]);

  entities.forEach(entity => {
    if (!entity) return;

    const entityId = entity.id;
    const teamMemberIndex = teamMembers.findIndex(teamMember => teamMember.entityId === entityId);

    const profile = profiles.find(profile => profile && profile.id === entityId);
    const profileSpaceId = profile?.homeSpaceId;

    const isLinked = !!profileSpaceId && spaceId !== profileSpaceId;

    if (isLinked) {
      teamMembers[teamMemberIndex].space = profileSpaceId;
      teamMembers[teamMemberIndex].linked = true;

      const nameTriple = nameTriples.find(nameTriple => nameTriple.entityId === entityId);

      if (nameTriple) {
        const name = Triples.getValue(nameTriple);

        if (name) {
          teamMembers[teamMemberIndex].name = name;
        }
      } else {
        const name = Entities.name(entity.triples);

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
        const avatar = Entities.avatar(entity.triples);

        if (avatar) {
          teamMembers[teamMemberIndex].avatar = avatar;
        }
      }
    } else {
      const name = Entities.name(entity.triples);

      if (name) {
        teamMembers[teamMemberIndex].name = name;
      }

      const avatar = Entities.avatar(entity.triples);

      if (avatar) {
        teamMembers[teamMemberIndex].avatar = avatar;
      }
    }
  });

  return teamMembers;
};
