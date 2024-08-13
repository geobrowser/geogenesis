'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';

import * as React from 'react';
import { useEffect, useState } from 'react';

import { useTriples } from '~/core/database/triples';
import { useWriteOps } from '~/core/database/write';
import { useEditEvents } from '~/core/events/edit-events';
import { Entity, Relation } from '~/core/io/dto/entities';
import { EntityId } from '~/core/io/schema';
import { Services } from '~/core/services';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { Triple } from '~/core/types';
import { Triple as ITriple, ValueType as TripleValueType } from '~/core/types';
import { cloneEntity } from '~/core/utils/contracts/clone-entity';
import { Entities } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { EntityTextAutocomplete } from '~/design-system/autocomplete/entity-text-autocomplete';
import { SquareButton } from '~/design-system/button';
import { DeletableChipButton } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { PageStringField } from '~/design-system/editable-fields/editable-fields';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { Create } from '~/design-system/icons/create';
import { Date } from '~/design-system/icons/date';
import { Relation as RelationIcon } from '~/design-system/icons/relation';
import { Text as TextIcon } from '~/design-system/icons/text';
import { Trash } from '~/design-system/icons/trash';
import { Url } from '~/design-system/icons/url';
import { SelectEntity } from '~/design-system/select-entity';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';

import { sortEntityPageTriples } from './entity-page-utils';
import { TripleTypeDropdown } from './triple-type-dropdown';

interface Props {
  triples: ITriple[];
  id: string;
  spaceId: string;
  typeId?: string | null;
  attributes?: Array<Attribute> | null;
  relationsOut: Relation[];
}

type Attribute = [AttributeId, AttributeValue];
type AttributeId = string;
type AttributeValue = string;

