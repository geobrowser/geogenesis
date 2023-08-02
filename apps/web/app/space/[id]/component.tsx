'use client';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { EntityStoreProvider } from '~/core/state/entity-page-store';
import { TypesStoreProvider } from '~/core/state/types-store/types-store';
import { Space, Triple } from '~/core/types';
import { Entity } from '~/core/utils/entity';

import { Spacer } from '~/design-system/spacer';

import { Editor } from '~/partials/editor/editor';
import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EditableEntityPage } from '~/partials/entity-page/editable-entity-page';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { SpacePageMetadataHeader } from '~/partials/entity-page/entity-page-metadata-header';
import { EntityPageReferencedBy } from '~/partials/entity-page/entity-page-referenced-by';
import { ReadableEntityPage } from '~/partials/entity-page/readable-entity-page';
import { ReferencedByEntity } from '~/partials/entity-page/types';

interface Props {
  triples: Triple[];
  id: string;
  name: string;
  description: string | null;
  spaceId: string;
  referencedByEntities: ReferencedByEntity[];
  serverAvatarUrl: string | null;
  serverCoverUrl: string | null;

  // For the page editor
  blockTriples: Triple[];
  blockIdsTriple: Triple | null;

  spaceTypes: Triple[];
  space: Space | null;
}

export function Component(props: Props) {
  const renderEditablePage = useUserIsEditing(props.spaceId);

  const Page = renderEditablePage ? EditableEntityPage : ReadableEntityPage;

  const avatarUrl = Entity.avatar(props.triples) ?? props.serverAvatarUrl;
  const coverUrl = Entity.cover(props.triples) ?? props.serverCoverUrl;

  return (
    <TypesStoreProvider initialTypes={props.spaceTypes} space={props.space}>
      <EntityStoreProvider
        id={props.id}
        spaceId={props.spaceId}
        initialTriples={props.triples}
        initialSchemaTriples={[]}
        initialBlockIdsTriple={props.blockIdsTriple}
        initialBlockTriples={props.blockTriples}
      >
        <EntityPageCover avatarUrl={avatarUrl} coverUrl={coverUrl} />

        <EntityPageContentContainer>
          <EditableHeading
            spaceId={props.spaceId}
            entityId={props.id}
            name={props.name}
            triples={props.triples}
            showAccessControl
          />
          <Spacer height={12} />
          <SpacePageMetadataHeader spaceId={props.spaceId} />
          <Spacer height={40} />
          <Editor editable={renderEditablePage} shouldHandleOwnSpacing />
          <Page {...props} />
          <Spacer height={40} />
          <EntityPageReferencedBy referencedByEntities={props.referencedByEntities} name={props.name} />
        </EntityPageContentContainer>
      </EntityStoreProvider>
    </TypesStoreProvider>
  );
}
