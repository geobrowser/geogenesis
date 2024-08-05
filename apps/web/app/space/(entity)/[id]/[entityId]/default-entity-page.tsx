import { SYSTEM_IDS } from '@geogenesis/sdk';
import { redirect } from 'next/navigation';

import * as React from 'react';

import { Subgraph } from '~/core/io';
import { EditorProvider } from '~/core/state/editor-store';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { MoveEntityProvider } from '~/core/state/move-entity-store';
import { Entities } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { Spacer } from '~/design-system/spacer';

import { Editor } from '~/partials/editor/editor';
import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { EntityPageMetadataHeader } from '~/partials/entity-page/entity-page-metadata-header';
import { EntityReferencedByServerContainer } from '~/partials/entity-page/entity-page-referenced-by-server-container';
import { ToggleEntityPage } from '~/partials/entity-page/toggle-entity-page';
import { MoveEntityReview } from '~/partials/move-entity/move-entity-review';

import { cachedFetchEntity } from './cached-fetch-entity';

interface Props {
  params: { id: string; entityId: string };
  searchParams: {
    typeId?: string;
    attributes?: string;
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

  const props = await getData(params.id, params.entityId);

  const avatarUrl = Entities.avatar(props.triples) ?? props.serverAvatarUrl;
  const coverUrl = Entities.cover(props.triples) ?? props.serverCoverUrl;
  const types = props.types;

  const typeId = searchParams.typeId ?? null;

  const encodedAttributes = searchParams.attributes ?? EMPTY_ARRAY_AS_ENCODED_URI;
  const attributes = JSON.parse(decodeURI(encodedAttributes));

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
            <Editor spaceId={props.spaceId} shouldHandleOwnSpacing />
            <ToggleEntityPage {...props} typeId={typeId} attributes={attributes} />
            <Spacer height={40} />
            {/*
              Some SEO parsers fail to parse meta tags if there's no fallback in a suspense boundary. We don't want to
              show any referenced by loading states but do want to stream it in
            */}
            <React.Suspense fallback={<div />}>
              <EntityReferencedByServerContainer entityId={props.id} name={props.name} spaceId={params.id} />
            </React.Suspense>
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
    // But don't redirect for space configuration templates in the root space
    if (spaceId !== SYSTEM_IDS.ROOT_SPACE || entityId === SYSTEM_IDS.ROOT_SPACE_CONFIGURATION) {
      console.log(`Redirecting from space configuration entity ${entity.id} to space page ${nameTripleSpace}`);
      return redirect(NavUtils.toSpace(nameTripleSpace));
    }
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

  const serverAvatarUrl = Entities.avatar(entity?.triples);
  const serverCoverUrl = Entities.cover(entity?.triples);

  const blockRelations = entity?.relationsOut.filter(r => r.typeOf.id === SYSTEM_IDS.BLOCKS);

  // @TODO: What is this supposed to be type wise?
  const blockCollectionItems: { id: string; entity: { id: string } }[] = [];

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
    description: Entities.description(entity?.triples ?? []),
    spaceId,
    serverAvatarUrl,
    serverCoverUrl,
    relationsOut: entity?.relationsOut ?? [],
    types: entity?.types ?? [],

    // For entity page editor
    blockIdsTriple: null,
    blockTriples: blockTriples.flatMap(entity => entity?.triples ?? []),
    blockCollectionItems: [],
    // blockCollectionItemTriples: collectionItemTriples.flatMap(entity => entity?.triples ?? []),
    blockCollectionItemTriples: [],
  };
};
