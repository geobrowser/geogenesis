'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';

import * as React from 'react';
import { useEffect, useState } from 'react';

import { useEditEvents } from '~/core/events/edit-events';
import { useActionsStore } from '~/core/hooks/use-actions-store';
import { Services } from '~/core/services';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import type {
  EntitySearchResult,
  Entity as EntityType,
  Triple,
  TripleWithCollectionValue,
  TripleWithEntityValue,
} from '~/core/types';
import { Triple as ITriple, RelationValueTypesByAttributeId, ValueType as TripleValueType } from '~/core/types';
import { cloneEntity } from '~/core/utils/contracts/clone-entity';
import { Entities } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { EntityAutocompleteDialog } from '~/design-system/autocomplete/entity-autocomplete';
import { EntityTextAutocomplete } from '~/design-system/autocomplete/entity-text-autocomplete';
import { SquareButton } from '~/design-system/button';
import { DeletableChipButton } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { PageImageField, PageStringField } from '~/design-system/editable-fields/editable-fields';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { CogSmall } from '~/design-system/icons/cog-small';
import { Create } from '~/design-system/icons/create';
import { Date } from '~/design-system/icons/date';
import { Image } from '~/design-system/icons/image';
import { Relation } from '~/design-system/icons/relation';
import { Text as TextIcon } from '~/design-system/icons/text';
import { Trash } from '~/design-system/icons/trash';
import { Url } from '~/design-system/icons/url';
import { SelectEntity } from '~/design-system/select-entity';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';

import { AttributeConfigurationMenu } from './attribute-configuration-menu';
import { sortEntityPageTriples } from './entity-page-utils';
import { TripleTypeDropdown } from './triple-type-dropdown';

interface Props {
  triples: ITriple[];
  id: string;
  spaceId: string;
  typeId?: string | null;
  attributes?: Array<Attribute> | null;
}

type Attribute = [AttributeId, AttributeValue];
type AttributeId = string;
type AttributeValue = string;

