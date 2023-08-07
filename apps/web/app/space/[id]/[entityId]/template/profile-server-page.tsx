import { SYSTEM_IDS } from '@geogenesis/ids';
import { cookies } from 'next/headers';

import { Subgraph } from '~/core/io';
import { Params } from '~/core/params';
import { Entity as IEntity, ServerSideEnvParams } from '~/core/types';
import { Entity } from '~/core/utils/entity';

import { ReferencedByEntity } from '~/partials/entity-page/types';
import { setOnboardingDismissedCookie } from '~/partials/profile/actions';

import { ProfilePageComponent } from './profile-client-page';

export const runtime = 'edge';

interface Props {
  params: { id: string; entityId: string };
  searchParams: ServerSideEnvParams;
}

export async function ProfileServerPage({ params }: Props) {
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;
  const config = Params.getConfigFromParams({}, env);

  const profile = await getProfilePage(params.entityId, config.subgraph);
  // @TODO: Disabling cookie interactions for now until we get later on in the social
  // work. This is so we can test onboarding feedback more frequently.
  // const hasDismissedOnboarding = cookies().get(Cookie.HAS_DISMISSED_PERSONAL_SPACE_ONBOARDING_KEY)?.value === 'true';

  return (
    <ProfilePageComponent
      {...profile}
      spaceId={params.id}
      onDismissForever={setOnboardingDismissedCookie}
      hasDismissedOnboarding={false}
    />
  );
}

async function getProfilePage(
  entityId: string,
  endpoint: string
): Promise<
  IEntity & {
    avatarUrl: string | null;
    coverUrl: string | null;
    referencedByEntities: ReferencedByEntity[];
  }
> {
  const [person, referencesPerson, spaces] = await Promise.all([
    Subgraph.fetchEntity({ id: entityId, endpoint }),
    Subgraph.fetchEntities({
      endpoint,
      query: '',
      filter: [{ field: 'linked-to', value: entityId }],
    }),
    Subgraph.fetchSpaces({ endpoint }),
  ]);

  // @TODO: Real error handling
  if (!person) {
    return {
      id: entityId,
      name: null,
      avatarUrl: null,
      coverUrl: null,
      triples: [],
      types: [],
      description: null,
      referencedByEntities: [],
    };
  }

  const referencedByEntities: ReferencedByEntity[] = referencesPerson.map(e => {
    const spaceId = Entity.nameTriple(e.triples)?.space ?? '';
    const space = spaces.find(s => s.id === spaceId);
    const spaceName = space?.attributes[SYSTEM_IDS.NAME] ?? null;
    const spaceImage = space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? null;

    return {
      id: e.id,
      name: e.name,
      types: e.types,
      space: {
        id: spaceId,
        name: spaceName,
        image: spaceImage,
      },
    };
  });

  return {
    ...person,
    avatarUrl: Entity.avatar(person.triples),
    coverUrl: Entity.cover(person.triples),
    referencedByEntities,
  };
}
