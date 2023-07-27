'use client';

import * as React from 'react';
import { Space, Triple } from '~/core/types';

import { TypesStoreProvider } from '~/core/state/types-store';
import { ReferencedByEntity } from '~/partials/entity-page/types';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { EditableEntityPage } from '~/partials/entity-page/editable-entity-page';
import { ReadableEntityPage } from '~/partials/entity-page/readable-entity-page';
import { Entity } from '~/core/utils/entity';
import { EntityStoreProvider } from '~/core/state/entity-page-store';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EditableHeading } from '~/partials/entity-page/editable-entity-header';

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

  // Sets schema and type values based url params
  typeId: string | null;
  filterId: string | null;
  filterValue: string | null;
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
          <EditableHeading spaceId={props.spaceId} entityId={props.id} name={props.name} triples={props.triples} />
          <Page {...props} />
        </EntityPageContentContainer>
      </EntityStoreProvider>
    </TypesStoreProvider>
  );
}
