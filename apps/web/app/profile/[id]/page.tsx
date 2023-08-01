import { ProfilePageComponent } from './component';
import { MOCK_PROFILE } from './mock';

export const runtime = 'edge';

interface Props {
  params: { id: string };
}

export default async function ProfilePage({ params }: Props) {
  const profile = await getProfilePage({ params });

  return <ProfilePageComponent {...profile} />;
}

async function getProfilePage({ params }: Props) {
  return {
    id: params.id,
    name: MOCK_PROFILE.name,
    spaceId: params.id,
    referencedByEntities: [],
    triples: MOCK_PROFILE.triples,
  };
}
