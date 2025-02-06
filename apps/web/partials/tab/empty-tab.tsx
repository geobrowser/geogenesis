'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
import { INITIAL_RELATION_INDEX_VALUE } from '@geogenesis/sdk/constants';

import { useState } from 'react';
import type { ReactNode } from 'react';

import { StoreRelation } from '~/core/database/types';
import { DB } from '~/core/database/write';
import { EntityId } from '~/core/io/schema';

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

  const handleCreateEntity = () => {
    if (pageType) {
      const newEntityId = entityId;

      DB.upsert(
        {
          entityId: newEntityId,
          attributeId: SYSTEM_IDS.NAME_ATTRIBUTE,
          entityName: null,
          attributeName: 'Name',
          value: {
            type: 'TEXT',
            value: '',
          },
        },
        spaceId
      );

      const pageRelation: StoreRelation = {
        space: spaceId,
        index: INITIAL_RELATION_INDEX_VALUE,
        typeOf: {
          id: EntityId(SYSTEM_IDS.TYPES_ATTRIBUTE),
          name: 'Types',
        },
        fromEntity: {
          id: EntityId(newEntityId),
          name: null,
        },
        toEntity: {
          id: EntityId(SYSTEM_IDS.PAGE_TYPE),
          name: 'Page',
          renderableType: 'RELATION',
          value: EntityId(SYSTEM_IDS.PAGE_TYPE),
        },
      };

      DB.upsertRelation({
        relation: pageRelation,
        spaceId,
      });

      const pageTypeRelation: StoreRelation = {
        space: spaceId,
        index: INITIAL_RELATION_INDEX_VALUE,
        typeOf: {
          id: EntityId(SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE),
          name: 'Page Type',
        },
        fromEntity: {
          id: EntityId(newEntityId),
          name: null,
        },
        toEntity: {
          id: EntityId(pageType.id),
          name: pageType.name,
          renderableType: 'RELATION',
          value: EntityId(pageType.id),
        },
      };

      DB.upsertRelation({
        relation: pageTypeRelation,
        spaceId,
      });
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
