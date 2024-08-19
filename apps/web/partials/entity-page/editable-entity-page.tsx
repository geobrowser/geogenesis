'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
import { pipe } from 'effect';

import * as React from 'react';

import { useTriples } from '~/core/database/triples';
import { useEditEvents } from '~/core/events/edit-events';
import { Relation } from '~/core/io/dto/entities';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { RelationRenderableProperty, RenderableProperty, TripleRenderableProperty } from '~/core/types';
import { Triple as ITriple } from '~/core/types';
import { toRenderables } from '~/core/utils/to-renderables';
import { NavUtils, getImagePath, groupBy } from '~/core/utils/utils';

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
import { Text } from '~/design-system/text';

import { sortRenderables } from './entity-page-utils';
import { getRenderableTypeSelectorOptions } from './get-renderable-type-options';
import { RenderableTypeDropdown } from './renderable-type-dropdown';

interface Props {
  triples: ITriple[];
  id: string;
  spaceId: string;
  relationsOut: Relation[];
}

export function EditableEntityPage({ id, spaceId, triples: serverTriples }: Props) {
  const { triples: localTriples, relations, schema, name } = useEntityPageStore();

  useDeriveNewSchemaFromParams();

  const triplesFromSpace = useTriples(
    React.useMemo(() => {
      return {
        selector: t => t.space === spaceId,
      };
    }, [spaceId])
  );

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  //
  // There may be some deleted triples locally. We check the actions to make sure that there are
  // actually 0 actions in the case that there are 0 local triples as the local triples here
  // are only the ones where `isDeleted` is false.
  const triples = localTriples.length === 0 && triplesFromSpace.length === 0 ? serverTriples : localTriples;

  const send = useEditEvents({
    context: {
      entityId: id,
      spaceId,
      entityName: name ?? '',
    },
  });

  // @TODO: Not sure if we're creating a triple or a relation or something else. We need
  // some sort of placeholder field that isn't yet written to the database.
  const onCreateNewTriple = () => send({ type: 'CREATE_NEW_TRIPLE' });

  // The schema for a given set of types define the expected attributes and relations for
  // any entities with those types. We want to show any properties from the schema that
  // aren't already set on the entity.
  const attributesWithAValue = new Set([...triples.map(t => t.attributeId), ...relations.map(r => r.typeOf.id)]);

  // Make some fake triples derived from the schema. We later hide and show these depending
  // on if the entity has filled these fields or not.
  // @TODO: We need to know the schema value type to know the type of renderable we need
  // to show. We can default to TEXT for now.
  const schemaTriples = schema
    .map(
      (s): ITriple => ({
        attributeId: s.id,
        entityId: id,
        entityName: name,
        space: spaceId,
        attributeName: s.name,

        value: {
          type: 'TEXT',
          value: '',
        },
      })
    )
    // Filter out schema renderables if we already have a triple or relation for that attribute
    .filter(renderable => !attributesWithAValue.has(renderable.attributeId));

  console.log('relations + triples', {
    relations: relations.filter(r => r.typeOf.id !== SYSTEM_IDS.BLOCKS),
    triples,
  });

  const renderablesGroupedByAttributeId = pipe(
    toRenderables(
      [...triples, ...schemaTriples],
      // We don't show blocks in the data section
      relations.filter(r => r.typeOf.id !== SYSTEM_IDS.BLOCKS),
      spaceId
    ),
    renderables => sortRenderables(renderables),
    sortedRenderables => groupBy(sortedRenderables, r => r.attributeId)
  );

  return (
    <>
      {/* @TODO: Unify the component between the readable and editable pages */}
      <div className="rounded-lg border border-grey-02 shadow-button">
        <div className="flex flex-col gap-6 p-5">
          {Object.entries(renderablesGroupedByAttributeId).map(([attributeId, renderables]) => {
            // Triple groups only ever have one renderable
            const firstRenderable = renderables[0];
            const renderableType = firstRenderable.type;

            const selectorOptions = getRenderableTypeSelectorOptions(firstRenderable, send);

            return (
              <div key={`${id}-${attributeId}`} className="relative break-words">
                <EditableAttribute renderable={firstRenderable} />
                {renderableType === 'RELATION' ? (
                  // @TODO: Empty selectable field if relations are empty
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
          <SquareButton onClick={onCreateNewTriple} icon={<Create />} />
        </div>
      </div>
    </>
  );
}

function EditableAttribute({ renderable }: { renderable: RenderableProperty }) {
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
  const spaceId = relations[0].spaceId;

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

        return (
          <div key={`relation-${relationId}-${relationValue}`} className="mt-1">
            <LinkableRelationChip
              entityHref={NavUtils.toEntity(spaceId, relationValue ?? '')}
              relationHref={NavUtils.toEntity(spaceId, relationId)}
            >
              {relationName ?? relationId}
            </LinkableRelationChip>
          </div>
        );
      })}
      <div className="mt-1">
        <SquareButton
          onClick={() => {
            //
          }}
          icon={<Create />}
        />
      </div>
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
          case 'TIME':
            return <DateField isEditing={true} value={renderable.value} />;
          case 'URI':
            return <WebUrlField placeholder="Add a URI" isEditing={true} value={renderable.value} />;
          case 'ENTITY': {
            if (renderable.value.value === '') {
              return (
                <div data-testid="select-entity" className="w-full">
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
                    wrapperClassName="contents"
                    inputClassName="m-0 -mb-[1px] block w-full resize-none bg-transparent p-0 text-body placeholder:text-grey-02 focus:outline-none"
                    resultsClassName="absolute z-[1000]"
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
