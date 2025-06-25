import { Id, SystemIds } from '@graphprotocol/grc-20';
import cx from 'classnames';

import type { ReactNode } from 'react';
import { useState } from 'react';

import { Source } from '~/core/blocks/data/source';
import { PropertyId } from '~/core/hooks/use-properties';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useMutate } from '~/core/sync/use-mutate';
import { getImagePath } from '~/core/utils/utils';
import { PropertySchema, RelationRenderableProperty, RenderableProperty } from '~/core/v2.types';

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
  renderables: RenderableProperty[];
  spaceId: string;
  entityId: string;
  properties?: Record<PropertyId, PropertySchema>;
  onChangeEntry: onChangeEntryFn;
  source: Source;
}) {
  const { renderables, spaceId, entityId, properties, onChangeEntry, source } = props;
  const isEditing = useUserIsEditing(props.spaceId);

  if (isEditing && source.type !== 'RELATIONS') {
    const firstRenderable = renderables[0] as RenderableProperty | undefined;
    const isRelation = firstRenderable?.type === 'RELATION' || firstRenderable?.type === 'IMAGE';

    if (isRelation) {
      return (
        <div className="space-y-1">
          <div className="text-metadata text-grey-04">{firstRenderable.propertyName}</div>
          <RelationsGroup
            isPlaceholderEntry={true}
            entityId={entityId}
            spaceId={spaceId}
            renderables={renderables as RelationRenderableProperty[]}
            entityName={null}
            properties={properties}
          />
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="text-metadata text-grey-04">{firstRenderable?.propertyName}</div>
          <div className="flex w-full flex-wrap gap-2">
            {renderables.map(renderable => {
              switch (renderable.type) {
                case 'NUMBER':
                  return (
                    <NumberField
                      key={`${renderable.entityId}-${renderable.propertyId}-${renderable.value}`}
                      variant="tableCell"
                      value={renderable.value}
                      unitId={renderable.options?.unit}
                      // @TODO(migration): Fix format
                      // format={renderable.options?.format}
                      isEditing={isEditing}
                      onChange={value => {
                        onChangeEntry(
                          {
                            entityId: renderable.entityId,
                            entityName: renderable.entityName,
                            spaceId: renderable.spaceId,
                          },
                          {
                            type: 'EVENT',
                            data: {
                              type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                              payload: {
                                renderable,
                                value: {
                                  type: 'NUMBER',
                                  value: value,
                                  options: {
                                    // format: renderable.options?.format,
                                    unit: renderable.options?.unit,
                                  },
                                },
                              },
                            },
                          }
                        );
                      }}
                    />
                  );
                case 'TEXT':
                  return (
                    <TableStringField
                      key={`${renderable.entityId}-${renderable.propertyId}-${renderable.value}`}
                      variant="tableCell"
                      placeholder="Add value..."
                      value={renderable.value}
                      onChange={value => {
                        onChangeEntry(
                          {
                            entityId: renderable.entityId,
                            entityName: renderable.entityName,
                            spaceId: renderable.spaceId,
                          },
                          {
                            type: 'EVENT',
                            data: {
                              type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                              payload: {
                                renderable,
                                value: {
                                  type: 'TEXT',
                                  value: value,
                                },
                              },
                            },
                          }
                        );
                      }}
                    />
                  );
                case 'CHECKBOX': {
                  const checked = getChecked(renderable.value);
                  return (
                    <Checkbox
                      key={`checkbox-${renderable.propertyId}-${renderable.value}`}
                      checked={checked}
                      onChange={() => {
                        onChangeEntry(
                          {
                            entityId: renderable.entityId,
                            entityName: renderable.entityName,
                            spaceId: renderable.spaceId,
                          },
                          {
                            type: 'EVENT',
                            data: {
                              type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                              payload: {
                                renderable,
                                value: {
                                  type: 'CHECKBOX',
                                  value: !checked ? '1' : '0',
                                },
                              },
                            },
                          }
                        );
                      }}
                    />
                  );
                }
                case 'TIME':
                  return (
                    <DateField
                      key={renderable.propertyId}
                      isEditing={true}
                      value={renderable.value}
                      propertyId={renderable.propertyId}
                      onBlur={value => {
                        onChangeEntry(
                          {
                            entityId: renderable.entityId,
                            entityName: renderable.entityName,
                            spaceId: renderable.spaceId,
                          },
                          {
                            type: 'EVENT',
                            data: {
                              type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                              payload: {
                                renderable,
                                value: {
                                  type: 'TIME',
                                  value: value.value,
                                  options: {
                                    format: value.format,
                                  },
                                },
                              },
                            },
                          }
                        );
                      }}
                    />
                  );
                // case 'URL':
                //   return (
                //     <WebUrlField
                //       key={renderable.propertyId}
                //       variant="tableCell"
                //       placeholder="Add a URI"
                //       isEditing={true}
                //       spaceId={spaceId}
                //       value={renderable.value}
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
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-x-2">
      {props.renderables
        .filter(r => !!r.value)
        .map(renderable => {
          switch (renderable.type) {
            case 'TEXT':
              return (
                <Property
                  key={`string-${renderable.propertyId}-${renderable.value}`}
                  renderable={renderable}
                  className="mt-1"
                >
                  <Text variant="tableProperty" color="grey-04" as="p">
                    {renderable.value}
                  </Text>
                </Property>
              );
            case 'NUMBER':
              return (
                <Property
                  key={`${renderable.entityId}-${renderable.propertyId}-${renderable.value}`}
                  renderable={renderable}
                  className="mt-1"
                >
                  <NumberField
                    variant="tableProperty"
                    value={renderable.value}
                    // format={renderable.options?.format}
                    unitId={renderable.options?.unit}
                    isEditing={false}
                  />
                </Property>
              );
            case 'CHECKBOX': {
              const checked = getChecked(renderable.value);
              return (
                <Property
                  key={`checkbox-${renderable.propertyId}-${renderable.value}`}
                  renderable={renderable}
                  className="mt-1"
                >
                  <Checkbox checked={checked} />
                </Property>
              );
            }
            case 'TIME': {
              return (
                <Property
                  key={`time-${renderable.propertyId}-${renderable.value}`}
                  renderable={renderable}
                  className="mt-1"
                >
                  <DateField
                    variant="tableProperty"
                    isEditing={false}
                    value={renderable.value}
                    propertyId={renderable.propertyId}
                  />
                </Property>
              );
            }
            // case 'URL': {
            //   return (
            //     <Property
            //       key={`uri-${renderable.propertyId}-${renderable.value}`}
            //       renderable={renderable}
            //       className="mt-1"
            //     >
            //       <WebUrlField
            //         variant="tableProperty"
            //         isEditing={false}
            //         spaceId={props.spaceId}
            //         value={renderable.value}
            //       />
            //     </Property>
            //   );
            // }
            case 'IMAGE':
              // We don't support rendering images in list or gallery views except the main image
              return null;
            case 'RELATION':
              return (
                <Property
                  key={`uri-${renderable.propertyId}-${renderable.value}`}
                  renderable={renderable}
                  className="mt-2"
                >
                  <LinkableRelationChip
                    isEditing={false}
                    currentSpaceId={spaceId}
                    entityId={renderable.value}
                    spaceId={renderable.spaceId}
                    relationId={renderable.relationId}
                    small
                  >
                    {renderable.valueName ?? renderable.value}
                  </LinkableRelationChip>
                </Property>
              );
          }
        })}
    </div>
  );
}

type PropertyProps = {
  renderable: RenderableProperty;
  className?: string;
  children: ReactNode;
};

const Property = ({ renderable, className = '', children }: PropertyProps) => {
  const [isHovered, setIsHovered] = useState<boolean>(false);

  return (
    <div
      className={cx('relative inline-block', className)}
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
          {renderable.propertyName}
        </div>
      </div>
      {children}
    </div>
  );
};

type RelationsGroupProps = {
  spaceId: string;
  entityId: string;
  entityName: string | null;
  renderables: RelationRenderableProperty[];
  isPlaceholderEntry: boolean;
  properties?: Record<PropertyId, PropertySchema>;
};

function RelationsGroup({ renderables, entityId, spaceId, entityName, properties }: RelationsGroupProps) {
  const firstRenderable = renderables[0];
  const hasPlaceholders = renderables.some(r => r.placeholder === true);
  const typeOfId = firstRenderable.propertyId;
  const typeOfName = firstRenderable.propertyName;
  const { storage } = useMutate();

  const property = properties?.[PropertyId(typeOfId)];
  const filterSearchByTypes = property?.relationValueTypeId
    ? [
        {
          typeId: property.relationValueTypeId,
          typeName: property?.relationValueTypeName ?? null,
        },
      ]
    : [];

  return (
    <div className="flex flex-wrap items-center gap-x-2">
      {renderables.map(r => {
        const relationId = r.relationId;
        const relationName = r.valueName;
        const renderableType = r.type;
        const relationValue = r.value;

        if (renderableType === 'IMAGE') {
          return (
            <ImageZoom
              variant="table-cell"
              key={`image-${relationId}-${relationValue}`}
              imageSrc={getImagePath(relationValue ?? '')}
            />
          );
        }

        if (r.placeholder === true) {
          return (
            <div
              key={`${r.relationEntityId}-${r.propertyId}-${r.value}`}
              data-testid="select-entity"
              className="w-full"
            >
              <SelectEntity
                key={JSON.stringify(filterSearchByTypes)}
                spaceId={spaceId}
                relationValueTypes={filterSearchByTypes}
                onCreateEntity={result => {
                  if (property?.relationValueTypeId) {
                    storage.relations.set({
                      id: Id.generate(),
                      entityId: r.relationEntityId,
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
                        id: property.relationValueTypeId,
                        name: property.relationValueTypeName ?? null,
                        value: property.relationValueTypeId,
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
                      id: r.propertyId,
                      name: r.propertyName,
                    },
                    fromEntity: {
                      id: entityId,
                      name: entityName,
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
          <>
            <div key={`relation-${relationId}-${relationValue}`} className="mt-2">
              <LinkableRelationChip
                isEditing
                onDelete={() => {
                  storage.renderables.relations.delete(r);
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
      {!hasPlaceholders && (
        <div className="mt-2">
          <SelectEntityAsPopover
            trigger={<SquareButton icon={<Create />} />}
            relationValueTypes={filterSearchByTypes}
            onCreateEntity={result => {
              if (property?.relationValueTypeId) {
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
                    id: property.relationValueTypeId,
                    name: property.relationValueTypeName ?? null,
                    value: property.relationValueTypeId,
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
                  name: entityName,
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
