import { TeamMembers } from '~/partials/team/team-members';

type TeamPageProps = {
  params: { id: string; entityId: string };
};

export default async function TeamPage({ params }: TeamPageProps) {
  // @TODO get team members
  const teamMembers = [1, 2];

  return <TeamMembers spaceId={params.id} teamMembers={teamMembers} />;
}
