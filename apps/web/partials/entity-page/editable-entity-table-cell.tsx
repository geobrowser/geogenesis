'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';

import { Source } from '~/core/blocks/data/source';
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
                        attributeId: SystemIds.NAME_PROPERTY,
                        entityId: `${spaceId}:${entityId}:${property.id}`,
                        spaceId: currentSpaceId,
                        attributeName: 'Name',
                        entityName: value,
                        type: 'TEXT',
                        value: value,
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
                            attributeId: SystemIds.NAME_PROPERTY,
                            entityId,
                            spaceId: currentSpaceId,
                            attributeName: 'Name',
                            entityName: value,
                            type: 'TEXT',
                            value: value,
                          },
                          value: { type: 'TEXT', value },
                        },
                      },
                    }
                  );
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
      <ValueGroup entityId={entityId} property={property} />
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
  const relations = useRelations({
    // We don't filter by space id as we want to render data from all spaces.
    selector: r => r.fromEntity.id === entityId && r.type.id === property.id,
  });

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
          relationValueTypes={property.relationValueTypes}
          onDone={result => {
            // onChangeEntry(
            //   {
            //     entityId,
            //     entityName: null,
            //     spaceId: r.spaceId,
            //   },
            //   {
            //     type: 'EVENT',
            //     data: {
            //       type: 'UPSERT_RELATION',
            //       payload: {
            //         fromEntityId: entityId,
            //         fromEntityName: null,
            //         toEntityId: result.id,
            //         toEntityName: result.name,
            //         typeOfId: r.propertyId,
            //         typeOfName: r.propertyName,
            //       },
            //     },
            //   }
            // );
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
          <>
            <div key={`relation-${r.id}-${r.toEntity.value}`} className="mt-1">
              <LinkableRelationChip
                isEditing
                onDelete={() => {
                  // onChangeEntry(
                  //   {
                  //     entityId,
                  //     entityName: null,
                  //     spaceId: r.spaceId,
                  //   },
                  //   {
                  //     type: 'EVENT',
                  //     data: {
                  //       type: 'DELETE_RELATION',
                  //       payload: {
                  //         renderable: r,
                  //       },
                  //     },
                  //   }
                  // );
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
            // onChangeEntry(
            //   {
            //     entityId,
            //     entityName: null,
            //     spaceId: spaceId,
            //   },
            //   {
            //     type: 'EVENT',
            //     data: {
            //       type: 'UPSERT_RELATION',
            //       payload: {
            //         fromEntityId: entityId,
            //         fromEntityName: null,
            //         toEntityId: result.id,
            //         toEntityName: result.name,
            //         typeOfId: typeOfId,
            //         typeOfName: typeOfName,
            //       },
            //     },
            //   }
            // );
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
}

function ValueGroup({ entityId, property }: ValueGroupProps) {
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
          onChange={value =>
            // onChangeEntry(
            //   {
            //     entityId,
            //     entityName: null,
            //     spaceId: renderable.spaceId,
            //   },
            //   {
            //     type: 'EVENT',
            //     data: {
            //       type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
            //       payload: {
            //         renderable,
            //         value: {
            //           type: 'NUMBER',
            //           value: value,
            //           options: {
            //             // format: renderable.options?.format,
            //             unit: renderable.options?.unit,
            //           },
            //         },
            //       },
            //     },
            //   }
            // )
            {}
          }
        />
      );
    case 'TEXT':
      return (
        <TableStringField
          placeholder="Add value..."
          value={value}
          onChange={value =>
            // onChangeEntry(
            //   {
            //     entityId,
            //     entityName: null,
            //     spaceId: renderable.spaceId,
            //   },
            //   {
            //     type: 'EVENT',
            //     data: {
            //       type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
            //       payload: { renderable, value: { type: 'TEXT', value: value } },
            //     },
            //   }
            // )
            {}
          }
        />
      );
    case 'CHECKBOX': {
      const checked = getChecked(value);

      return (
        <Checkbox
          checked={checked}
          onChange={() => {
            // onChangeEntry(
            //   {
            //     entityId,
            //     entityName: null,
            //     spaceId: renderable.spaceId,
            //   },
            //   {
            //     type: 'EVENT',
            //     data: {
            //       type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
            //       payload: {
            //         renderable,
            //         value: {
            //           type: 'CHECKBOX',
            //           value: !checked ? '1' : '0',
            //         },
            //       },
            //     },
            //   }
            // );
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
          onBlur={value => {
            // onChangeEntry(
            //   {
            //     entityId,
            //     entityName: null,
            //     spaceId: renderable.spaceId,
            //   },
            //   {
            //     type: 'EVENT',
            //     data: {
            //       type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
            //       payload: {
            //         renderable,
            //         value: {
            //           type: 'TIME',
            //           value: value.value,
            //           options: {
            //             format: value.format,
            //           },
            //         },
            //       },
            //     },
            //   }
            // );
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
