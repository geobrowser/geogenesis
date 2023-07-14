'use client';

import * as React from 'react';

import { ReferencedByEntity } from '~/modules/components/entity/types';
import { Entity, EntityStoreProvider } from '~/modules/entity';
import { Space, Triple } from '~/modules/types';

import { TypesStoreProvider } from '~/modules/type/types-store';
import { EntityPageCover } from '~/modules/components/entity/entity-page-cover';
import { EntityPageContentContainer } from '~/modules/components/entity/entity-page-content-container';
import { EditableHeading } from '~/modules/components/entity/editable-entity-header';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { useEditable } from '~/modules/stores/use-editable';
import { EditableEntityPage } from '~/modules/components/entity/editable-entity-page';
import { ReadableEntityPage } from '~/modules/components/entity/readable-entity-page';

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

  space: Space | null;
  spaceTypes: Triple[];
}

export default function Component(props: Props) {
  const { isEditor } = useAccessControl(props.spaceId);
  const { editable } = useEditable();

  const renderEditablePage = isEditor && editable;
  const Page = renderEditablePage ? EditableEntityPage : ReadableEntityPage;

  const avatarUrl = props.serverAvatarUrl;
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
        <EntityPageCover avatarUrl={avatarUrl} coverUrl={coverUrl} space={true} />

        <EntityPageContentContainer>
          <EditableHeading
            spaceId={props.spaceId}
            entityId={props.id}
            name={props.name}
            triples={props.triples}
            space={true}
          />
          <Page {...props} />
        </EntityPageContentContainer>
      </EntityStoreProvider>
    </TypesStoreProvider>
  );
}
