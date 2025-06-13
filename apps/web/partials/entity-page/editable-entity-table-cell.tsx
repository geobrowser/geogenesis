import { SystemIds } from '@graphprotocol/grc-20';

import { Source } from '~/core/blocks/data/source';
import { Entities } from '~/core/utils/entity';
import { getImagePath } from '~/core/utils/utils';
import { RelationRenderableProperty, RenderableProperty } from '~/core/v2.types';
import type { RelationValueType } from '~/core/v2.types';

import { SquareButton } from '~/design-system/button';
import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { PageStringField } from '~/design-system/editable-fields/editable-fields';
import { ImageZoom, TableStringField } from '~/design-system/editable-fields/editable-fields';
import { NumberField } from '~/design-system/editable-fields/number-field';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { Create } from '~/design-system/icons/create';
import { SelectEntity } from '~/design-system/select-entity';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';

import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { CollectionMetadata } from '~/partials/blocks/table/collection-metadata';

type Props = {
  entityId: string;
  spaceId: string;
  attributeId: string;
  renderables: RenderableProperty[];
  filterSearchByTypes?: RelationValueType[];
  isPlaceholderRow: boolean;
  name: string | null;
  currentSpaceId: string;
  collectionId?: string;
  relationId?: string;
  verified?: boolean;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  source: Source;
};

export function EditableEntityTableCell({
  entityId,
  spaceId,
  attributeId,
  renderables,
  filterSearchByTypes,
  isPlaceholderRow,
  name,
  currentSpaceId,
  collectionId,
  relationId,
  verified,
  onChangeEntry,
  onLinkEntry,
  source,
}: Props) {
  const entityName = Entities.nameFromRenderable(renderables) ?? '';

  const isNameCell = attributeId === SystemIds.NAME_PROPERTY;

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
                entityName: entityName,
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
                entityName: entityName,
                spaceId: spaceId,
              },
              {
                type: 'Find',
                data: result,
              }
            );
          }}
          spaceId={spaceId}
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
            currentSpaceId={currentSpaceId}
            entityId={entityId}
            spaceId={spaceId}
            collectionId={collectionId}
            relationId={relationId}
            verified={verified}
            onLinkEntry={onLinkEntry}
          >
            <PageStringField
              variant="tableCell"
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
                          attributeId: SystemIds.NAME_PROPERTY,
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

  const firstRenderable = renderables[0] as RenderableProperty | undefined;
  const isRelation = firstRenderable?.type === 'RELATION' || firstRenderable?.type === 'IMAGE';

  if (isRelation) {
    const hasPlaceholders = renderables.some(r => r.placeholder === true);
    const typeOfId = firstRenderable.propertyId;
    const typeOfName = firstRenderable.propertyName;
    const relationRenderables = renderables as RelationRenderableProperty[];

    return (
      <div className="flex flex-wrap items-center gap-2">
        {relationRenderables.map(r => {
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
              <div key={`${r.fromEntityId}-${r.propertyId}-${r.value}`} data-testid="select-entity" className="w-full">
                <SelectEntity
                  key={JSON.stringify(filterSearchByTypes)}
                  spaceId={spaceId}
                  relationValueTypes={filterSearchByTypes}
                  onDone={result => {
                    onChangeEntry(
                      {
                        entityId,
                        entityName,
                        spaceId: r.spaceId,
                      },
                      {
                        type: 'EVENT',
                        data: {
                          type: 'UPSERT_RELATION',
                          payload: {
                            fromEntityId: entityId,
                            fromEntityName: entityName,
                            toEntityId: result.id,
                            toEntityName: result.name,
                            typeOfId: r.propertyId,
                            typeOfName: r.propertyName,
                          },
                        },
                      }
                    );
                  }}
                  variant="fixed"
                />
              </div>
            );
          }

          return (
            <>
              <div key={`relation-${relationId}-${relationValue}`} className="mt-1">
                <LinkableRelationChip
                  isEditing
                  onDelete={() => {
                    onChangeEntry(
                      {
                        entityId,
                        entityName,
                        spaceId: r.spaceId,
                      },
                      {
                        type: 'EVENT',
                        data: {
                          type: 'DELETE_RELATION',
                          payload: {
                            renderable: r,
                          },
                        },
                      }
                    );
                  }}
                  currentSpaceId={spaceId}
                  entityId={relationValue}
                  relationId={relationId}
                >
                  {relationName ?? relationValue}
                </LinkableRelationChip>
              </div>
            </>
          );
        })}
        {!hasPlaceholders && (
          <div className="mt-1">
            <SelectEntityAsPopover
              key={JSON.stringify(filterSearchByTypes)}
              trigger={<SquareButton icon={<Create />} />}
              relationValueTypes={filterSearchByTypes}
              onDone={result => {
                onChangeEntry(
                  {
                    entityId,
                    entityName,
                    spaceId: spaceId,
                  },
                  {
                    type: 'EVENT',
                    data: {
                      type: 'UPSERT_RELATION',
                      payload: {
                        fromEntityId: entityId,
                        fromEntityName: entityName,
                        toEntityId: result.id,
                        toEntityName: result.name,
                        typeOfId: typeOfId,
                        typeOfName: typeOfName,
                      },
                    },
                  }
                );
              }}
              spaceId={spaceId}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-wrap gap-2">
      {renderables.map(renderable => {
        switch (renderable.type) {
          case 'NUMBER':
            return (
              <NumberField
                variant="tableCell"
                isEditing={true}
                key={`${renderable.entityId}-${renderable.propertyId}-${renderable.value}`}
                value={renderable.value}
                // @TODO(migration): Fix formatting
                // format={renderable.options?.format}
                unitId={renderable.options?.unit}
                onChange={value =>
                  onChangeEntry(
                    {
                      entityId,
                      entityName,
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
                  )
                }
              />
            );
          case 'TEXT':
            return (
              <TableStringField
                key={`${renderable.entityId}-${renderable.propertyId}-${renderable.value}`}
                placeholder="Add value..."
                value={renderable.value}
                onChange={value =>
                  onChangeEntry(
                    {
                      entityId,
                      entityName,
                      spaceId: renderable.spaceId,
                    },
                    {
                      type: 'EVENT',
                      data: {
                        type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                        payload: { renderable, value: { type: 'TEXT', value: value } },
                      },
                    }
                  )
                }
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
                      entityId,
                      entityName,
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
                // format={renderable.options?.format}
                onBlur={value => {
                  onChangeEntry(
                    {
                      entityId,
                      entityName,
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
      })}
    </div>
  );
}