export function EditableEntityPage({ id, spaceId, triples: serverTriples, typeId, attributes }: Props) {
  const { triples: localTriples, schema, hideSchema, hiddenSchemaIds, name } = useEntityPageStore();

  const { upsertMany } = useWriteOps();

  const triplesFromSpace = useTriples(
    React.useMemo(() => {
      return {
        selector: t => t.space === spaceId,
      };
    }, [spaceId])
  );
  const { subgraph, config } = Services.useServices();

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

  const onCreateNewTriple = () => send({ type: 'CREATE_NEW_TRIPLE' });

  const [hasSetType, setHasSetType] = useState(false);
  const [hasSetAttributes, setHasSetAttributes] = useState(false);

  useEffect(() => {
    if (hasSetType) return;

    const setTypeTriple = async () => {
      // @TODO: Abstract to a hook and with useSearchParams instad of passing down the params
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
                entityName: name ?? '',
                entityId: id,
                spaceId,
              });

              upsertMany(newTriples, spaceId);
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

      attributeEntities.forEach((attributeEntities: [Entity | null, Entity | null]) => {
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
            schema={schema}
            name={name ?? ''}
            send={send}
            hideSchema={hideSchema}
            hiddenSchemaIds={hiddenSchemaIds}
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
  schema,
  name,
  send,
  hideSchema,
  hiddenSchemaIds,
  spaceId,
}: {
  entityId: string;
  triples: ITriple[];
  schema: { id: EntityId; name: string | null }[];
  send: ReturnType<typeof useEditEvents>;
  name: string;
  hideSchema: (id: string) => void;
  hiddenSchemaIds: string[];
  spaceId: string;
}) {
  // Make some fake triples derived from the schema. We later hide and show these depending
  // on if the entity has filled these fields or not.
  // @TODO(relations): Should work for relations too
  // @TODO: Default schema triples for name and description if they don't already exist in
  // the list. This could maybe be done from the local database by automatically adding
  // name and description to the schema.
  const schemaTriples: ITriple[] = schema.map(s => ({
    attributeId: SYSTEM_IDS.TYPES,
    entityId,
    entityName: name,
    space: spaceId,
    attributeName: 'Types',
    value: {
      type: 'ENTITY',
      value: s.id,
      name: s.name,
    },
  }));

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
    const existingTriple = groupedTriplesByAttributeId[attributeId];
    send({
      type: 'ADD_PAGE_ENTITY_VALUE',
      payload: {
        existingTriple: existingTriple,
        attribute: {
          id: attributeId,
        },
        linkedEntity,
        entityName: name,
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
          type: 'URI',
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

  // const uploadImage = (triple: ITriple, imageSrc: string) => {
  //   send({
  //     type: 'UPLOAD_IMAGE',
  //     payload: {
  //       triple,
  //       imageSrc,
  //     },
  //   });
  // };

  // const deleteImageTriple = (triple: ITriple) => {
  //   send({
  //     type: 'DELETE_IMAGE_TRIPLE',
  //     payload: {
  //       triple,
  //     },
  //   });
  // };

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
            aria-label="text-field"
            value={triple.value.value}
            onChange={e => {
              updateTextValue(triple, e.target.value);
            }}
          />
        );
      case 'NUMBER':
        return null;
      case 'TIME':
        return <DateField isEditing value={triple.value.value} onBlur={v => updateDateValue(triple, v)} />;
      case 'URI':
        return (
          <WebUrlField
            isEditing
            placeholder="Add value..."
            value={triple.value.value}
            onBlur={e => {
              updateUrlValue(triple, e.target.value);
            }}
          />
        );
      case 'ENTITY':
        if (isEmptyEntity) {
          return (
            <div data-testid="select-entity" className="w-full">
              <SelectEntity
                spaceId={spaceId}
                onDone={result => {
                  if (attributeId) {
                    addEntityValue(attributeId, result);
                  }
                }}
                wrapperClassName="contents"
                inputClassName="m-0 -mb-[1px] block w-full resize-none bg-transparent p-0 text-body placeholder:text-grey-02 focus:outline-none"
                resultsClassName="absolute z-[1000]"
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

        const tripleType: TripleValueType = triple.value.type || 'TEXT';

        const isEmptyEntity = triple.value.type === 'ENTITY' && !triple.value.value;
        const attributeName = triple.attributeName;

        return (
          <div key={`${entityId}-${attributeId}-${index}`} className="relative break-words">
            {attributeId === '' ? (
              <EntityTextAutocomplete
                spaceId={spaceId}
                placeholder="Add attribute..."
                onDone={result => addAttribute(result, triple)}
                alreadySelectedIds={tripleAttributeIds}
                attributeId={attributeId}
              />
            ) : (
              <Text as="p" variant="bodySemibold">
                {attributeName || attributeId}
              </Text>
            )}
            {isEntity && <Spacer height={4} />}
            <div className="flex flex-wrap items-center gap-1">
              {tripleToEditableField(attributeId, triple, isEmptyEntity)}
              <div className="absolute right-0 top-6 flex items-center gap-1">
                {/* {isEntity ? (
                  <AttributeConfigurationMenu
                    trigger={<SquareButton icon={<CogSmall />} />}
                    attributeId={attributeId}
                    attributeName={attributeName}
                  />
                ) : null} */}
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
                          <RelationIcon />
                          <Spacer width={8} />
                          Entity
                        </div>
                      ),
                      value: 'ENTITY',
                      onClick: () => onChangeTriple('ENTITY', triple),
                      disabled: false,
                    },
                    // @TODO(relations): Add image support
                    // {
                    //   label: (
                    //     <div style={{ display: 'flex', alignItems: 'center' }}>
                    //       <Image />
                    //       <Spacer width={8} />
                    //       Image
                    //     </div>
                    //   ),
                    //   value: 'IMAGE',
                    //   onClick: () => onChangeTriple('IMAGE', triple),
                    //   disabled: false,
                    // },
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
                      value: 'URI',
                      onClick: () => onChangeTriple('URI', triple),
                      disabled: false,
                    },
                  ]}
                />
                <SquareButton
                  icon={<Trash />}
                  onClick={() => {
                    hideSchema(attributeId);
                    send({ type: 'REMOVE_TRIPLE', payload: { triple } });
                  }}
                />
              </div>
              {/* @TODO: Placeholders shouldn't be a 'placeholder' triple and just be a special field */}
            </div>
          </div>
        );
      })}
    </>
  );
}
