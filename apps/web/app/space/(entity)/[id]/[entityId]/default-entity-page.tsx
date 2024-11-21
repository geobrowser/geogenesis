import { SYSTEM_IDS } from '@geogenesis/sdk';
import { redirect } from 'next/navigation';

import * as React from 'react';

import { Subgraph } from '~/core/io';
import { fetchBlocks } from '~/core/io/fetch-blocks';
import { EntityId } from '~/core/io/schema';
import { EditorProvider } from '~/core/state/editor/editor-provider';
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

interface Props {
  params: { id: string; entityId: string };
  showCover?: boolean;
  showHeading?: boolean;
  showHeader?: boolean;
  notice?: React.ReactNode;
}

export default async function DefaultEntityPage({
  params,
  showCover = true,
  showHeading = true,
  showHeader = true,
  notice = null,
}: Props) {
  const showSpacer = showCover || showHeading || showHeader;

  const props = await getData(params.id, params.entityId);

  const avatarUrl = Entities.avatar(props.relationsOut) ?? props.serverAvatarUrl;
  const coverUrl = Entities.cover(props.relationsOut) ?? props.serverCoverUrl;

  return (
    <EntityStoreProvider
      id={props.id}
      spaceId={props.spaceId}
      initialSpaces={props.spaces}
      initialTriples={props.triples}
      initialRelations={props.relationsOut}
    >
      <EditorProvider
        id={props.id}
        spaceId={props.spaceId}
        initialBlocks={props.blocks}
        initialBlockRelations={props.blockRelations}
      >
        <MoveEntityProvider>
          {showCover && <EntityPageCover avatarUrl={avatarUrl} coverUrl={coverUrl} />}
          <EntityPageContentContainer>
            {showHeading && <EditableHeading spaceId={props.spaceId} entityId={props.id} />}
            {showHeader && <EntityPageMetadataHeader id={props.id} spaceId={props.spaceId} />}
            {notice}
            {(showSpacer || !!notice) && <Spacer height={40} />}
            <Editor spaceId={props.spaceId} shouldHandleOwnSpacing />
            <ToggleEntityPage {...props} />
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
  const entity = await Subgraph.fetchEntity({ spaceId, id: entityId });
  const nameTripleSpace = entity?.nameTripleSpaces?.[0];
  const spaces = entity?.spaces ?? [];

  // Redirect from space configuration page to space page
  if (entity?.types.some(type => type.id === SYSTEM_IDS.SPACE_CONFIGURATION) && nameTripleSpace) {
    // But don't redirect for space configuration templates in the root space

    if (spaceId !== SYSTEM_IDS.ROOT_SPACE || entityId === SYSTEM_IDS.ROOT_SPACE_CONFIGURATION) {
      // Uncomment to navigate to space configuration templates in local development
      // if (process.env.NODE_ENV === 'development') return;

      console.log(`Redirecting from space configuration entity ${entity.id} to space page ${nameTripleSpace}`);
      return redirect(NavUtils.toSpace(nameTripleSpace));
    }
  }

  // @HACK: Entities we are rendering might be in a different space. Right now we aren't fetching
  // the space for the entity we are rendering, so we need to redirect to the correct space.
  if (nameTripleSpace) {
    const spaceIdInNameTripleSpaces = entity.nameTripleSpaces.includes(spaceId);

    if (spaceIdInNameTripleSpaces) {
      console.log(
        `Redirecting from incorrect space ${spaceId} to correct space ${nameTripleSpace} for entity ${entityId}`
      );
      return redirect(NavUtils.toEntity(nameTripleSpace, entityId));
    }
  }

  const serverAvatarUrl = Entities.avatar(entity?.relationsOut);
  const serverCoverUrl = Entities.cover(entity?.relationsOut);

  const blockIds = entity?.relationsOut
    .filter(r => r.typeOf.id === EntityId(SYSTEM_IDS.BLOCKS))
    ?.map(r => r.toEntity.id);

  const blocks = blockIds ? await fetchBlocks(blockIds) : [];

  return {
    triples: entity?.triples ?? [],
    id: entityId,
    name: entity?.name ?? null,
    description: Entities.description(entity?.triples ?? []),
    spaceId,
    spaces,
    serverAvatarUrl,
    serverCoverUrl,
    relationsOut: entity?.relationsOut ?? [],
    types: entity?.types ?? [],

    // For entity page editor
    blockRelations: entity?.relationsOut ?? [],
    blocks,
  };
};
