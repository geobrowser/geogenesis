import { SYSTEM_IDS } from '@geogenesis/ids';
import { cookies } from 'next/headers';

import * as React from 'react';

import { Subgraph } from '~/core/io';
import { fetchEntityType } from '~/core/io/fetch-entity-type';
import { Params } from '~/core/params';
import { EntityStoreProvider } from '~/core/state/entity-page-store';
import { Entity as IEntity } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { Spacer } from '~/design-system/spacer';
import { TabGroup } from '~/design-system/tab-group';

import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { SpacePageMetadataHeader } from '~/partials/entity-page/entity-page-metadata-header';

export const runtime = 'edge';

const TABS = ['Overview', 'Work', 'Education', 'Activity'] as const;

interface Props {
  params: { id: string; entityId: string };
  children: React.ReactNode;
}

export default async function ProfileLayout({ children, params }: Props) {
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;

  // Layouts do not receive search params (hmm)
  const config = Params.getConfigFromParams({}, env);

  const types = await fetchEntityType({
    endpoint: config.subgraph,
    id: params.entityId,
  });

  if (types.includes(SYSTEM_IDS.PERSON_TYPE)) {
    const profile = await fetchProfile(params.entityId, config.subgraph);

    return (
      <EntityStoreProvider
        id={profile.id}
        spaceId={params.id}
        initialTriples={[]}
        initialSchemaTriples={[]}
        initialBlockIdsTriple={null}
        initialBlockTriples={[]}
      >
        <EntityPageCover avatarUrl={profile.avatarUrl} coverUrl={profile.coverUrl} />
        <EntityPageContentContainer>
          <EditableHeading
            spaceId={params.id}
            entityId={profile.id}
            name={profile.name ?? profile.id}
            triples={profile.triples}
            showAccessControl
          />
          <SpacePageMetadataHeader spaceId={params.id} />
          <Spacer height={40} />
          <TabGroup
            tabs={TABS.map(label => {
              const href =
                label === 'Overview'
                  ? // @TODO: These links should be updated when we integrate templates in production for everyone
                    `${NavUtils.toEntity(params.id, params.entityId)}/template`
                  : `${NavUtils.toEntity(params.id, params.entityId)}/template/${label.toLowerCase()}`;
              return {
                href,
                label,
              };
            })}
          />
          <Spacer height={20} />
          {children}
        </EntityPageContentContainer>
      </EntityStoreProvider>
    );
  }

  return <div>{children}</div>;
}

async function fetchProfile(
  entityId: string,
  endpoint: string
): Promise<
  IEntity & {
    avatarUrl: string | null;
    coverUrl: string | null;
  }
> {
  const person = await Subgraph.fetchEntity({ id: entityId, endpoint });

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
    };
  }

  return {
    ...person,
    avatarUrl: Entity.avatar(person.triples),
    coverUrl: Entity.cover(person.triples),
  };
}
