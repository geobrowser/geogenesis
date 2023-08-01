import { makeStubTriple } from '~/core/io/mocks/mock-network';

import { ProfilePageComponent } from './component';

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
    name: 'John Doe',
    spaceId: params.id,
    referencedByEntities: [],
    triples: [makeStubTriple('John Doe')],
  };
}
