import { SYSTEM_IDS } from '@geogenesis/sdk';
import { redirect } from 'next/navigation';

import { Suspense } from 'react';

import { Subgraph } from '~/core/io';
import { EditorProvider } from '~/core/state/editor-store';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { MoveEntityProvider } from '~/core/state/move-entity-store';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

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

import { cachedFetchEntity } from './cached-fetch-entity';

interface Props {
  params: { id: string; entityId: string };
  searchParams: {
    typeId?: string;
    filters?: string;
  };
  showCover?: boolean;
  showHeading?: boolean;
  showHeader?: boolean;
}

const EMPTY_ARRAY_AS_ENCODED_URI = '%5B%5D';

export default async function DefaultEntityPage({
  params,
  searchParams,
  showCover = true,
  showHeading = true,
  showHeader = true,
}: Props) {
  const showSpacer = showCover || showHeading || showHeader;

  const decodedId = decodeURIComponent(params.entityId);
  const props = await getData(params.id, decodedId);

  const avatarUrl = Entity.avatar(props.triples) ?? props.serverAvatarUrl;
  const coverUrl = Entity.cover(props.triples) ?? props.serverCoverUrl;
  const types = Entity.types(props.triples);

  const typeId = searchParams.typeId ?? null;

  const encodedFilters = searchParams.filters ?? EMPTY_ARRAY_AS_ENCODED_URI;
  const filters = JSON.parse(decodeURI(encodedFilters));

  return (
    <EntityStoreProvider id={props.id} spaceId={props.spaceId} initialTriples={props.triples}>
      <EditorProvider
        id={props.id}
        spaceId={props.spaceId}
        initialBlockIdsTriple={props.blockIdsTriple}
        initialBlockTriples={props.blockTriples}
        initialBlockCollectionItems={props.blockCollectionItems}
        initialBlockCollectionItemTriples={props.blockCollectionItemTriples}
      >
        <MoveEntityProvider>
          {showCover && <EntityPageCover avatarUrl={avatarUrl} coverUrl={coverUrl} />}
          <EntityPageContentContainer>
            {showHeading && (
              <EditableHeading spaceId={props.spaceId} entityId={props.id} name={props.name} triples={props.triples} />
            )}
            {showHeader && <EntityPageMetadataHeader id={props.id} spaceId={props.spaceId} types={types} />}
            {showSpacer && <Spacer height={40} />}
            <Editor shouldHandleOwnSpacing />
            <ToggleEntityPage {...props} typeId={typeId} filters={filters} />
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

const getData = async (spaceId: string, entityId: string) => {
  const entity = await Subgraph.fetchEntity({ id: entityId });
  const nameTripleSpace = entity?.nameTripleSpaces?.[0];

  // Redirect from space configuration page to space page
  if (entity?.types.some(type => type.id === SYSTEM_IDS.SPACE_CONFIGURATION) && nameTripleSpace) {
    console.log(`Redirecting from space configuration entity ${entity.id} to space page ${nameTripleSpace}`);
    return redirect(NavUtils.toSpace(nameTripleSpace));
  }

  // @HACK: Entities we are rendering might be in a different space. Right now we aren't fetching
  // the space for the entity we are rendering, so we need to redirect to the correct space.
  if (nameTripleSpace) {
    if (spaceId !== nameTripleSpace) {
      console.log(
        `Redirecting from incorrect space ${spaceId} to correct space ${nameTripleSpace} for entity ${entityId}`
      );
      return redirect(NavUtils.toEntity(nameTripleSpace, entityId));
    }
  }

  const serverAvatarUrl = Entity.avatar(entity?.triples);
  const serverCoverUrl = Entity.cover(entity?.triples);

  const blockIdsTriple =
    entity?.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS && t.value.type === 'COLLECTION') || null;

  const blockCollectionItems =
    blockIdsTriple && blockIdsTriple.value.type === 'COLLECTION' ? blockIdsTriple.value.items : [];

  const blockIds: string[] = blockCollectionItems.map(item => item.entity.id);

  const [blockTriples, collectionItemTriples] = await Promise.all([
    Promise.all(
      blockIds.map(blockId => {
        return cachedFetchEntity(blockId);
      })
    ),
    Promise.all(
      blockCollectionItems.map(item => {
        return cachedFetchEntity(item.id);
      })
    ),
  ]);

  return {
    triples: entity?.triples ?? [],
    id: entityId,
    name: entity?.name ?? null,
    description: Entity.description(entity?.triples ?? []),
    spaceId,
    serverAvatarUrl,
    serverCoverUrl,

    // For entity page editor
    blockIdsTriple,
    blockTriples: blockTriples.flatMap(entity => entity?.triples ?? []),
    blockCollectionItems,
    blockCollectionItemTriples: collectionItemTriples.flatMap(entity => entity?.triples ?? []),
  };
};
