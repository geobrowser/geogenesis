'use client';

import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk';

import { Source } from '~/core/blocks/data/source';
import { useMutate } from '~/core/sync/use-mutate';
import { useRelations, useValue } from '~/core/sync/use-store';
import { Property } from '~/core/types';

import { SquareButton } from '~/design-system/button';
import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { PageStringField, TableImageField } from '~/design-system/editable-fields/editable-fields';
import { TableStringField } from '~/design-system/editable-fields/editable-fields';
import { NumberField } from '~/design-system/editable-fields/number-field';
import { Create } from '~/design-system/icons/create';
import { SelectEntity } from '~/design-system/select-entity';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';

import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { writeValue } from '~/partials/blocks/table/change-entry';
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
  autoFocus?: boolean;
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
  autoFocus = false,
}: Props) {
  const isNameCell = property.id === SystemIds.NAME_PROPERTY;

  if (isNameCell) {
    // We only allow FOC for collections.
    if (isPlaceholderRow && source.type === 'COLLECTION') {
      return (
        <SelectEntity
          onCreateEntity={result => {
            onChangeEntry(entityId, spaceId, { type: 'CREATE_ENTITY', name: result.name });
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
        />
      );
    }

    return (
      <>
        {source.type !== 'COLLECTION' ? (
          <PageStringField
            variant="tableCell"
            placeholder="Entity name..."
            value={name ?? ''}
            shouldDebounce={true}
            onEnterKey={onAddPlaceholder}
            onChange={value => {
              onChangeEntry(entityId, currentSpaceId, { type: 'SET_NAME', name: value });
            }}
          />
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
                shouldDebounce={true}
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
      />
    );
  }

  return (
    <div className="flex w-full flex-wrap gap-2">
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
}

function RelationsGroup({ entityId, property, spaceId, onLinkEntry, entityName }: RelationsGroupProps) {
  const { storage } = useMutate();

  // We don't filter by space id as we want to render data from all spaces.
  const relations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.type.id === property.id,
  });

  const filterSearchByTypes = property?.relationValueTypes ? property?.relationValueTypes : [];
  const firstRelationValueType = property?.relationValueTypes?.[0];

  if (relations.length === 0) {
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
              storage.relations.set({
                id: IdUtils.generate(),
                entityId: IdUtils.generate(),
                spaceId,
                renderableType: 'RELATION',
                verified: result.verified,
                toSpaceId: result.space,
                type: {
                  id: SystemIds.TYPES_PROPERTY,
                  name: 'Types',
                },
                fromEntity: {
                  id: result.id,
                  name: result.name,
                },
                toEntity: {
                  id: firstRelationValueType.id,
                  name: firstRelationValueType.name,
                  value: firstRelationValueType.id,
                },
              });
            }
          }}
          onDone={result => {
            storage.relations.set({
              id: IdUtils.generate(),
              entityId: IdUtils.generate(),
              spaceId,
              renderableType: 'RELATION',
              toSpaceId: result.space,
              type: { id: property.id, name: property.name },
              fromEntity: { id: entityId, name: null },
              toEntity: { id: result.id, name: result.name, value: result.id },
            });
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
        imageRelation={relations[0]}
        spaceId={spaceId}
        entityId={entityId}
        entityName={entityName}
        propertyId={property.id}
        propertyName={property.name ?? 'Image'}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {relations.map(r => {
        return (
          <div key={`relation-${r.id}-${r.toEntity.value}`}>
            <LinkableRelationChip
              small
              isEditing
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
              storage.relations.set({
                id: IdUtils.generate(),
                entityId: IdUtils.generate(),
                spaceId,
                renderableType: 'RELATION',
                verified: result.verified,
                toSpaceId: result.space,
                type: {
                  id: SystemIds.TYPES_PROPERTY,
                  name: 'Types',
                },
                fromEntity: {
                  id: result.id,
                  name: result.name,
                },
                toEntity: {
                  id: firstRelationValueType.id,
                  name: firstRelationValueType.name,
                  value: firstRelationValueType.id,
                },
              });
            }
          }}
          onDone={result => {
            storage.relations.set({
              id: IdUtils.generate(),
              entityId: IdUtils.generate(),
              spaceId,
              renderableType: 'RELATION',
              toSpaceId: result.space,
              type: { id: property.id, name: property.name },
              fromEntity: { id: entityId, name: null },
              toEntity: { id: result.id, name: result.name, value: result.id },
            });
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

function ValueGroup({ entityId, property, spaceId }: ValueGroupProps) {
  const { storage } = useMutate();
  const rawValue = useValue({
    // We don't filter by space id as we want to render data from all spaces.
    selector: v => v.entity.id === entityId && v.property.id === property.id,
  });
  const value = rawValue?.value ?? '';

  const renderableType = property.renderableType ?? property.dataType;

  const onWriteValue = (newValue: string) => {
    writeValue(storage, entityId, spaceId, property, newValue, rawValue);
  };

  switch (renderableType) {
    case 'NUMBER':
      return (
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
      return <TableStringField placeholder="Add value..." value={value} onChange={onWriteValue} />;
    case 'CHECKBOX': {
      const checked = getChecked(value);

      return <Checkbox checked={checked} onChange={() => onWriteValue(!checked ? '1' : '0')} />;
    }
    case 'TIME':
      return (
        <DateField
          isEditing={true}
          value={value}
          propertyId={property.id}
          dataType={property.dataType}
          onBlur={v => onWriteValue(v.value)}
        />
      );
  }
}
