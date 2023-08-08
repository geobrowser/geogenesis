import { SYSTEM_IDS } from '@geogenesis/ids';
import { cookies } from 'next/headers';

import * as React from 'react';

import { Subgraph } from '~/core/io';
import { fetchEntityType } from '~/core/io/fetch-entity-type';
import { Params } from '~/core/params';
import { EntityStoreProvider } from '~/core/state/entity-page-store';
import { DEFAULT_PAGE_SIZE } from '~/core/state/triple-store';
import { Entity as IEntity, Triple } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';

import { Spacer } from '~/design-system/spacer';
import { TabGroup } from '~/design-system/tab-group';

import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { EntityPageMetadataHeader, SpacePageMetadataHeader } from '~/partials/entity-page/entity-page-metadata-header';
import { ReferencedByEntity } from '~/partials/entity-page/types';

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

  if (!types.includes(SYSTEM_IDS.PERSON_TYPE)) {
    return <>{children}</>;
  }

  const profile = await getProfilePage(params.entityId, config.subgraph);

  return (
    <EntityStoreProvider
      id={profile.id}
      spaceId={params.id}
      initialTriples={profile.triples}
      initialSchemaTriples={[]}
      initialBlockIdsTriple={profile.blockIdsTriple}
      initialBlockTriples={profile.blockTriples}
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
        <EntityPageMetadataHeader id={profile.id} spaceId={params.id} types={profile.types} />
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

async function getProfilePage(
  entityId: string,
  endpoint: string
): Promise<
  IEntity & {
    avatarUrl: string | null;
    coverUrl: string | null;
    referencedByEntities: ReferencedByEntity[];
    blockTriples: Triple[];
    blockIdsTriple: Triple | null;
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
      blockTriples: [],
      blockIdsTriple: null,
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

  const blockIdsTriple = person?.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS) || null;
  const blockIds: string[] = blockIdsTriple ? JSON.parse(Value.stringValue(blockIdsTriple) || '[]') : [];

  const blockTriples = (
    await Promise.all(
      blockIds.map(blockId => {
        return Subgraph.fetchTriples({
          endpoint,
          query: '',
          skip: 0,
          first: DEFAULT_PAGE_SIZE,
          filter: [{ field: 'entity-id', value: blockId }],
        });
      })
    )
  ).flatMap(triples => triples);

  return {
    ...person,
    avatarUrl: Entity.avatar(person.triples),
    coverUrl: Entity.cover(person.triples),
    referencedByEntities,
    blockTriples,
    blockIdsTriple,
  };
}
