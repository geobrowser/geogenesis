import { cookies } from 'next/headers';

import { Cookie } from '~/core/cookie';

import { setOnboardingDismissedCookie } from '~/partials/profile/actions';

import { ProfilePageComponent } from './component';
import { MOCK_PROFILE } from './mock';

export const runtime = 'edge';

interface Props {
  params: { id: string };
}

export default async function ProfilePage({ params }: Props) {
  const profile = await getProfilePage({ params });
  const hasDismissedOnboarding = cookies().get(Cookie.HAS_DISMISSED_PERSONAL_SPACE_ONBOARDING_KEY)?.value === 'true';

  return (
    <ProfilePageComponent
      {...profile}
      onDismissForever={setOnboardingDismissedCookie}
      hasDismissedOnboarding={hasDismissedOnboarding}
    />
  );
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
