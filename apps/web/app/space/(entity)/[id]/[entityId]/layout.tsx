import { SYSTEM_IDS } from '@geogenesis/ids';

import * as React from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Subgraph } from '~/core/io';
import { fetchEntityType } from '~/core/io/fetch-entity-type';
import { EditorProvider } from '~/core/state/editor-store';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { TypesStoreServerContainer } from '~/core/state/types-store/types-store-server-container';
import { Entity as IEntity, Triple } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';

import { Spacer } from '~/design-system/spacer';
import { TabGroup } from '~/design-system/tab-group';

import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { EntityPageMetadataHeader } from '~/partials/entity-page/entity-page-metadata-header';
import { ReferencedByEntity } from '~/partials/entity-page/types';

import { SpaceConfigProvider } from '~/app/space/[id]/space-config-provider';

const PERSON_TABS = ['Overview', 'Activity'] as const;
const COMPANY_TABS = ['Overview', 'Team', 'Activity'] as const;
const NONPROFIT_TABS = ['Overview', 'Activity'] as const;

interface Props {
  params: { id: string; entityId: string };
  children: React.ReactNode;
}

export default async function ProfileLayout({ children, params }: Props) {
  const decodedId = decodeURIComponent(params.entityId);

  const types = await fetchEntityType({
    id: decodedId,
  });

  // Person profile
  if (types.includes(SYSTEM_IDS.PERSON_TYPE)) {
    const profile = await getProfilePage(decodedId);

    return (
      <SpaceConfigProvider spaceId={params.id}>
        <TypesStoreServerContainer spaceId={params.id}>
          <EntityStoreProvider id={decodedId} spaceId={params.id} initialTriples={profile.triples}>
            <EditorProvider
              id={profile.id}
              spaceId={params.id}
              initialBlockIdsTriple={profile.blockIdsTriple}
              initialBlockTriples={profile.blockTriples}
            >
              <EntityPageCover avatarUrl={profile.avatarUrl} coverUrl={profile.coverUrl} />
              <EntityPageContentContainer>
                <EditableHeading
                  spaceId={params.id}
                  entityId={decodedId}
                  name={profile.name ?? decodedId}
                  triples={profile.triples}
                />
                <EntityPageMetadataHeader id={profile.id} spaceId={params.id} types={profile.types} />
                <Spacer height={40} />
                <TabGroup
                  tabs={PERSON_TABS.map(label => {
                    const href =
                      label === 'Overview'
                        ? decodeURIComponent(`${NavUtils.toEntity(params.id, decodedId)}`)
                        : decodeURIComponent(`${NavUtils.toEntity(params.id, decodedId)}/${label.toLowerCase()}`);

                    return {
                      href,
                      label,
                    };
                  })}
                />
                <Spacer height={20} />
                {children}
              </EntityPageContentContainer>
            </EditorProvider>
          </EntityStoreProvider>
        </TypesStoreServerContainer>
      </SpaceConfigProvider>
    );
  }

  // Company profile
  if (types.includes(SYSTEM_IDS.COMPANY_TYPE)) {
    const profile = await getProfilePage(decodedId);

    // @TODO get team members count
    const teamMembers = 2;

    return (
      <SpaceConfigProvider spaceId={params.id}>
        <TypesStoreServerContainer spaceId={params.id}>
          <EntityStoreProvider id={decodedId} spaceId={params.id} initialTriples={profile.triples}>
            <EditorProvider
              id={profile.id}
              spaceId={params.id}
              initialBlockIdsTriple={profile.blockIdsTriple}
              initialBlockTriples={profile.blockTriples}
            >
              <EntityPageCover avatarUrl={profile.avatarUrl} coverUrl={profile.coverUrl} />
              <EntityPageContentContainer>
                <EditableHeading
                  spaceId={params.id}
                  entityId={decodedId}
                  name={profile.name ?? decodedId}
                  triples={profile.triples}
                />
                <EntityPageMetadataHeader id={profile.id} spaceId={params.id} types={profile.types} />
                <Spacer height={40} />
                <TabGroup
                  tabs={COMPANY_TABS.map(label => {
                    const href =
                      label === 'Overview'
                        ? decodeURIComponent(`${NavUtils.toEntity(params.id, decodedId)}`)
                        : decodeURIComponent(`${NavUtils.toEntity(params.id, decodedId)}/${label.toLowerCase()}`);

                    const badge = label === 'Team' ? teamMembers.toString(10) : undefined;

                    return {
                      href,
                      label,
                      badge,
                    };
                  })}
                />
                <Spacer height={20} />
                {children}
              </EntityPageContentContainer>
            </EditorProvider>
          </EntityStoreProvider>
        </TypesStoreServerContainer>
      </SpaceConfigProvider>
    );
  }

  // Nonprofit profile
  if (types.includes(SYSTEM_IDS.NONPROFIT_TYPE)) {
    const profile = await getProfilePage(decodedId);

    return (
      <SpaceConfigProvider spaceId={params.id}>
        <TypesStoreServerContainer spaceId={params.id}>
          <EntityStoreProvider id={decodedId} spaceId={params.id} initialTriples={profile.triples}>
            <EditorProvider
              id={profile.id}
              spaceId={params.id}
              initialBlockIdsTriple={profile.blockIdsTriple}
              initialBlockTriples={profile.blockTriples}
            >
              <EntityPageCover avatarUrl={profile.avatarUrl} coverUrl={profile.coverUrl} />
              <EntityPageContentContainer>
                <EditableHeading
                  spaceId={params.id}
                  entityId={decodedId}
                  name={profile.name ?? decodedId}
                  triples={profile.triples}
                />
                <EntityPageMetadataHeader id={profile.id} spaceId={params.id} types={profile.types} />
                <Spacer height={40} />
                <TabGroup
                  tabs={NONPROFIT_TABS.map(label => {
                    const href =
                      label === 'Overview'
                        ? decodeURIComponent(`${NavUtils.toEntity(params.id, decodedId)}`)
                        : decodeURIComponent(`${NavUtils.toEntity(params.id, decodedId)}/${label.toLowerCase()}`);

                    return {
                      href,
                      label,
                    };
                  })}
                />
                <Spacer height={20} />
                {children}
              </EntityPageContentContainer>
            </EditorProvider>
          </EntityStoreProvider>
        </TypesStoreServerContainer>
      </SpaceConfigProvider>
    );
  }

  return (
    <SpaceConfigProvider spaceId={params.id}>
      <TypesStoreServerContainer spaceId={params.id}>{children}</TypesStoreServerContainer>
    </SpaceConfigProvider>
  );
}

async function getProfilePage(entityId: string): Promise<
  IEntity & {
    avatarUrl: string | null;
    coverUrl: string | null;
    referencedByEntities: ReferencedByEntity[];
    blockTriples: Triple[];
    blockIdsTriple: Triple | null;
  }
> {
  const [person, referencesPerson, spaces] = await Promise.all([
    Subgraph.fetchEntity({ id: entityId }),
    Subgraph.fetchEntities({
      query: '',
      filter: [{ field: 'linked-to', value: entityId }],
    }),
    Subgraph.fetchSpaces(),
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
    const configEntity = space?.spaceConfig;
    const spaceName = space?.spaceConfig?.name ? space.spaceConfig?.name : space?.id ?? '';
    const spaceImage = configEntity ? Entity.cover(configEntity.triples) : PLACEHOLDER_SPACE_IMAGE;

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
        return Subgraph.fetchEntity({ id: blockId });
      })
    )
  ).flatMap(entity => entity?.triples ?? []);

  return {
    ...person,
    avatarUrl: Entity.avatar(person.triples),
    coverUrl: Entity.cover(person.triples),
    referencedByEntities,
    blockTriples,
    blockIdsTriple,
  };
}
