import { SYSTEM_IDS } from '@geogenesis/ids';
import { redirect } from 'next/navigation';

import { Suspense } from 'react';

import { AppConfig, Environment } from '~/core/environment';
import { API, Subgraph } from '~/core/io';
import { EditorProvider } from '~/core/state/editor-store';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { MoveEntityProvider } from '~/core/state/move-entity-store';
import { DEFAULT_PAGE_SIZE } from '~/core/state/triple-store/constants';
import { Entity } from '~/core/utils/entity';
import { Value } from '~/core/utils/value';

import { Spacer } from '~/design-system/spacer';

import { Editor } from '~/partials/editor/editor';
import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { EntityPageMetadataHeader } from '~/partials/entity-page/entity-page-metadata-header';
import {
  EntityReferencedByLoading,
  EntityReferencedByServerContainer,
} from '~/partials/entity-page/entity-page-referenced-by-server-container';
import { ToggleEntityPage } from '~/partials/entity-page/toggle-entity-page';
import { MoveEntityReview } from '~/partials/move-entity/move-entity-review';

interface Props {
  params: { id: string; entityId: string };
  searchParams: {
    typeId?: string;
    filterId?: string;
    filterValue?: string;
  };
}

export default async function DefaultEntityPage({ params, searchParams }: Props) {
  const config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);

  const props = await getData(params.id, params.entityId, config);

  const avatarUrl = Entity.avatar(props.triples) ?? props.serverAvatarUrl;
  const coverUrl = Entity.cover(props.triples) ?? props.serverCoverUrl;
  const types = Entity.types(props.triples);

  const filterId = searchParams.filterId ?? null;
  const filterValue = searchParams.filterValue ?? null;
  const typeId = searchParams.typeId ?? null;

  return (
    <EntityStoreProvider id={props.id} spaceId={props.spaceId} initialTriples={props.triples}>
      <EditorProvider
        id={props.id}
        spaceId={props.spaceId}
        initialBlockIdsTriple={props.blockIdsTriple}
        initialBlockTriples={props.blockTriples}
      >
        <MoveEntityProvider>
          <EntityPageCover avatarUrl={avatarUrl} coverUrl={coverUrl} />
          <EntityPageContentContainer>
            <EditableHeading spaceId={props.spaceId} entityId={props.id} name={props.name} triples={props.triples} />
            <EntityPageMetadataHeader id={props.id} spaceId={props.spaceId} types={types} />
            <Spacer height={40} />
            <Editor shouldHandleOwnSpacing />

            <ToggleEntityPage {...props} filterId={filterId} filterValue={filterValue} typeId={typeId} />
            <Spacer height={40} />
            <Suspense fallback={<EntityReferencedByLoading />}>
              <EntityReferencedByServerContainer entityId={props.id} name={props.name} spaceId={params.id} />
            </Suspense>
          </EntityPageContentContainer>
          <MoveEntityReview />
        </MoveEntityProvider>
      </EditorProvider>
    </EntityStoreProvider>
  );
}

const getData = async (spaceId: string, entityId: string, config: AppConfig) => {
  const { isPermissionlessSpace, space } = await API.space(spaceId);

  if (isPermissionlessSpace) {
    config = {
      ...config,
      subgraph: config.permissionlessSubgraph,
    };
  }

  const entity = await Subgraph.fetchEntity({ endpoint: config.subgraph, id: entityId });

  // Redirect from space configuration page to space page
  if (entity?.types.some(type => type.id === SYSTEM_IDS.SPACE_CONFIGURATION) && entity?.nameTripleSpace) {
    console.log(`Redirecting from space configuration entity ${entity.id} to space page ${entity?.nameTripleSpace}`);
    return redirect(`/space/${entity?.nameTripleSpace}`);
  }

  // @HACK: Entities we are rendering might be in a different space. Right now we aren't fetching
  // the space for the entity we are rendering, so we need to redirect to the correct space.
  if (entity?.nameTripleSpace) {
    if (spaceId !== entity?.nameTripleSpace) {
      console.log(
        `Redirecting from incorrect space ${spaceId} to correct space ${entity?.nameTripleSpace} for entity ${entityId}`
      );
      return redirect(`/space/${entity?.nameTripleSpace}/${entityId}`);
    }
  }

  const serverAvatarUrl = Entity.avatar(entity?.triples);
  const serverCoverUrl = Entity.cover(entity?.triples);

  const blockIdsTriple = entity?.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS) || null;
  const blockIds: string[] = blockIdsTriple ? JSON.parse(Value.stringValue(blockIdsTriple) || '[]') : [];

  const blockTriples = (
    await Promise.all(
      blockIds.map(blockId => {
        return Subgraph.fetchTriples({
          endpoint: config.subgraph,
          query: '',
          skip: 0,
          first: DEFAULT_PAGE_SIZE,
          filter: [{ field: 'entity-id', value: blockId }],
        });
      })
    )
  ).flatMap(triples => triples);

  return {
    triples: entity?.triples ?? [],
    id: entityId,
    name: entity?.name ?? null,
    description: Entity.description(entity?.triples ?? []),
    spaceId,
    space,
    serverAvatarUrl,
    serverCoverUrl,

    // For entity page editor
    blockIdsTriple,
    blockTriples,
  };
};