export function EditableEntityPage({ id, spaceId, triples: serverTriples, typeId, attributes }: Props) {
  const {
    triples: localTriples,
    schemaTriples,
    hideSchema,
    hiddenSchemaIds,
    attributeRelationTypes,
  } = useEntityPageStore();

  const { remove, upsert, upsertMany } = useActionsStore();

  const { actionsFromSpace } = useActionsStore(spaceId);
  const { subgraph, config } = Services.useServices();

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  //
  // There may be some deleted triples locally. We check the actions to make sure that there are
  // actually 0 actions in the case that there are 0 local triples as the local triples here
  // are only the ones where `isDeleted` is false.
  const triples = localTriples.length === 0 && actionsFromSpace.length === 0 ? serverTriples : localTriples;

  // Always default to the local state for the name
  const name = Entities.name(triples) ?? '';

  const send = useEditEvents({
    context: {
      entityId: decodeURIComponent(id),
      spaceId,
      entityName: name,
    },
    api: {
      upsert,
      remove,
      upsertMany,
    },
  });

  const onCreateNewTriple = () => send({ type: 'CREATE_NEW_TRIPLE' });

  const [hasSetType, setHasSetType] = useState(false);
  const [hasSetAttributes, setHasSetAttributes] = useState(false);

  useEffect(() => {
    if (hasSetType) return;

    const setTypeTriple = async () => {
      if (typeId) {
        const typeEntity = await subgraph.fetchEntity({ id: typeId ?? '' });

        if (typeEntity) {
          send({
            type: 'CREATE_ENTITY_TRIPLE_FROM_PLACEHOLDER',
            payload: {
              attributeId: 'type',
              attributeName: 'Types',
              entityId: typeEntity.id,
              entityName: typeEntity.name || '',
            },
          });

          const templateTriple = typeEntity.triples.find(
            triple => triple.attributeId === SYSTEM_IDS.TEMPLATE_ATTRIBUTE
          );

          if (templateTriple) {
            const templateEntity = await subgraph.fetchEntity({ id: templateTriple.value.value ?? '' });

            if (templateEntity) {
              const newTriples = await cloneEntity({
                oldEntityId: templateEntity.id,
                entityName: name,
                entityId: id,
                spaceId,
              });

              upsertMany(
                newTriples.map(t => {
                  return {
                    op: { ...t, type: 'SET_TRIPLE' },
                    spaceId: spaceId,
                  };
                })
              );
            }
          }
        }
      } else if (name === '') {
        send({
          type: 'CREATE_ENTITY_TRIPLE',
          payload: {
            attributeId: 'type',
            attributeName: 'Types',
          },
        });
      }
    };

    setTypeTriple();

    setHasSetType(true);
  }, [hasSetType, send, typeId, config, subgraph, name, upsertMany, spaceId, id]);

  useEffect(() => {
    if (!hasSetType) return;
    if (hasSetAttributes) return;

    const setAttributesTriples = async () => {
      if (!attributes || attributes.length === 0) return;

      const attributeEntities = await Promise.all(
        attributes.map((filter: Attribute) => {
          return Promise.all([
            subgraph.fetchEntity({ id: filter[0] ?? '' }),
            subgraph.fetchEntity({ id: filter[1] ?? '' }),
          ]);
        })
      );

      attributeEntities.forEach((attributeEntities: [EntityType | null, EntityType | null]) => {
        const idEntity = attributeEntities[0];
        const valueEntity = attributeEntities[1];

        if (!idEntity || !valueEntity) return;

        send({
          type: 'CREATE_ENTITY_TRIPLE_FROM_PLACEHOLDER',
          payload: {
            attributeId: idEntity.id,
            attributeName: idEntity.name ?? '',
            entityId: valueEntity.id,
            entityName: valueEntity.name || '',
          },
        });
      });
    };

    if (attributes && attributes.length > 0) {
      setAttributesTriples();
    }

    setHasSetAttributes(true);
  }, [hasSetType, hasSetAttributes, subgraph, config, send, attributes]);

  return (
    <>
      <div className="rounded-lg border border-grey-02 shadow-button">
        <div className="flex flex-col gap-6 p-5">
          <EntityAttributes
            entityId={id}
            triples={triples}
            schemaTriples={schemaTriples}
            name={name}
            send={send}
            hideSchema={hideSchema}
            hiddenSchemaIds={hiddenSchemaIds}
            allowedTypes={attributeRelationTypes}
            spaceId={spaceId}
          />
        </div>
        <div className="p-4">
          <SquareButton onClick={onCreateNewTriple} icon={<Create />}>
            Add triple
          </SquareButton>
        </div>
      </div>
    </>
  );
}

