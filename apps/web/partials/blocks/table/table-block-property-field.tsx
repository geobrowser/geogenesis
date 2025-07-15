import { Id, SystemIds } from '@graphprotocol/grc-20';
import cx from 'classnames';

import { useState } from 'react';

import { Source } from '~/core/blocks/data/source';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useMutate } from '~/core/sync/use-mutate';
import { useRelations, useValues } from '~/core/sync/use-store';
import { getImagePath } from '~/core/utils/utils';
import { Property } from '~/core/v2.types';

import { SquareButton } from '~/design-system/button';
import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom, TableStringField } from '~/design-system/editable-fields/editable-fields';
import { NumberField } from '~/design-system/editable-fields/number-field';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { Create } from '~/design-system/icons/create';
import { SelectEntity } from '~/design-system/select-entity';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';
import { Text } from '~/design-system/text';

import { onChangeEntryFn } from './change-entry';

export function TableBlockPropertyField(props: {
  spaceId: string;
  entityId: string;
  property: Property;
  onChangeEntry: onChangeEntryFn;
  source: Source;
}) {
  const { spaceId, entityId, property, onChangeEntry, source } = props;
  const isEditing = useUserIsEditing(props.spaceId);
  const isRelation = property.dataType === 'RELATION';

  if (isEditing && source.type !== 'RELATIONS') {
    if (isRelation) {
      return (
        <div className="space-y-1">
          <div className="text-metadata text-grey-04">{property.name}</div>
          <EditableRelationsGroup entityId={entityId} spaceId={spaceId} property={property} />
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="text-metadata text-grey-04">{property.name}</div>
          <div className="flex w-full flex-wrap gap-2">
            <EditableValueGroup entityId={entityId} property={property} isEditing={isEditing} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-x-2">
      <RenderedProperty entityId={entityId} property={property} spaceId={spaceId} />
      {/* {props.renderables
        .filter(r => !!r.value)
        .map(renderable => {
          switch (renderable.type) {
            case 'TEXT':
              return (
                <RenderedProperty key={`string-${property.id}-${value}`} renderable={renderable} className="mt-1">
                  <Text variant="tableProperty" color="grey-04" as="p">
                    {value}
                  </Text>
                </RenderedProperty>
              );
            case 'NUMBER':
              return (
                <RenderedProperty
                  key={`${renderable.entityId}-${property.id}-${value}`}
                  renderable={renderable}
                  className="mt-1"
                >
                  <NumberField
                    variant="tableProperty"
                    value={value}
                    // format={renderable.options?.format}
                    unitId={rawValue.options?.unit}
                    isEditing={false}
                  />
                </RenderedProperty>
              );
            case 'CHECKBOX': {
              const checked = getChecked(value);
              return (
                <RenderedProperty key={`checkbox-${property.id}-${value}`} renderable={renderable} className="mt-1">
                  <Checkbox checked={checked} />
                </RenderedProperty>
              );
            }
            case 'TIME': {
              return (
                <RenderedProperty key={`time-${property.id}-${value}`} renderable={renderable} className="mt-1">
                  <DateField variant="tableProperty" isEditing={false} value={value} propertyId={property.id} />
                </RenderedProperty>
              );
            }
            // case 'URL': {
            //   return (
            //     <Property
            //       key={`uri-${property.id}-${value}`}
            //       renderable={renderable}
            //       className="mt-1"
            //     >
            //       <WebUrlField
            //         variant="tableProperty"
            //         isEditing={false}
            //         spaceId={props.spaceId}
            //         value={value}
            //       />
            //     </Property>
            //   );
            // }
            case 'IMAGE':
              // We don't support rendering images in list or gallery views except the main image
              return null;
            case 'RELATION':
              return (
                <RenderedProperty key={`uri-${property.id}-${value}`} renderable={renderable} className="mt-2">
                  <LinkableRelationChip
                    isEditing={false}
                    currentSpaceId={spaceId}
                    entityId={value}
                    spaceId={renderable.spaceId}
                    relationId={renderable.relationId}
                    small
                  >
                    {valueName ?? value}
                  </LinkableRelationChip>
                </RenderedProperty>
              );
          }
        })} */}
    </div>
  );
}

type PropertyProps = {
  entityId: string;
  property: Property;
  spaceId: string;
  className?: string;
};

const RenderedProperty = ({ entityId, property, spaceId }: PropertyProps) => {
  const [isHovered, setIsHovered] = useState<boolean>(false);

  const isRelation = property.dataType === 'RELATION';

  if (property.renderableType === 'IMAGE') {
    // We don't support rendering images in list or gallery views except the main image
    return null;
  }

  return (
    <div
      className={cx('relative inline-block', isRelation ? 'mt-2' : 'mt-1')}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="absolute right-0 top-0 -translate-y-full pb-1">
        <div
          className={cx(
            'rounded-sm bg-black p-1 text-footnoteMedium text-white duration-300 ease-in-out',
            isHovered ? 'opacity-100 delay-700' : 'opacity-0'
          )}
        >
          {property.name}
        </div>
      </div>
      {isRelation ? (
        <EditableRelationsGroup entityId={entityId} spaceId={spaceId} property={property} />
      ) : (
        <EditableValueGroup entityId={entityId} property={property} isEditing={false} />
      )}
    </div>
  );
};

type EditableRelationsGroupProps = {
  spaceId: string;
  entityId: string;
  property: Property;
};

function EditableRelationsGroup({ entityId, spaceId, property }: EditableRelationsGroupProps) {
  const { storage } = useMutate();

  const typeOfId = property.id;
  const typeOfName = property.name;
  const filterSearchByTypes = property?.relationValueTypes ? property?.relationValueTypes : [];
  const firstRelationValueType = property?.relationValueTypes?.[0];

  const relations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.spaceId === spaceId && r.type.id === typeOfId,
  });

  const isEmpty = relations.length === 0;

  if (isEmpty) {
    return (
      <div data-testid="select-entity" className="w-full">
        <SelectEntity
          key={JSON.stringify(filterSearchByTypes)}
          spaceId={spaceId}
          relationValueTypes={filterSearchByTypes}
          onCreateEntity={result => {
            if (firstRelationValueType) {
              storage.relations.set({
                id: Id.generate(),
                entityId: Id.generate(),
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
              id: Id.generate(),
              // @TODO(migration): Reuse entity?
              entityId: Id.generate(),
              spaceId,
              renderableType: 'RELATION',
              toSpaceId: result.space,
              type: {
                id: property.id,
                name: property.name,
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
            });
          }}
          variant="fixed"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2">
      {relations.map(r => {
        const relationId = r.id;
        const relationName = r.toEntity.name;
        const relationValue = r.toEntity.value;

        if (property.renderableType === SystemIds.IMAGE) {
          return (
            <ImageZoom
              variant="table-cell"
              key={`image-${relationId}-${relationValue}`}
              imageSrc={getImagePath(relationValue ?? '')}
            />
          );
        }

        return (
          <>
            <div key={`relation-${relationId}-${relationValue}`} className="mt-2">
              <LinkableRelationChip
                isEditing
                onDelete={() => {
                  storage.relations.delete(r);
                }}
                currentSpaceId={spaceId}
                entityId={relationValue}
                relationId={relationId}
                small
              >
                {relationName ?? relationValue}
              </LinkableRelationChip>
            </div>
          </>
        );
      })}
      {!isEmpty && (
        <div className="mt-2">
          <SelectEntityAsPopover
            trigger={<SquareButton icon={<Create />} />}
            relationValueTypes={filterSearchByTypes}
            onCreateEntity={result => {
              if (firstRelationValueType) {
                storage.relations.set({
                  id: Id.generate(),
                  // @TODO(migration): Reuse entity?
                  entityId: Id.generate(),
                  spaceId,
                  renderableType: 'RELATION',
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
                id: Id.generate(),
                // @TODO(migration): Reuse entity?
                entityId: Id.generate(),
                spaceId,
                renderableType: 'RELATION',
                toSpaceId: result.space,
                type: {
                  id: typeOfId,
                  name: typeOfName,
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
              });
            }}
            spaceId={spaceId}
          />
        </div>
      )}
    </div>
  );
}

type EditableValueGroupProps = {
  entityId: string;
  property: Property;
  isEditing: boolean;
};

function EditableValueGroup({ entityId, property, isEditing }: EditableValueGroupProps) {
  const values = useValues({
    selector: v => v.entity.id === entityId && v.property.id === property.id,
  });

  const renderableType = property.renderableType ?? property.dataType;
  const rawValue = values[0];
  const value = rawValue?.value ?? '';

  switch (renderableType) {
    case 'NUMBER':
      return (
        <NumberField
          variant="tableCell"
          value={value}
          unitId={rawValue.options?.unit}
          // @TODO(migration): Fix format
          // format={renderable.options?.format}
          isEditing={isEditing}
          onChange={value => {
            // onChangeEntry(
            //   {
            //     entityId: renderable.entityId,
            //     entityName: renderable.entityName,
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
            //             unit: rawValue.options?.unit,
            //           },
            //         },
            //       },
            //     },
            //   }
            // );
          }}
        />
      );
    case 'TEXT':
      return (
        <TableStringField
          variant="tableCell"
          placeholder="Add value..."
          value={value}
          onChange={value => {
            // onChangeEntry(
            //   {
            //     entityId: renderable.entityId,
            //     entityName: renderable.entityName,
            //     spaceId: renderable.spaceId,
            //   },
            //   {
            //     type: 'EVENT',
            //     data: {
            //       type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
            //       payload: {
            //         renderable,
            //         value: {
            //           type: 'TEXT',
            //           value: value,
            //         },
            //       },
            //     },
            //   }
            // );
          }}
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
            //     entityId: renderable.entityId,
            //     entityName: renderable.entityName,
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
            //     entityId: renderable.entityId,
            //     entityName: renderable.entityName,
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
    //       key={property.id}
    //       variant="tableCell"
    //       placeholder="Add a URI"
    //       isEditing={true}
    //       spaceId={spaceId}
    //       value={value}
    //       onBlur={e => {
    //         onChangeEntry(
    //           {
    //             entityId: renderable.entityId,
    //             entityName: renderable.entityName,
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
