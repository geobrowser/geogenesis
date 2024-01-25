import { AVATAR_ATTRIBUTE, ROLE_ATTRIBUTE } from '@geogenesis/ids/system-ids';

import { Subgraph } from '~/core/io';
import { Entity } from '~/core/utils/entity';
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
  avatar: string;
  linked: boolean;
};

export default async function TeamPage({ params }: TeamPageProps) {
  const spaceId = params.id;

  const teamMembers: Array<TeamMember> = [];

  const [roleTriples, avatarTriples] = await Promise.all([
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
      filter: [{ field: 'attribute-id', value: AVATAR_ATTRIBUTE }],
    }),
  ]);

  if (!roleTriples) {
    return [];
  }

  roleTriples.forEach(triple => {
    if (triple.value.type !== 'entity') return;

    const teamMember = {
      entityId: triple.entityId,
      space: triple.space,
      name: triple.entityName ?? '',
      role: triple.value.name ?? '',
      avatar: '',
      linked: false,
    };

    teamMembers.push(teamMember);
  });

  const entities = await Promise.all(
    teamMembers.map(teamMember => {
      return Subgraph.fetchEntity({ id: teamMember.entityId });
    })
  );

  entities.forEach(entity => {
    if (!entity) return;

    const entityId = entity.id;
    const entitySpaceId = entity.nameTripleSpace;
    const teamMemberIndex = teamMembers.findIndex(teamMember => teamMember.entityId === entityId);

    const isLinked = entitySpaceId && spaceId !== entitySpaceId;

    if (isLinked) {
      teamMembers[teamMemberIndex].space = entitySpaceId;
      teamMembers[teamMemberIndex].linked = true;

      const avatarTriple = avatarTriples.find(avatarTriple => avatarTriple.entityId === entityId);

      if (avatarTriple) {
        const avatar = Value.imageValue(avatarTriple);
        teamMembers[teamMemberIndex].avatar = avatar ?? '';
      } else {
        const avatar = Entity.avatar(entity.triples);
        teamMembers[teamMemberIndex].avatar = avatar ?? '';
      }
    } else {
      const avatar = Entity.avatar(entity.triples);
      teamMembers[teamMemberIndex].avatar = avatar ?? '';
    }
  });

  return <TeamMembers spaceId={spaceId} teamMembers={teamMembers} />;
}
