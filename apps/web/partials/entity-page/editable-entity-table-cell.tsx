import { SystemIds } from '@graphprotocol/grc-20';

import { useSource } from '~/core/blocks/data/use-source';
import { RelationRenderableProperty, RenderableProperty, TripleRenderableProperty } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { NavUtils, getImagePath } from '~/core/utils/utils';

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

import { onChangeEntryFn } from '../blocks/table/change-entry';

interface Props {
  entityId: string;
  attributeId: string;
  spaceId: string;
  renderables: RenderableProperty[];
  filterSearchByTypes?: string[];
  onChangeEntry: onChangeEntryFn;
  isPlaceholderRow: boolean;
}

export function EditableEntityTableCell({
  spaceId,
  entityId,
  attributeId,
  renderables,
  filterSearchByTypes,
  onChangeEntry,
  isPlaceholderRow,
}: Props) {
  const entityName = Entities.nameFromRenderable(renderables) ?? '';
  const { source } = useSource();

  const isNameCell = attributeId === SystemIds.NAME_ATTRIBUTE;

  if (isNameCell) {
    // This should exist as there should be a placeholder that exists if no
    // "real" renderable for name exists yet.
    // /
    // You might have multiple renderables across multiple spaces. In cases where we only render one,
    // default to the one in the current space.
    const renderableInSpace = renderables.find(r => r.spaceId === spaceId) as TripleRenderableProperty | undefined;
    const renderable = renderableInSpace ?? (renderables[0] as TripleRenderableProperty);

    // We only allow FOC for collections.
    if (isPlaceholderRow && source.type === 'COLLECTION') {
      return (
        <SelectEntity
          // What actually happens here? We create a link to the entity for the source?
          // If the entity already exists then it should be a text block instead of the
          // search experience
          onDone={result => {
            // If the source type is query we shouldn't use FOC and instead just show the name
            onChangeEntry(
              {
                entityId: entityId,
                entityName: entityName,
                spaceId: spaceId,
              },
              {
                type: 'FOC',
                data: result,
              }
            );
          }}
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
                type: 'FOC',
                data: result,
              }
            );
          }}
          spaceId={spaceId}
          allowedTypes={[]}
        />
      );
    }

    return (
      <TableStringField
        placeholder="Entity name..."
        value={entityName}
        onBlur={e => {
          onChangeEntry(
            {
              entityId,
              spaceId: renderable.spaceId,
              entityName,
            },
            {
              type: 'EVENT',
              data: {
                type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                payload: { renderable, value: { type: 'TEXT', value: e.currentTarget.value } },
              },
            }
          );
        }}
      />
    );
  }

  const firstRenderable = renderables[0] as RenderableProperty | undefined;
  const isRelation = firstRenderable?.type === 'RELATION' || firstRenderable?.type === 'IMAGE';

  if (isRelation) {
    const hasPlaceholders = renderables.some(r => r.placeholder === true);
    const typeOfId = firstRenderable.attributeId;
    const typeOfName = firstRenderable.attributeName;
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
              <div key={`${r.entityId}-${r.attributeId}-${r.value}`} data-testid="select-entity" className="w-full">
                <SelectEntity
                  spaceId={spaceId}
                  allowedTypes={filterSearchByTypes}
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
                            typeOfId: r.attributeId,
                            typeOfName: r.attributeName,
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
                  entityHref={NavUtils.toEntity(spaceId, relationValue ?? '')}
                  relationHref={NavUtils.toEntity(spaceId, relationId)}
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
              trigger={<SquareButton icon={<Create />} />}
              allowedTypes={filterSearchByTypes}
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
                key={`${renderable.entityId}-${renderable.attributeId}-${renderable.value}`}
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
                        payload: {
                          renderable,
                          value: {
                            type: 'NUMBER',
                            value: value,
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
                key={`${renderable.entityId}-${renderable.attributeId}-${renderable.value}`}
                placeholder="Add value..."
                value={renderable.value}
                onBlur={e =>
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
                        payload: { renderable, value: { type: 'TEXT', value: e.currentTarget.value } },
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
                key={`checkbox-${renderable.attributeId}-${renderable.value}`}
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
                key={renderable.attributeId}
                isEditing={true}
                value={renderable.value}
                format={renderable.options?.format}
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
          case 'URL':
            return (
              <WebUrlField
                key={renderable.attributeId}
                placeholder="Add a URI"
                isEditing={true}
                spaceId={spaceId}
                value={renderable.value}
                onBlur={e => {
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
                            type: 'URL',
                            value: e.currentTarget.value,
                          },
                        },
                      },
                    }
                  );
                }}
              />
            );
        }
      })}
    </div>
  );
}
