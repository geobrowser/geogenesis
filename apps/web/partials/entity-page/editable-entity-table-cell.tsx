'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import type { MouseEvent, ReactNode } from 'react';

import { useRouter } from 'next/navigation';

import { Source } from '~/core/blocks/data/source';
import { useMutate } from '~/core/sync/use-mutate';
import { useRelations, useSpaceAwareValue } from '~/core/sync/use-store';
import { Property } from '~/core/types';
import { dedupeRelationsByToEntityId } from '~/core/utils/dedupe-relations';
import { NavUtils } from '~/core/utils/utils';

import { SquareButton } from '~/design-system/button';
import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { PageStringField, TableImageField, TableStringField } from '~/design-system/editable-fields/editable-fields';
import { NumberField } from '~/design-system/editable-fields/number-field';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { Create } from '~/design-system/icons/create';
import { RightArrowLongSmall } from '~/design-system/icons/right-arrow-long-small';
import { SelectEntity } from '~/design-system/select-entity';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';

import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import {
  createPropertyRelation,
  createTypeRelationForNewEntity,
  writeValue,
} from '~/partials/blocks/table/change-entry';
import { CollectionMetadata } from '~/partials/blocks/table/collection-metadata';

type Props = {
  entityId: string;
  spaceId: string;
  property: Property;
  isPlaceholderRow: boolean;
  name: string | null;
  currentSpaceId: string;
  collectionId?: string;
  relationId?: string;
  toSpaceId?: string;
  verified?: boolean;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  onAddPlaceholder?: () => void;
  source: Source;
  imageUploadingFor?: Set<string>;
  autoFocus?: boolean;
  collectionTypeFilters?: { id: string; name: string | null }[];
};

export function EditableEntityTableCell({
  entityId,
  spaceId,
  property,
  isPlaceholderRow,
  name,
  currentSpaceId,
  collectionId,
  relationId,
  toSpaceId,
  verified,
  onChangeEntry,
  onLinkEntry,
  onAddPlaceholder,
  source,
  imageUploadingFor,
  autoFocus = false,
  collectionTypeFilters,
}: Props) {
  const { storage } = useMutate();
  const isNameCell = property.id === SystemIds.NAME_PROPERTY;

  if (isNameCell) {
    // We only allow FOC for collections.
    if (isPlaceholderRow && source.type === 'COLLECTION') {
      return (
        <SelectEntity
          onCreateEntity={result => {
            onChangeEntry(entityId, spaceId, { type: 'CREATE_ENTITY', name: result.name });
            return entityId;
          }}
          onDone={(result, fromCreateFn) => {
            if (fromCreateFn) {
              // We bail out in the case that we're receiving the onDone
              // callback from within the create entity function internal
              // to SelectEntity.
              return;
            }

            onChangeEntry(entityId, spaceId, { type: 'FIND_ENTITY', entity: result });
          }}
          spaceId={spaceId}
          variant="tableCell"
          width="full"
          autoFocus={autoFocus}
          relationValueTypes={collectionTypeFilters}
        />
      );
    }

    return (
      <>
        {source.type !== 'COLLECTION' ? (
          <div className="group/name-cell relative flex w-full items-center">
            <PageStringField
              variant="tableCell"
              placeholder="Entity name..."
              value={name ?? ''}
              onEnterKey={onAddPlaceholder}
              onChange={value => {
                onChangeEntry(entityId, currentSpaceId, { type: 'SET_NAME', name: value });
              }}
            />
            <div className="absolute top-1/2 right-0 hidden -translate-y-1/2 group-hover/name-cell:block">
              <NavigateButton spaceId={currentSpaceId} entityId={entityId} />
            </div>
          </div>
        ) : (
          <CollectionMetadata
            view="TABLE"
            isEditing={true}
            name={name}
            currentSpaceId={currentSpaceId}
            entityId={entityId}
            spaceId={toSpaceId}
            collectionId={collectionId}
            relationId={relationId}
            verified={verified}
            onLinkEntry={onLinkEntry}
          >
            <div className="pointer-events-auto">
              <PageStringField
                variant="tableCell"
                placeholder="Entity name..."
                value={name ?? ''}
                onEnterKey={onAddPlaceholder}
                onChange={value => {
                  onChangeEntry(entityId, currentSpaceId, { type: 'SET_NAME', name: value });
                }}
              />
            </div>
          </CollectionMetadata>
        )}
      </>
    );
  }

  const isRelation = property.dataType === 'RELATION';

  if (isRelation) {
    return (
      <RelationsGroup
        entityId={entityId}
        property={property}
        spaceId={spaceId}
        onLinkEntry={onLinkEntry}
        entityName={name}
        imageUploadingFor={imageUploadingFor}
      />
    );
  }

  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
      <ValueGroup entityId={entityId} property={property} spaceId={spaceId} />
    </div>
  );
}

interface RelationsGroupProps {
  entityId: string;
  spaceId: string;
  property: Property;
  onLinkEntry: onLinkEntryFn;
  entityName?: string | null;
  imageUploadingFor?: Set<string>;
}

