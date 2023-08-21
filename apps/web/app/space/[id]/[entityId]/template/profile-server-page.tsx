import { cookies } from 'next/headers';

import { Subgraph } from '~/core/io';
import { Params } from '~/core/params';
import { ServerSideEnvParams } from '~/core/types';
import { Entity } from '~/core/utils/entity';

// import { setOnboardingDismissedCookie } from '~/partials/profile/actions';
import { ProfilePageComponent } from './profile-client-page';

export const runtime = 'edge';

interface Props {
  params: { id: string; entityId: string };
  searchParams: ServerSideEnvParams;
}

export async function ProfileServerPage({ params, searchParams }: Props) {
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;
  const config = Params.getConfigFromParams(searchParams, env);

  // @TODO: Disabling cookie interactions for now until we get later on in the social
  // work. This is so we can test onboarding feedback more frequently.
  // const hasDismissedOnboarding = cookies().get(Cookie.HAS_DISMISSED_PERSONAL_SPACE_ONBOARDING_KEY)?.value === 'true';

  const person = await Subgraph.fetchEntity({ id: params.entityId, endpoint: config.subgraph });

  // @TODO: Real error handling
  if (!person) {
    return {
      id: params.entityId,
      name: null,
      avatarUrl: null,
      coverUrl: null,
      triples: [],
      types: [],
      description: null,
    };
  }

  const profile = {
    ...person,
    avatarUrl: Entity.avatar(person.triples),
    coverUrl: Entity.cover(person.triples),
  };

  return <ProfilePageComponent {...profile} spaceId={params.id} hasDismissedOnboarding={false} />;
}
