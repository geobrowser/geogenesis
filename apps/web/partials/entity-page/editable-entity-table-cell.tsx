import { SystemIds, Position } from '@graphprotocol/grc-20';

import { Source } from '~/core/blocks/data/source';
import { useRelations, useValue } from '~/core/sync/use-store';
import { storage } from '~/core/sync/use-mutate';
import { ID } from '~/core/id';
import { Property, Value } from '~/core/v2.types';

import { SquareButton } from '~/design-system/button';
import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { PageStringField } from '~/design-system/editable-fields/editable-fields';
import { ImageZoom, TableStringField } from '~/design-system/editable-fields/editable-fields';
import { NumberField } from '~/design-system/editable-fields/number-field';
import { Create } from '~/design-system/icons/create';
import { SelectEntity } from '~/design-system/select-entity';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';

import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';
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
            // This actually works quite differently than other creates since
            // we want to use the existing placeholder entity id.
            onChangeEntry(
              {
                entityId: entityId,
                entityName: null,
                spaceId: spaceId,
              },
              {
                type: 'Create',
                data: result,
              }
            );
          }}
          onDone={(result, fromCreateFn) => {
            if (fromCreateFn) {
              // We bail out in the case that we're receiving the onDone
              // callback from within the create entity function internal
              // to SelectEntity.
              return;
            }

            // This actually works quite differently than other creates since
            // we want to use the existing placeholder entity id.
            //
            // @TODO: When do we use the placeholder and when we use the real entity id?
            onChangeEntry(
              {
                entityId: entityId,
                entityName: null,
                spaceId: spaceId,
              },
              {
                type: 'Find',
                data: result,
              }
            );
          }}
          spaceId={spaceId}
          variant="tableCell"
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
              // Update name using storage API directly like other fields
              storage.values.set({
                id: ID.createValueId({ entityId, propertyId: SystemIds.NAME_PROPERTY, spaceId: currentSpaceId }),
                entity: { id: entityId, name: value },
                property: {
                  id: SystemIds.NAME_PROPERTY,
                  name: 'Name',
                  dataType: 'TEXT',
                },
                spaceId: currentSpaceId,
                value: value,
                isLocal: true,
              });
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
                  // Update name using storage API directly like other fields
                  storage.values.set({
                    id: ID.createValueId({ entityId, propertyId: SystemIds.NAME_PROPERTY, spaceId: currentSpaceId }),
                    entity: { id: entityId, name: value },
                    property: {
                      id: SystemIds.NAME_PROPERTY,
                      name: 'Name',
                      dataType: 'TEXT',
                    },
                    spaceId: currentSpaceId,
                    value: value,
                    isLocal: true,
                  });
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
    return <RelationsGroup entityId={entityId} property={property} spaceId={spaceId} onLinkEntry={onLinkEntry} />;
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
}

