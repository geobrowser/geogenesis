'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';

import * as React from 'react';

import { useEditEvents } from '~/core/events/edit-events';
import { useRenderables } from '~/core/hooks/use-renderables';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { Relation, RelationRenderableProperty, RenderableProperty, TripleRenderableProperty } from '~/core/types';
import { Triple as ITriple } from '~/core/types';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { EntityTextAutocomplete } from '~/design-system/autocomplete/entity-text-autocomplete';
import { SquareButton } from '~/design-system/button';
import { DeletableChipButton, LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom, PageStringField } from '~/design-system/editable-fields/editable-fields';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { Create } from '~/design-system/icons/create';
import { Trash } from '~/design-system/icons/trash';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { SelectEntity } from '~/design-system/select-entity';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';
import { Text } from '~/design-system/text';

import { getRenderableTypeSelectorOptions } from './get-renderable-type-options';
import { RenderableTypeDropdown } from './renderable-type-dropdown';

interface Props {
  triples: ITriple[];
  id: string;
  spaceId: string;
  relationsOut: Relation[];
}

export function EditableEntityPage({ id, spaceId, triples: serverTriples }: Props) {
  const { renderablesGroupedByAttributeId, addPlaceholderRenderable, removeEmptyPlaceholderRenderable } =
    useRenderables(serverTriples, spaceId);
  const { name } = useEntityPageStore();

  const send = useEditEvents({
    context: {
      entityId: id,
      spaceId,
      entityName: name ?? '',
    },
  });

  useDeriveNewSchemaFromParams();

  return (
    <>
      <div className="rounded-lg border border-grey-02 shadow-button">
        <div className="flex flex-col gap-6 p-5">
          {Object.entries(renderablesGroupedByAttributeId).map(([attributeId, renderables]) => {
            // Triple groups only ever have one renderable
            const firstRenderable = renderables[0];
            const renderableType = firstRenderable.type;

            // @TODO: We can abstract this away. We also don't need to pass in the first renderable to options func.
            const selectorOptions = getRenderableTypeSelectorOptions(firstRenderable, placeholderRenderable => {
              send({ type: 'DELETE_RENDERABLE', payload: { renderable: firstRenderable } });
              addPlaceholderRenderable(placeholderRenderable);
            });

            return (
              <div key={`${id}-${attributeId}`} className="relative break-words">
                <EditableAttribute
                  renderable={firstRenderable}
                  onChange={() => {
                    // If we create a placeholder using the + button the placeholder gets an empty
                    // attribute id. If we then add an attribute the placeholder won't get removed
                    // because the placeholder attribute id is different than the new attribute id.
                    //
                    // Here we manually remove the placeholder when the attribute is changed. This is
                    // a bit of different control flow from how we handle other placeholders, but it's
                    // only necessary on entity pages.
                    if (firstRenderable.placeholder === true && firstRenderable.attributeId === '') {
                      removeEmptyPlaceholderRenderable(firstRenderable);
                    }
                  }}
                />
                {renderableType === 'RELATION' || renderableType === 'IMAGE' ? (
                  <RelationsGroup key={attributeId} relations={renderables as RelationRenderableProperty[]} />
                ) : (
                  <TriplesGroup key={attributeId} triples={renderables as TripleRenderableProperty[]} />
                )}

                <div className="absolute right-0 top-6 flex items-center gap-1">
                  {/* Entity renderables only exist on Relation entities and are not changeable to another renderable type */}
                  {renderableType !== 'ENTITY' && (
                    <>
                      <RenderableTypeDropdown value={renderableType} options={selectorOptions} />

                      {/* Relation renderable types don't render the delete button. Instead you delete each individual relation */}
                      {renderableType !== 'RELATION' && (
                        <SquareButton
                          icon={<Trash />}
                          onClick={() => {
                            send({ type: 'DELETE_RENDERABLE', payload: { renderable: firstRenderable } });
                          }}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-4">
          <SquareButton
            onClick={() => {
              addPlaceholderRenderable({
                type: 'TEXT',
                entityId: id,
                entityName: name ?? '',
                attributeId: '',
                attributeName: null,
                value: '',
                spaceId,
                placeholder: true,
              });
            }}
            icon={<Create />}
          />
        </div>
      </div>
    </>
  );
}

function EditableAttribute({ renderable, onChange }: { renderable: RenderableProperty; onChange: () => void }) {
  const { id, name, spaceId } = useEntityPageStore();

  const send = useEditEvents({
    context: {
      entityId: id,
      spaceId,
      entityName: name ?? '',
    },
  });

  if (renderable.attributeId === '') {
    return (
      <EntityTextAutocomplete
        spaceId={spaceId}
        placeholder="Add attribute..."
        onDone={result => {
          onChange();
          send({
            type: 'UPSERT_ATTRIBUTE',
            payload: { renderable, attributeId: result.id, attributeName: result.name },
          });
        }}
        filterByTypes={[{ typeId: SYSTEM_IDS.ATTRIBUTE, typeName: 'Attribute' }]}
        alreadySelectedIds={[]}
        attributeId={renderable.attributeId}
      />
    );
  }

  return (
    <Link href={NavUtils.toEntity(spaceId, renderable.attributeId)}>
      <Text as="p" variant="bodySemibold">
        {renderable.attributeName ?? renderable.attributeId}
      </Text>
    </Link>
  );
}

function RelationsGroup({ relations }: { relations: RelationRenderableProperty[] }) {
  const { id, name, spaceId } = useEntityPageStore();

  const send = useEditEvents({
    context: {
      entityId: id,
      spaceId,
      entityName: name ?? '',
    },
  });

  const hasPlaceholders = relations.some(r => r.placeholder === true);
  const typeOfId = relations[0].attributeId;
  const typeOfName = relations[0].attributeName;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {relations.map(r => {
        const relationId = r.relationId;
        const relationName = r.valueName;
        const renderableType = r.type;
        const relationValue = r.value;

        if (renderableType === 'IMAGE') {
          return (
            <ImageZoom key={`image-${relationId}-${relationValue}`} imageSrc={getImagePath(relationValue ?? '')} />
          );
        }

        if (r.placeholder === true) {
          return (
            <div key={`relation-select-entity-${relationId}`} data-testid="select-entity" className="w-full">
              <SelectEntity
                spaceId={spaceId}
                onDone={result => {
                  send({
                    type: 'UPSERT_RELATION',
                    payload: {
                      fromEntityId: id,
                      toEntityId: result.id,
                      toEntityName: result.name,
                      typeOfId: r.attributeId,
                      typeOfName: r.attributeName,
                    },
                  });
                }}
                variant="fixed"
              />
            </div>
          );
        }

        return (
          <div key={`relation-${relationId}-${relationValue}`} className="mt-1">
            <LinkableRelationChip
              isEditing
              onDelete={() => {
                send({
                  type: 'DELETE_RENDERABLE',
                  payload: {
                    renderable: r,
                  },
                });
              }}
              entityHref={NavUtils.toEntity(spaceId, relationValue ?? '')}
              relationHref={NavUtils.toEntity(spaceId, relationId)}
            >
              {relationName ?? relationValue}
            </LinkableRelationChip>
          </div>
        );
      })}
      {!hasPlaceholders && (
        <div className="mt-1">
          <SelectEntityAsPopover
            trigger={<SquareButton icon={<Create />} />}
            onDone={result => {
              send({
                type: 'UPSERT_RELATION',
                payload: {
                  fromEntityId: id,
                  toEntityId: result.id,
                  toEntityName: result.name,
                  typeOfId: typeOfId,
                  typeOfName: typeOfName,
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

function TriplesGroup({ triples }: { triples: TripleRenderableProperty[] }) {
  const { id, name, spaceId } = useEntityPageStore();

  const send = useEditEvents({
    context: {
      entityId: id,
      spaceId: spaceId,
      entityName: name ?? '',
    },
  });

  return (
    <div className="flex flex-wrap gap-2">
      {triples.map(renderable => {
        switch (renderable.type) {
          case 'TEXT':
            return (
              <PageStringField
                key={renderable.attributeId}
                variant="body"
                placeholder="Add value..."
                aria-label="text-field"
                value={renderable.value}
                onChange={e => {
                  send({
                    type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                    payload: {
                      renderable,
                      value: {
                        type: 'TEXT',
                        value: e.target.value,
                      },
                    },
                  });
                }}
              />
            );
          case 'CHECKBOX':
            return (
              <input
                type="checkbox"
                key={`checkbox-${renderable.attributeId}-${renderable.value}`}
                checked={renderable.value === '1'}
              />
            );
          case 'TIME':
            return <DateField key={renderable.attributeId} isEditing={true} value={renderable.value} />;
          case 'URI':
            return (
              <WebUrlField
                key={renderable.attributeId}
                placeholder="Add a URI"
                isEditing={true}
                value={renderable.value}
              />
            );
          case 'ENTITY': {
            if (renderable.value.value === '') {
              return (
                <div key={renderable.attributeId} data-testid="select-entity" className="w-full">
                  <SelectEntity
                    spaceId={spaceId}
                    onDone={result => {
                      send({
                        type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                        payload: {
                          renderable,
                          value: {
                            type: 'ENTITY',
                            value: result.id,
                            name: result.name,
                          },
                        },
                      });
                    }}
                    variant="fixed"
                  />
                </div>
              );
            }

            return (
              <div key={`entity-${renderable.value.value}`}>
                <DeletableChipButton
                  href={NavUtils.toEntity(renderable.spaceId, renderable.value.value)}
                  // onClick={() => removeOrResetEntityTriple(triple)}
                >
                  {renderable.value.name || renderable.value.value}
                </DeletableChipButton>
              </div>
            );
          }
        }
      })}
    </div>
  );
}

// const EMPTY_ARRAY_AS_ENCODED_URI = '%5B%5D';

function useDeriveNewSchemaFromParams() {
  // const { subgraph, config } = Services.useServices();
  // const { upsertMany } = useWriteOps();
  // const { id, spaceId, name } = useEntityPageStore();
  // const searchParams = useSearchParams();
  // const encodedAttributes = searchParams?.get('attributes') ?? EMPTY_ARRAY_AS_ENCODED_URI;
  // const attributes = JSON.parse(decodeURI(encodedAttributes));
  // const typeId = searchParams?.get('typeId') ?? null;
  // const send = useEditEvents({
  //   context: {
  //     entityId: id,
  //     spaceId,
  //     entityName: name ?? '',
  //   },
  // });
  // const [hasSetType, setHasSetType] = useState(false);
  // const [hasSetAttributes, setHasSetAttributes] = useState(false);
  // useEffect(() => {
  //   if (hasSetType) return;
  //   const setTypeTriple = async () => {
  //     // @TODO: Abstract to a hook and with useSearchParams instad of passing down the params
  //     if (typeId) {
  //       const typeEntity = await subgraph.fetchEntity({ id: typeId ?? '' });
  //       if (typeEntity) {
  //         send({
  //           type: 'CREATE_ENTITY_TRIPLE_FROM_PLACEHOLDER',
  //           payload: {
  //             attributeId: 'type',
  //             attributeName: 'Types',
  //             entityId: typeEntity.id,
  //             entityName: typeEntity.name || '',
  //           },
  //         });
  //         const templateTriple = typeEntity.triples.find(
  //           triple => triple.attributeId === SYSTEM_IDS.TEMPLATE_ATTRIBUTE
  //         );
  //         if (templateTriple) {
  //           const templateEntity = await subgraph.fetchEntity({ id: templateTriple.value.value ?? '' });
  //           if (templateEntity) {
  //             const newTriples = await cloneEntity({
  //               oldEntityId: templateEntity.id,
  //               entityName: name ?? '',
  //               entityId: id,
  //               spaceId,
  //             });
  //             upsertMany(newTriples, spaceId);
  //           }
  //         }
  //       }
  //     } else if (name === '') {
  //       // @TODO(relations)
  //       send({
  //         type: 'CREATE_ENTITY_TRIPLE',
  //         payload: {
  //           attributeId: 'type',
  //           attributeName: 'Types',
  //         },
  //       });
  //     }
  //   };
  //   setTypeTriple();
  //   setHasSetType(true);
  // }, [hasSetType, send, typeId, config, subgraph, name, upsertMany, spaceId, id]);
  // useEffect(() => {
  //   if (!hasSetType) return;
  //   if (hasSetAttributes) return;
  //   const setAttributesTriples = async () => {
  //     if (!attributes || attributes.length === 0) return;
  //     const attributeEntities = await Promise.all(
  //       attributes.map((filter: Attribute) => {
  //         return Promise.all([
  //           subgraph.fetchEntity({ id: filter[0] ?? '' }),
  //           subgraph.fetchEntity({ id: filter[1] ?? '' }),
  //         ]);
  //       })
  //     );
  //     attributeEntities.forEach((attributeEntities: [Entity | null, Entity | null]) => {
  //       const idEntity = attributeEntities[0];
  //       const valueEntity = attributeEntities[1];
  //       if (!idEntity || !valueEntity) return;
  //       send({
  //         type: 'CREATE_ENTITY_TRIPLE_FROM_PLACEHOLDER',
  //         payload: {
  //           attributeId: idEntity.id,
  //           attributeName: idEntity.name ?? '',
  //           entityId: valueEntity.id,
  //           entityName: valueEntity.name || '',
  //         },
  //       });
  //     });
  //   };
  //   if (attributes && attributes.length > 0) {
  //     setAttributesTriples();
  //   }
  //   setHasSetAttributes(true);
  // }, [hasSetType, hasSetAttributes, subgraph, config, send, attributes]);
}
