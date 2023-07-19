'use client';

import { useMemo } from 'react';
import { EditableHeading } from '~/modules/components/entity/editable-entity-header';
import { EditableEntityPage } from '~/modules/components/entity/editable-entity-page';
import { EntityPageContentContainer } from '~/modules/components/entity/entity-page-content-container';
import { EntityPageCover } from '~/modules/components/entity/entity-page-cover';
import { Entity, EntityStoreProvider, useEntityStore } from '~/modules/entity';
import { ID } from '~/modules/id';
import { TypesStoreProvider } from '~/modules/type/types-store';
import { Space, Triple } from '~/modules/types';

type Props = {
  spaceId: string;
  typeId: string | null;
  filterId: string | null;
  filterValue: string | null;
  space: Space | null;
  spaceTypes: Triple[];
};

export function Component({ spaceId, typeId, filterId, filterValue, space, spaceTypes }: Props) {
  const newId = useMemo(() => ID.createEntityId(), []);

  return (
    <TypesStoreProvider initialTypes={spaceTypes} space={space}>
      <EntityStoreProvider
        id={newId}
        spaceId={spaceId}
        initialTriples={[]}
        initialSchemaTriples={[]}
        initialBlockTriples={[]}
        initialBlockIdsTriple={null}
      >
        <CreateEntityContent
          newId={newId}
          spaceId={spaceId}
          typeId={typeId}
          filterId={filterId}
          filterValue={filterValue}
        />
      </EntityStoreProvider>
    </TypesStoreProvider>
  );
}

type CreateEntityContentProps = {
  spaceId: string;
  newId: string;
  typeId?: string | null;
  filterId?: string | null;
  filterValue?: string | null;
};

function CreateEntityContent({ spaceId, newId, typeId, filterId, filterValue }: CreateEntityContentProps) {
  const { triples } = useEntityStore();
  const avatarUrl = Entity.avatar(triples) ?? null;
  const coverUrl = Entity.cover(triples) ?? null;

  return (
    <>
      <EntityPageCover avatarUrl={avatarUrl} coverUrl={coverUrl} />
      <EntityPageContentContainer>
        <EditableHeading spaceId={spaceId} entityId={newId} name="" triples={triples} />
        <EditableEntityPage
          id={newId}
          spaceId={spaceId}
          typeId={typeId}
          filterId={filterId}
          filterValue={filterValue}
          triples={triples}
        />
      </EntityPageContentContainer>
    </>
  );
}