function RelationsGroup({ entityId, property, spaceId, onLinkEntry }: RelationsGroupProps) {
  const relations = useRelations({
    // We don't filter by space id as we want to render data from all spaces.
    selector: r => r.fromEntity.id === entityId && r.type.id === property.id,
  });

  if (relations.length === 0) {
    return (
      <div key={`${entityId}-${property.id}-empty`} data-testid="select-entity" className="relative z-50 w-full">
        <SelectEntity
          spaceId={spaceId}
          relationValueTypes={property.relationValueTypes}
          onDone={result => {
            // Create relation using storage API
            storage.relations.set({
              id: ID.createEntityId(),
              entityId: ID.createEntityId(),
              spaceId,
              position: Position.generate(),
              renderableType: 'RELATION',
              verified: false,
              type: {
                id: property.id,
                name: property.name || property.id,
              },
              fromEntity: {
                id: entityId,
                name: null,
              },
              toEntity: {
                id: result.id,
                name: result.name,
                value: result.id,
              },
              isLocal: true,
            });
          }}
          variant="tableCell"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {relations.map(r => {
        if (property.renderableTypeStrict === 'IMAGE') {
          return <ImageZoom variant="table-cell" key={`image-${r.id}`} imageSrc={r.toEntity.value ?? ''} />;
        }

        return (
          <>
            <div key={`relation-${r.id}-${r.toEntity.value}`} className="mt-1">
              <LinkableRelationChip
                isEditing
                onDelete={() => {
                  // Delete relation using storage API
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
          </>
        );
      })}

      <div className="mt-1">
        <SelectEntityAsPopover
          trigger={<SquareButton icon={<Create />} />}
          relationValueTypes={property.relationValueTypes}
          onDone={result => {
            // Create additional relation using storage API
            storage.relations.set({
              id: ID.createEntityId(),
              entityId: ID.createEntityId(),
              spaceId,
              position: Position.generate(),
              renderableType: 'RELATION',
              verified: false,
              type: {
                id: property.id,
                name: property.name || property.id,
              },
              fromEntity: {
                id: entityId,
                name: null,
              },
              toEntity: {
                id: result.id,
                name: result.name,
                value: result.id,
              },
              isLocal: true,
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
  const rawValue = useValue({
    // We don't filter by space id as we want to render data from all spaces.
    selector: v => v.entity.id === entityId && v.property.id === property.id,
  });
  const value = rawValue?.value ?? '';

  const renderableType = property.renderableType ?? property.dataType;

  switch (renderableType) {
    case 'NUMBER':
      return (
        <NumberField
          variant="tableCell"
          isEditing={true}
          value={value}
          format={property.format || undefined}
          unitId={rawValue?.options?.unit || property.unit || undefined}
          onChange={newValue => {
            // Update or create value using storage API
            if (rawValue) {
              storage.values.update(rawValue, draft => {
                draft.value = newValue;
              });
            } else {
              storage.values.set({
                id: ID.createValueId({ entityId, propertyId: property.id, spaceId }),
                entity: { id: entityId, name: null },
                property,
                value: newValue,
                spaceId,
                isLocal: true,
              });
            }
          }}
        />
      );
    case 'TEXT':
      return (
        <TableStringField
          placeholder="Add value..."
          value={value}
          onChange={newValue => {
            // Update or create value using storage API
            if (rawValue) {
              storage.values.update(rawValue, draft => {
                draft.value = newValue;
              });
            } else {
              storage.values.set({
                id: ID.createValueId({ entityId, propertyId: property.id, spaceId }),
                entity: { id: entityId, name: null },
                property,
                value: newValue,
                spaceId,
                isLocal: true,
              });
            }
          }}
        />
      );
    case 'CHECKBOX': {
      const checked = getChecked(value);

      return (
        <Checkbox
          checked={checked}
          onChange={() => {
            const newValue = !checked ? '1' : '0';
            // Update or create value using storage API
            if (rawValue) {
              storage.values.update(rawValue, draft => {
                draft.value = newValue;
              });
            } else {
              storage.values.set({
                id: ID.createValueId({ entityId, propertyId: property.id, spaceId }),
                entity: { id: entityId, name: null },
                property,
                value: newValue,
                spaceId,
                isLocal: true,
              });
            }
          }}
        />
      );
    }
    case 'TIME':
      return (
        <DateField
          isEditing={true}
          value={value}
          propertyId={property.id}
          onBlur={dateValue => {
            // Update or create value using storage API
            if (rawValue) {
              storage.values.update(rawValue, draft => {
                draft.value = dateValue.value;
              });
            } else {
              storage.values.set({
                id: ID.createValueId({ entityId, propertyId: property.id, spaceId }),
                entity: { id: entityId, name: null },
                property,
                value: dateValue.value,
                spaceId,
                isLocal: true,
              });
            }
          }}
        />
      );
    // case 'URL':
    //   return (
    //     <WebUrlField
    //       key={renderable.propertyId}
    //       placeholder="Add a URI"
    //       isEditing={true}
    //       spaceId={spaceId}
    //       value={renderable.value}
    //       onBlur={e => {
    //         onChangeEntry(
    //           {
    //             entityId,
    //             entityName,
    //             spaceId: renderable.spaceId,
    //           },
    //           {
    //             type: 'EVENT',
    //             data: {
    //               type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
    //               payload: {
    //                 renderable,
    //                 value: {
    //                   type: 'URL',
    //                   value: e.currentTarget.value,
    //                 },
    //               },
    //             },
    //           }
    //         );
    //       }}
    //     />
    //   );
  }
}
