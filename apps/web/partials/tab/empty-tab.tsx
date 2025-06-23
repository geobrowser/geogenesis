'use client';

import { Id, Position, SystemIds } from '@graphprotocol/grc-20';

import { useState } from 'react';
import type { ReactNode } from 'react';

import { useMutate } from '~/core/sync/use-mutate';
import { Relation } from '~/core/v2.types';

import { SmallButton } from '~/design-system/button';
import { Plus } from '~/design-system/icons/plus';

type EmptyTabProps = {
  entityId: string;
  spaceId: string;
  pageType: { name: string; id: string } | null;
  children: ReactNode;
};

export const EmptyTab = ({ entityId, spaceId, pageType, children }: EmptyTabProps) => {
  const [hasCreatedEntity, setHasCreatedEntity] = useState<boolean>(false);
  const { storage } = useMutate();

  const handleCreateEntity = () => {
    if (pageType) {
      const newEntityId = entityId;
      storage.entities.name.set(newEntityId, spaceId, '');

      const pageRelation: Relation = {
        id: Id.generate(),
        entityId: Id.generate(),
        spaceId: spaceId,
        position: Position.generate(),
        renderableType: 'RELATION',
        type: {
          id: SystemIds.TYPES_PROPERTY,
          name: 'Types',
        },
        fromEntity: {
          id: newEntityId,
          name: '',
        },
        toEntity: {
          id: SystemIds.PAGE_TYPE,
          name: 'Page',
          value: SystemIds.PAGE_TYPE,
        },
      };

      storage.relations.set(pageRelation);

      const pageTypeRelation: Relation = {
        id: Id.generate(),
        entityId: Id.generate(),
        spaceId: spaceId,
        position: Position.generate(),
        renderableType: 'RELATION',
        type: {
          id: SystemIds.PAGE_TYPE_PROPERTY,
          name: 'Page Type',
        },
        fromEntity: {
          id: newEntityId,
          name: '',
        },
        toEntity: {
          id: pageType.id,
          name: pageType.name,
          value: pageType.id,
        },
      };

      storage.relations.set(pageTypeRelation);
    }

    setHasCreatedEntity(true);
  };

  if (!pageType) {
    return null;
  }

  if (!hasCreatedEntity) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg bg-grey-01 p-6 text-center">
        <div>
          <img src="/empty-tab.png" alt="" className="h-auto w-[235px]" />
        </div>
        <div className="mt-6 text-smallTitle">Finish setting up this tab</div>
        <div className="mt-2 w-full max-w-[50ch] text-balance text-metadata">
          Every tab in Geo is an entity. Create this tab’s entity in the click of a button and start adding any content
          you or others might want to see.
        </div>
        <div className="mt-5">
          <SmallButton icon={<Plus />} onClick={handleCreateEntity}>
            Create
          </SmallButton>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
