import { SystemIds } from '@graphprotocol/grc-20';
import Link from 'next/link';

import { Source } from '~/core/blocks/data/source';
import { PLACEHOLDER_TEXT } from '~/core/constants';

import { InlinePageStringField } from '~/design-system/editable-fields/editable-fields';

import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { CollectionMetadata } from '~/partials/blocks/table/collection-metadata';

type TableBlockTableItemProps = {
  isEditing: boolean;
  name: string | null;
  href: string;
  currentSpaceId: string;
  entityId: string;
  spaceId?: string;
  collectionId?: string;
  relationId?: string;
  verified?: boolean;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  source: Source;
};

export const TableBlockTableItem = ({
  isEditing,
  name,
  href,
  currentSpaceId,
  entityId,
  spaceId,
  collectionId,
  relationId,
  verified,
  onChangeEntry,
  onLinkEntry,
  source,
}: TableBlockTableItemProps) => {
  if (isEditing) {
    return (
      <>
        {source.type !== 'COLLECTION' ? (
          <InlinePageStringField
            placeholder="Entity name..."
            value={name ?? ''}
            onChange={value => {
              onChangeEntry(
                {
                  entityId,
                  entityName: value,
                  spaceId: currentSpaceId,
                },
                {
                  type: 'EVENT',
                  data: {
                    type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                    payload: {
                      renderable: {
                        attributeId: SystemIds.NAME_ATTRIBUTE,
                        entityId,
                        spaceId: currentSpaceId,
                        attributeName: 'Name',
                        entityName: name,
                        type: 'TEXT',
                        value: name ?? '',
                      },
                      value: { type: 'TEXT', value },
                    },
                  },
                }
              );
            }}
          />
        ) : (
          <CollectionMetadata
            view="TABLE"
            isEditing={true}
            name={name}
            href={href}
            currentSpaceId={currentSpaceId}
            entityId={entityId}
            spaceId={spaceId}
            collectionId={collectionId}
            relationId={relationId}
            verified={verified}
            onLinkEntry={onLinkEntry}
          >
            <InlinePageStringField
              placeholder="Entity name..."
              value={name ?? ''}
              onChange={value => {
                onChangeEntry(
                  {
                    entityId,
                    entityName: value,
                    spaceId: currentSpaceId,
                  },
                  {
                    type: 'EVENT',
                    data: {
                      type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                      payload: {
                        renderable: {
                          attributeId: SystemIds.NAME_ATTRIBUTE,
                          entityId,
                          spaceId: currentSpaceId,
                          attributeName: 'Name',
                          entityName: name,
                          type: 'TEXT',
                          value: name ?? '',
                        },
                        value: { type: 'TEXT', value },
                      },
                    },
                  }
                );
              }}
            />
          </CollectionMetadata>
        )}
      </>
    );
  }

  return (
    <>
      {source.type !== 'COLLECTION' ? (
        <Link href={href} className="truncate text-tableCell text-ctaHover hover:underline">
          {name || PLACEHOLDER_TEXT}
        </Link>
      ) : (
        <CollectionMetadata
          view="TABLE"
          isEditing={false}
          name={name}
          href={href}
          currentSpaceId={currentSpaceId}
          entityId={entityId}
          spaceId={spaceId}
          collectionId={collectionId}
          relationId={relationId}
          verified={verified}
          onLinkEntry={onLinkEntry}
        >
          <Link href={href} className="truncate text-tableCell text-ctaHover hover:underline">
            {name || PLACEHOLDER_TEXT}
          </Link>
        </CollectionMetadata>
      )}
    </>
  );
};