function EntityAttributes({
  entityId,
  triples,
  schemaTriples = [],
  name,
  send,
  hideSchema,
  hiddenSchemaIds,
  allowedTypes,
  spaceId,
}: {
  entityId: string;
  triples: ITriple[];
  schemaTriples: ITriple[];
  send: ReturnType<typeof useEditEvents>;
  name: string;
  hideSchema: (id: string) => void;
  hiddenSchemaIds: string[];
  allowedTypes: RelationValueTypesByAttributeId;
  spaceId: string;
}) {
  /**
   * All the things this component is doing
   * 1. Aggregating all of the entity value ids for every entity triple
   * 2. Filtering out NAME and DESCRIPTION triples from the list since we render those uniquely
   *    from the other attributes.
   * 3. Group all of the visible, sorted triples by their attribute id so we can render them all
   *    together. We sort the triples based on how we want to order them in the list.
   * 4. Aggregate all entity value triple ids so we can make sure we don't return those already-
   *    selected values in the entity search results.
   */
  const tripleAttributeIds = triples.map(triple => triple.attributeId);

  const visibleSchemaTriples = schemaTriples.filter(schemaTriple => {
    const notHidden = !hiddenSchemaIds.includes(schemaTriple.attributeId);
    const notInTriples = !tripleAttributeIds.includes(schemaTriple.attributeId);
    return notHidden && notInTriples;
  });

  const visibleTriples = [...triples, ...visibleSchemaTriples];

  // @TODO: Should work with collections
  // We use these later to check which entities have already been selected as one
  // of the values of a triple/collection. We filter out any already selected
  // entity ids in the search result list so you don't add the same value more
  // than once.
  const entityValueTriples = triples.filter(
    (triple): triple is TripleWithEntityValue => triple.value.type === 'ENTITY'
  );

  // Some triples are rendered outside of the normal attribute list to better control their styling.
  const filteredAttributeIds = [SYSTEM_IDS.NAME, SYSTEM_IDS.DESCRIPTION];
  const sortedTriples = sortEntityPageTriples(visibleTriples, schemaTriples).filter(
    triple => !filteredAttributeIds.includes(triple.attributeId)
  );

  // There's only one triple per attribute when viewing an entity within a single space.
  const groupedTriplesByAttributeId = sortedTriples.reduce(
    (map, triple) => {
      map[triple.attributeId] = triple;
      return map;
    },
    {} as Record<string, Triple>
  );

  const orderedGroupedTriples = Object.entries(groupedTriplesByAttributeId);

  const nameTriple = Entities.nameTriple(triples);
  const descriptionTriple = Entities.descriptionTriple(triples);
  const description = Entities.description(triples);

  const onChangeTriple = (type: TripleValueType, triple: ITriple) => {
    send({
      type: 'CHANGE_TRIPLE_TYPE',
      payload: {
        type,
        triple,
      },
    });
  };

  const removeOrResetEntityTriple = (triple: ITriple) => {
    hideSchema(triple.attributeId);
    send({
      type: 'DELETE_ENTITY_TRIPLE',
      payload: {
        triple,
        // @TODO: Check this based on the collection
        isLastEntity: true,
      },
    });
  };

  const createCollectionItem = (collectionId: string, entity: EntitySearchResult, collectionTriple: Triple) => {
    send({
      type: 'CREATE_COLLECTION_ITEM',
      payload: {
        entity,
        collectionId,
        collectionTriple: collectionTriple as TripleWithCollectionValue,
      },
    });
  };

  const deleteCollectionItem = (collectionItemId: string, collectionTriple: Triple) => {
    send({
      type: 'DELETE_COLLECTION_ITEM',
      payload: {
        collectionItemId,
        collectionTriple: collectionTriple as TripleWithCollectionValue,
      },
    });
  };

  const addAttribute = (attribute: { id: string; name: string | null }, oldTriple: Triple) => {
    send({
      type: 'ADD_ATTRIBUTE_TO_TRIPLE',
      payload: {
        existingTriple: groupedTriplesByAttributeId[attribute.id],
        newAttribute: attribute,
        oldTriple,
      },
    });
  };

  const addEntityValue = (
    attributeId: string,
    linkedEntity: {
      id: string;
      name: string | null;
      space?: string;
    }
  ) => {
    // @TODO add space for linked entities

    const existingTriple = groupedTriplesByAttributeId[attributeId];
    // If it's an empty triple value
    send({
      type: 'ADD_PAGE_ENTITY_VALUE',
      payload: {
        // If we have an existing triple for this attributeId and it's not
        // a placeholder then we know that we're adding another entity value
        // resulting in MANY cardinality as a collection.
        shouldConvertToCollection: existingTriple.placeholder === false,
        existingTriple: existingTriple,
        attribute: {
          id: attributeId,
        },
        linkedEntity,
        entityName: name,
      },
    });
  };

  const createEntityTripleFromPlaceholder = (
    triple: ITriple,
    linkedEntity: {
      id: string;
      name: string | null;
    }
  ) => {
    send({
      type: 'CREATE_ENTITY_TRIPLE_FROM_PLACEHOLDER',
      payload: {
        attributeId: triple.attributeId,
        attributeName: triple.attributeName ?? null,
        entityId: linkedEntity.id,
        entityName: linkedEntity.name ?? null,
      },
    });
  };

  const createStringTripleFromPlaceholder = (triple: ITriple, value: string) => {
    send({
      type: 'CREATE_TEXT_TRIPLE_FROM_PLACEHOLDER',
      payload: {
        attributeId: triple.attributeId,
        attributeName: triple.attributeName ?? null,
        value,
      },
    });
  };

  const createUrlTripleFromPlaceholder = (triple: ITriple, value: string) => {
    send({
      type: 'CREATE_URL_TRIPLE_FROM_PLACEHOLDER',
      payload: {
        attributeId: triple.attributeId,
        attributeName: triple.attributeName ?? null,
        value,
      },
    });
  };

  const createDateTripleFromPlaceholder = (triple: ITriple, value: string) => {
    send({
      type: 'CREATE_TIME_TRIPLE_FROM_PLACEHOLDER',
      payload: {
        attributeId: triple.attributeId,
        attributeName: triple.attributeName ?? null,
        value,
      },
    });
  };

  const updateTextValue = (triple: ITriple, value: string) => {
    send({
      type: 'UPSERT_TRIPLE_VALUE',
      payload: {
        triple,
        value: {
          type: 'TEXT',
          value,
        },
      },
    });
  };

  const updateUrlValue = (triple: ITriple, value: string) => {
    send({
      type: 'UPSERT_TRIPLE_VALUE',
      payload: {
        triple,
        value: {
          type: 'URL',
          value,
        },
      },
    });
  };

  const updateDateValue = (triple: ITriple, value: string) => {
    send({
      type: 'UPSERT_TRIPLE_VALUE',
      payload: {
        triple,
        value: {
          type: 'TIME',
          value,
        },
      },
    });
  };

  const uploadImage = (triple: ITriple, imageSrc: string) => {
    send({
      type: 'UPLOAD_IMAGE',
      payload: {
        triple,
        imageSrc,
      },
    });
  };

  const deleteImageTriple = (triple: ITriple) => {
    send({
      type: 'DELETE_IMAGE_TRIPLE',
      payload: {
        triple,
      },
    });
  };

  const onNameChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    send({
      type: 'EDIT_ENTITY_NAME',
      payload: {
        name: e.target.value,
      },
    });
  };

  const onDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    send({
      type: 'EDIT_ENTITY_DESCRIPTION',
      payload: {
        name,
        description: e.target.value,
      },
    });
  };

  const tripleToEditableField = (attributeId: string, triple: Triple, isEmptyEntity: boolean) => {
    switch (triple.value.type) {
      case 'TEXT':
        return (
          <PageStringField
            key={triple.attributeId}
            variant="body"
            placeholder="Add value..."
            aria-label={triple.placeholder ? 'placeholder-text-field' : 'text-field'}
            value={triple.placeholder ? '' : triple.value.value}
            onChange={e => {
              triple.placeholder
                ? createStringTripleFromPlaceholder(triple, e.target.value)
                : updateTextValue(triple, e.target.value);
            }}
          />
        );
      case 'IMAGE':
        return (
          <PageImageField
            key={triple.attributeId}
            variant="avatar"
            imageSrc={triple.value.image}
            onImageChange={imageSrc => {
              uploadImage(triple, imageSrc);
            }}
            onImageRemove={() => {
              deleteImageTriple(triple);
            }}
          />
        );
      case 'NUMBER':
        return null;
      case 'TIME':
        return (
          <DateField
            isEditing
            value={triple.value.value}
            onBlur={v => (triple.placeholder ? createDateTripleFromPlaceholder(triple, v) : updateDateValue(triple, v))}
          />
        );
      case 'URL':
        return (
          <WebUrlField
            isEditing
            placeholder="Add value..."
            value={triple.value.value}
            onBlur={e => {
              triple.placeholder
                ? createUrlTripleFromPlaceholder(triple, e.target.value)
                : updateUrlValue(triple, e.target.value);
            }}
          />
        );
      case 'ENTITY':
        if (isEmptyEntity) {
          const relationTypes = allowedTypes[attributeId]?.length > 0 ? allowedTypes[attributeId] : undefined;

          return (
            <div data-testid={triple.placeholder ? 'placeholder-select-entity' : 'select-entity'} className="w-full">
              <SelectEntity
                spaceId={spaceId}
                onDone={result => {
                  if (attributeId) {
                    addEntityValue(attributeId, result);
                  }
                }}
                allowedTypes={relationTypes}
                className="m-0 -mb-[1px] block w-full resize-none bg-transparent p-0 text-body placeholder:text-grey-02 focus:outline-none"
              />
            </div>
          );
        }

        return (
          <div key={`entity-${triple.value.value}`}>
            <DeletableChipButton
              href={NavUtils.toEntity(triple.space, triple.value.value)}
              onClick={() => removeOrResetEntityTriple(triple)}
            >
              {triple.value.name || triple.value.value}
            </DeletableChipButton>
          </div>
        );
      case 'COLLECTION': {
        const isEmptyCollection = triple.value.items.length === 0;

        if (isEmptyCollection) {
          const relationTypes = allowedTypes[attributeId]?.length > 0 ? allowedTypes[attributeId] : undefined;

          return (
            <div data-testid={triple.placeholder ? 'placeholder-entity-autocomplete' : 'entity-autocomplete'}>
              <EntityTextAutocomplete
                spaceId={spaceId}
                key={`entity-${attributeId}-${triple.value.value}`}
                placeholder="Add value..."
                allowedTypes={relationTypes}
                onDone={result =>
                  triple.placeholder
                    ? createEntityTripleFromPlaceholder(triple, result)
                    : addEntityValue(attributeId, result)
                }
                alreadySelectedIds={entityValueTriples
                  .filter(triple => triple.attributeId === attributeId)
                  .map(triple => triple.value.value)}
                attributeId={attributeId}
              />
            </div>
          );
        }

        // @TODO: Switch from an entity to a collection when adding another item
        return triple.value.items.map(i => {
          return (
            <div key={`entity-${triple.attributeId}-${triple.value.value}-${i.value.value}}`} className="mt-1">
              <DeletableChipButton
                href={NavUtils.toEntity(triple.space, i.entity.id)}
                onClick={() => deleteCollectionItem(i.id, triple)}
              >
                {i.value.type === 'ENTITY' ? i.value.value : i.value.value}
              </DeletableChipButton>
            </div>
          );
        });
      }
    }
  };

  return (
    <>
      <div className="relative break-words">
        <Text as="p" variant="bodySemibold">
          Name
        </Text>
        <PageStringField variant="body" placeholder="Entity name..." value={name} onChange={onNameChange} />
        {nameTriple && (
          <div className="absolute right-0 top-[6px] flex items-center gap-8">
            <SquareButton
              icon={<Trash />}
              onClick={() => send({ type: 'REMOVE_TRIPLE', payload: { triple: nameTriple } })}
            />
          </div>
        )}
      </div>
      <div className="relative break-words">
        <Text as="p" variant="bodySemibold">
          Description
        </Text>
        <PageStringField
          variant="body"
          placeholder="Add a description..."
          value={description ?? ''}
          onChange={onDescriptionChange}
        />
        {descriptionTriple && (
          <div className="absolute right-0 top-[6px] flex items-center gap-8">
            <SquareButton
              icon={<Trash />}
              onClick={() => send({ type: 'REMOVE_TRIPLE', payload: { triple: descriptionTriple } })}
            />
          </div>
        )}
      </div>
      {/*
        @TODO: We only ever render a single triple at a time for any (S,E,A) tuple.
      */}
      {orderedGroupedTriples.map(([attributeId, triple], index) => {
        if (attributeId === SYSTEM_IDS.BLOCKS) return null;
        const isEntity = triple.value.type === 'ENTITY';
        const isCollection = triple.value.type === 'COLLECTION';
        const shouldShowEntityDialog = isEntity || isCollection;

        const tripleType: TripleValueType = triple.value.type || 'TEXT';

        const isEmptyEntity = triple.value.type === 'ENTITY' && !triple.value.value;
        const isEmptyCollection = triple.value.type === 'COLLECTION' && triple.value.items.length === 0;
        const attributeName = triple.attributeName;
        const isPlaceholder = triple.placeholder;
        const relationTypes = allowedTypes[attributeId]?.length > 0 ? allowedTypes[attributeId] : [];

        // only show multiple editable fields for relations
        const renderedTriples = tripleType === 'ENTITY' ? triple : [triple];

        return (
          <div key={`${entityId}-${attributeId}-${index}`} className="relative break-words">
            {attributeId === '' ? (
              <EntityTextAutocomplete
                spaceId={spaceId}
                placeholder="Add attribute..."
                onDone={result => addAttribute(result, triple)}
                alreadySelectedIds={tripleAttributeIds}
                allowedTypes={relationTypes}
                attributeId={attributeId}
              />
            ) : (
              <Text as="p" variant="bodySemibold">
                {attributeName || attributeId}
              </Text>
            )}
            {shouldShowEntityDialog && <Spacer height={4} />}
            <div className="flex flex-wrap items-center gap-1">
              {tripleToEditableField(attributeId, triple, isEmptyEntity)}
              {/* This is the + button next to attribute ids with existing entity values */}
              {isCollection && !isEmptyCollection && (
                <EntityAutocompleteDialog
                  spaceId={spaceId}
                  onDone={entity =>
                    isCollection
                      ? createCollectionItem(triple.value.value, entity, triple)
                      : addEntityValue(attributeId, entity)
                  }
                  allowedTypes={relationTypes}
                  entityValueIds={entityValueTriples
                    .filter(triple => triple.attributeId === attributeId)
                    .map(triple => triple.value.value)}
                  attributeId={attributeId}
                />
              )}
              <div className="absolute right-0 top-6 flex items-center gap-1">
                {isEntity ? (
                  <AttributeConfigurationMenu
                    trigger={<SquareButton icon={<CogSmall />} />}
                    attributeId={attributeId}
                    attributeName={attributeName}
                  />
                ) : null}
                {!isPlaceholder && (
                  <>
                    <TripleTypeDropdown
                      value={tripleType}
                      options={[
                        {
                          label: (
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <TextIcon />
                              <Spacer width={8} />
                              Text
                            </div>
                          ),
                          value: 'TEXT',
                          onClick: () => onChangeTriple('TEXT', triple),
                          disabled: false,
                        },
                        {
                          label: (
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <Relation />
                              <Spacer width={8} />
                              Entity
                            </div>
                          ),
                          value: 'ENTITY',
                          onClick: () => onChangeTriple('ENTITY', triple),
                          disabled: false,
                        },
                        {
                          label: (
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <Image />
                              <Spacer width={8} />
                              Image
                            </div>
                          ),
                          value: 'IMAGE',
                          onClick: () => onChangeTriple('IMAGE', triple),
                          disabled: false,
                        },
                        {
                          label: (
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <Date />
                              <Spacer width={8} />
                              Date
                            </div>
                          ),
                          value: 'TIME',
                          onClick: () => onChangeTriple('TIME', triple),
                          disabled: false,
                        },
                        {
                          label: (
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <Url />
                              <Spacer width={8} />
                              Web URL
                            </div>
                          ),
                          value: 'URL',
                          onClick: () => onChangeTriple('URL', triple),
                          disabled: false,
                        },
                      ]}
                    />
                  </>
                )}
                <SquareButton
                  icon={<Trash />}
                  onClick={
                    isPlaceholder
                      ? () => hideSchema(attributeId)
                      : () => {
                          hideSchema(attributeId);
                          send({ type: 'REMOVE_TRIPLE', payload: { triple } });
                        }
                  }
                />
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
