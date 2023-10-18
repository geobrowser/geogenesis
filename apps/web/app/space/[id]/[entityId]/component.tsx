'use client';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { EntityStoreProvider } from '~/core/state/entity-page-store';
import { MergeEntityProvider } from '~/core/state/merge-entity-store';
import { MoveEntityProvider } from '~/core/state/move-entity-store';
import { Space, Triple } from '~/core/types';
import { Entity } from '~/core/utils/entity';

import { Spacer } from '~/design-system/spacer';

import { Editor } from '~/partials/editor/editor';
import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EditableEntityPage } from '~/partials/entity-page/editable-entity-page';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { EntityPageMetadataHeader } from '~/partials/entity-page/entity-page-metadata-header';
import { ReadableEntityPage } from '~/partials/entity-page/readable-entity-page';
import { MergeEntityReview } from '~/partials/merge-entity/merge-entity-review';
import { MoveEntityReview } from '~/partials/move-entity/move-entity-review';

interface Props {
  triples: Triple[];
  id: string;
  name: string | null;
  description: string | null;
  spaceId: string;
  serverAvatarUrl: string | null;
  serverCoverUrl: string | null;

  // For the page editor
  blockTriples: Triple[];
  blockIdsTriple: Triple | null;

  space: Space | null;

  // Sets schema and type values based url params
  typeId: string | null;
  filterId: string | null;
  filterValue: string | null;

  // Render the Referenced by section. It controls its own data fetching states.
  ReferencedByComponent: React.ReactElement | null;
}

export function Component(props: Props) {
  const renderEditablePage = useUserIsEditing(props.spaceId);

  const Page = renderEditablePage ? EditableEntityPage : ReadableEntityPage;

  const avatarUrl = Entity.avatar(props.triples) ?? props.serverAvatarUrl;
  const coverUrl = Entity.cover(props.triples) ?? props.serverCoverUrl;
  const types = Entity.types(props.triples);

  return (
    <EntityStoreProvider
      id={props.id}
      spaceId={props.spaceId}
      initialTriples={props.triples}
      initialSchemaTriples={[]}
      initialBlockIdsTriple={props.blockIdsTriple}
      initialBlockTriples={props.blockTriples}
    >
      <MoveEntityProvider>
        <MergeEntityProvider>
          <EntityPageCover avatarUrl={avatarUrl} coverUrl={coverUrl} />
          <EntityPageContentContainer>
            <EditableHeading spaceId={props.spaceId} entityId={props.id} name={props.name} triples={props.triples} />
            <EntityPageMetadataHeader id={props.id} spaceId={props.spaceId} types={types} />
            <Spacer height={40} />
            <Editor editable={renderEditablePage} shouldHandleOwnSpacing />
            <Page {...props} />
            <Spacer height={40} />
            {props.ReferencedByComponent}
          </EntityPageContentContainer>
          <MergeEntityReview />
        </MergeEntityProvider>
        <MoveEntityReview />
      </MoveEntityProvider>
    </EntityStoreProvider>
  );
}