function RelationsGroup({
  entityId,
  property,
  spaceId,
  onLinkEntry,
  entityName,
  imageUploadingFor,
}: RelationsGroupProps) {
  const { storage } = useMutate();

  // We don't filter by space id as we want to render data from all spaces.
  const relations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.type.id === property.id,
  });
  const dedupedRelations = dedupeRelationsByToEntityId(relations);

  const filterSearchByTypes = property?.relationValueTypes ? property?.relationValueTypes : [];
  const firstRelationValueType = property?.relationValueTypes?.[0];
  const hasRelationToEntity = (targetEntityId: string) => dedupedRelations.some(r => r.toEntity.id === targetEntityId);

  if (dedupedRelations.length === 0) {
    // For IMAGE type properties, show an image upload field instead of SelectEntity
    if (property.renderableTypeStrict === 'IMAGE') {
      return (
        <TableImageField
          imageRelation={undefined}
          spaceId={spaceId}
          entityId={entityId}
          entityName={entityName}
          propertyId={property.id}
          propertyName={property.name ?? 'Image'}
          isUploadingFromExternal={imageUploadingFor?.has(`${entityId}:${property.id}`) ?? false}
        />
      );
    }

    return (
      <div key={`${entityId}-${property.id}-empty`} data-testid="select-entity" className="w-full">
        <SelectEntity
          spaceId={spaceId}
          relationValueTypes={filterSearchByTypes}
          width="full"
          onCreateEntity={result => {
            if (firstRelationValueType) {
              createTypeRelationForNewEntity(storage, spaceId, result, firstRelationValueType);
            }
          }}
          onDone={result => {
            if (hasRelationToEntity(result.id)) {
              return;
            }

            createPropertyRelation(storage, spaceId, entityId, property, result);
          }}
          variant="tableCell"
        />
      </div>
    );
  }

  // For IMAGE type properties with existing relations, show editable image field
  if (property.renderableTypeStrict === 'IMAGE') {
    return (
      <TableImageField
        imageRelation={dedupedRelations[0]}
        spaceId={spaceId}
        entityId={entityId}
        entityName={entityName}
        propertyId={property.id}
        propertyName={property.name ?? 'Image'}
        isUploadingFromExternal={imageUploadingFor?.has(`${entityId}:${property.id}`) ?? false}
      />
    );
  }

  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
      {dedupedRelations.map(r => {
        return (
          <div key={`relation-${r.id}-${r.toEntity.value}`} className="min-w-0 max-w-full">
            <LinkableRelationChip
              small
              isEditing
              truncateLabel
              onDelete={() => {
                storage.relations.delete(r);
              }}
              onDone={result => {
                onLinkEntry(
                  r.id,
                  {
                    id: r.toEntity.id,
                    name: r.toEntity.name,
                    space: result.space,
                    verified: result.verified,
                  },
                  r.verified
                );
              }}
              currentSpaceId={spaceId}
              entityId={r.toEntity.id}
              relationId={r.id}
              relationEntityId={r.entityId}
              spaceId={r.toSpaceId}
              verified={r.verified}
            >
              {r.toEntity.name ?? r.toEntity.id}
            </LinkableRelationChip>
          </div>
        );
      })}

      <div>
        <SelectEntityAsPopover
          trigger={<SquareButton icon={<Create />} />}
          relationValueTypes={filterSearchByTypes}
          onCreateEntity={result => {
            if (firstRelationValueType) {
              createTypeRelationForNewEntity(storage, spaceId, result, firstRelationValueType);
            }
          }}
          onDone={result => {
            if (hasRelationToEntity(result.id)) {
              return;
            }

            createPropertyRelation(storage, spaceId, entityId, property, result);
          }}
          spaceId={spaceId}
        />
      </div>
    </div>
  );
}

interface ValueGroupProps {
  entityId: string;
  property: Property;
  spaceId: string;
}

function NavigateButton({ spaceId, entityId }: { spaceId: string; entityId: string }) {
  const router = useRouter();

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    router.push(NavUtils.toEntity(spaceId, entityId, true));
  };

  return <SquareButton icon={<RightArrowLongSmall />} onClick={handleClick} />;
}

function ValueGroup({ entityId, property, spaceId }: ValueGroupProps) {
  const { storage } = useMutate();
  const rawValue = useSpaceAwareValue({ entityId, propertyId: property.id, spaceId });
  const value = rawValue?.value ?? '';

  const renderableType = property.renderableTypeStrict ?? property.dataType;

  const onWriteValue = (newValue: string) => {
    writeValue(storage, entityId, spaceId, property, newValue, rawValue);
  };

  const cellWrap = (node: ReactNode) => (
    <div className="min-w-0 w-full max-w-full">{node}</div>
  );

  switch (renderableType) {
    case 'INTEGER':
    case 'FLOAT':
    case 'DECIMAL':
      return cellWrap(
        <NumberField
          variant="tableCell"
          isEditing={true}
          value={value}
          format={property.format || undefined}
          unitId={rawValue?.options?.unit || property.unit || undefined}
          dataType={property.dataType}
          onChange={onWriteValue}
        />
      );
    case 'TEXT':
      return cellWrap(
        <TableStringField
          variant="tableCell"
          truncateOverflow
          placeholder="Add value..."
          value={value}
          onChange={onWriteValue}
        />
      );
    case 'URL': {
      return cellWrap(
        <WebUrlField
          variant="tableCell"
          isEditing={true}
          spaceId={spaceId}
          value={value}
          format={property.format}
          onBlur={e => onWriteValue(e.currentTarget.value)}
        />
      );
    }
    case 'BOOLEAN': {
      const checked = getChecked(value);

      return cellWrap(
        <Checkbox checked={checked} onChange={() => onWriteValue(!checked ? '1' : '0')} />
      );
    }
    case 'DATE':
    case 'DATETIME':
    case 'TIME':
      return cellWrap(
        <DateField
          key={value || 'empty'}
          variant="tableCell"
          className="min-w-0 max-w-full"
          isEditing={true}
          value={value}
          propertyId={property.id}
          dataType={property.dataType}
          onBlur={v => onWriteValue(v.value)}
        />
      );
    default:
      return null;
  }
}
