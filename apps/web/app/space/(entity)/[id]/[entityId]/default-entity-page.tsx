import { SystemIds } from '@graphprotocol/grc-20';
import { redirect } from 'next/navigation';
import { ErrorBoundary } from 'react-error-boundary';

import * as React from 'react';

import { Subgraph } from '~/core/io';
import { fetchBlocks } from '~/core/io/fetch-blocks';
import { EntityId } from '~/core/io/schema';
import { EditorProvider } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { Entities } from '~/core/utils/entity';
import { Spaces } from '~/core/utils/space';
import { NavUtils } from '~/core/utils/utils';

import { EmptyErrorComponent } from '~/design-system/empty-error-component';
import { Spacer } from '~/design-system/spacer';

import { Editor } from '~/partials/editor/editor';
import { AutomaticModeToggle } from '~/partials/entity-page/automatic-mode-toggle';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { EntityPageHeading } from '~/partials/entity-page/entity-page-heading';
import { EntityPageMetadataHeader } from '~/partials/entity-page/entity-page-metadata-header';
import { EntityReferencedByServerContainer } from '~/partials/entity-page/entity-page-referenced-by-server-container';
import { ToggleEntityPage } from '~/partials/entity-page/toggle-entity-page';

interface Props {
  params: { id: string; entityId: string };
  searchParams?: { [key: string]: string | string[] | undefined };
  showCover?: boolean;
  showHeading?: boolean;
  showHeader?: boolean;
  notice?: React.ReactNode;
}

export default async function DefaultEntityPage({
  params,
  searchParams = {},
  showCover = true,
  showHeading = true,
  showHeader = true,
  notice = null,
}: Props) {
  const showSpacer = showCover || showHeading || showHeader;

  const props = await getData(params.id, params.entityId, searchParams?.edit === 'true' ? true : false);

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
        {showCover && <EntityPageCover avatarUrl={avatarUrl} coverUrl={coverUrl} />}
        <EntityPageContentContainer>
          {showHeading && <EntityPageHeading spaceId={props.spaceId} entityId={props.id} />}
          {showHeader && (
            <EntityPageMetadataHeader id={props.id} entityName={props.name ?? ''} spaceId={props.spaceId} />
          )}
          {notice}
          {(showSpacer || !!notice) && <Spacer height={40} />}
          <Editor spaceId={props.spaceId} shouldHandleOwnSpacing />
          <ToggleEntityPage {...props} />
          <AutomaticModeToggle />
          <Spacer height={40} />
          <ErrorBoundary fallback={<EmptyErrorComponent />}>
            {/*
              Some SEO parsers fail to parse meta tags if there's no fallback in a suspense boundary. We don't want to
              show any referenced by loading states but do want to stream it in
            */}
            <React.Suspense fallback={<div />}>
              <EntityReferencedByServerContainer entityId={props.id} name={props.name} spaceId={params.id} />
            </React.Suspense>
          </ErrorBoundary>
        </EntityPageContentContainer>
      </EditorProvider>
    </EntityStoreProvider>
  );
}

const getData = async (spaceId: string, entityId: string, preventRedirect?: boolean) => {
  const entity = await Subgraph.fetchEntity({ spaceId, id: entityId });
  const nameTripleSpace = entity?.nameTripleSpaces?.[0];
  const spaces = entity?.spaces ?? [];

  // Redirect from space configuration page to space page
  if (entity?.types.some(type => type.id === EntityId(SystemIds.SPACE_TYPE)) && nameTripleSpace) {
    console.log(`Redirecting from space configuration entity ${entity.id} to space page ${spaceId}`);

    return redirect(NavUtils.toSpace(spaceId));
  }

  // Redirect from an invalid space to a valid one
  if (entity && !spaces.includes(spaceId) && !preventRedirect) {
    const newSpaceId = Spaces.getValidSpaceIdForEntity(entity);

    console.log(`Redirecting from invalid space ${spaceId} to valid space ${spaceId}`);

    return redirect(NavUtils.toEntity(newSpaceId, entityId));
  }

  const serverAvatarUrl = Entities.avatar(entity?.relationsOut);
  const serverCoverUrl = Entities.cover(entity?.relationsOut);

  const blockIds = entity?.relationsOut
    .filter(r => r.typeOf.id === EntityId(SystemIds.BLOCKS))
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
