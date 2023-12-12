'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';

import * as React from 'react';
import { useEffect, useState } from 'react';

import { useEditEvents } from '~/core/events/edit-events';
import { useActionsStore } from '~/core/hooks/use-actions-store';
import { EntityOthersToast } from '~/core/presence/entity-others-toast';
import { EntityPresenceProvider } from '~/core/presence/presence-provider';
import { Services } from '~/core/services';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { Triple as ITriple, RelationValueTypesByAttributeId, TripleValueType } from '~/core/types';
import type { Entity as EntityType } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils, groupBy } from '~/core/utils/utils';

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
  filters?: Array<Filter> | null;
}

type Filter = [FilterId, FilterValue];
type FilterId = string;
type FilterValue = string;

export function EditableEntityPage({ id, spaceId, triples: serverTriples, typeId, filters }: Props) {
  const {
    triples: localTriples,
    schemaTriples,
    hideSchema,
    hiddenSchemaIds,
    attributeRelationTypes,
  } = useEntityPageStore();

  const { create, update, remove } = useActionsStore();

  const { actionsFromSpace } = useActionsStore(spaceId);
  const { subgraph, config } = Services.useServices();

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  const triples = localTriples.length === 0 && actionsFromSpace.length === 0 ? serverTriples : localTriples;

  // Always default to the local state for the name
  const name = Entity.name(triples) ?? '';

  const send = useEditEvents({
    context: {
      entityId: id,
      spaceId,
      entityName: name,
    },
    api: {
      create,
      update,
      remove,
    },
  });

  const onCreateNewTriple = () => send({ type: 'CREATE_NEW_TRIPLE' });

  const [hasSetType, setHasSetType] = useState(false);
  const [hasSetFilter, setHasSetFilter] = useState(false);

  useEffect(() => {
    if (hasSetType) return;

    const setTypeTriple = async () => {
      if (typeId) {
        const typeEntity = await subgraph.fetchEntity({ id: typeId ?? '' });

        if (typeEntity) {
          send({
            type: 'CREATE_ENTITY_TRIPLE_WITH_VALUE',
            payload: {
              attributeId: 'type',
              attributeName: 'Types',
              entityId: typeEntity.id,
              entityName: typeEntity.name || '',
            },
          });
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
  }, [hasSetType, send, typeId, config, subgraph, name]);

  useEffect(() => {
    if (!hasSetType) return;
    if (hasSetFilter) return;

    const setFilterTriple = async () => {
      if (!filters || filters.length === 0) return;

      const filtersEntities = await Promise.all(
        filters.map((filter: Filter) => {
          return Promise.all([
            subgraph.fetchEntity({ id: filter[0] ?? '' }),
            subgraph.fetchEntity({ id: filter[1] ?? '' }),
          ]);
        })
      );

      filtersEntities.forEach((filterEntities: [EntityType | null, EntityType | null]) => {
        const idEntity = filterEntities[0];
        const valueEntity = filterEntities[1];

        if (!idEntity || !valueEntity) return;

        send({
          type: 'CREATE_ENTITY_TRIPLE_WITH_VALUE',
          payload: {
            attributeId: idEntity.id,
            attributeName: idEntity.name ?? '',
            entityId: valueEntity.id,
            entityName: valueEntity.name || '',
          },
        });
      });
    };

    if (filters && filters.length > 0) {
      setFilterTriple();
    }

    setHasSetFilter(true);
  }, [hasSetType, hasSetFilter, subgraph, config, send, filters]);

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
      <EntityPresenceProvider entityId={id} spaceId={spaceId}>
        <EntityOthersToast />
      </EntityPresenceProvider>
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
  const tripleAttributeIds = triples.map(triple => triple.attributeId);

  const visibleSchemaTriples = schemaTriples.filter(schemaTriple => {
    const notHidden = !hiddenSchemaIds.includes(schemaTriple.attributeId);
    const notInTriples = !tripleAttributeIds.includes(schemaTriple.attributeId);
    return notHidden && notInTriples;
  });

  const visibleTriples = [...triples, ...visibleSchemaTriples];

  const entityValueTriples = triples.filter(triple => triple.value.type === 'entity');

  // Some triples are rendered outside of the normal attribute list to better control their styling.
  const filteredAttributeIds = [SYSTEM_IDS.NAME, SYSTEM_IDS.DESCRIPTION];
  const sortedTriples = sortEntityPageTriples(visibleTriples, schemaTriples).filter(
    triple => !filteredAttributeIds.includes(triple.attributeId)
  );

  const groupedTriples = groupBy(sortedTriples, triple => triple.attributeId);
  const attributeIds = Object.keys(groupedTriples);

  const orderedGroupedTriples = Object.entries(groupedTriples);

  const nameTriple = Entity.nameTriple(triples);
  const descriptionTriple = Entity.descriptionTriple(triples);
  const description = Entity.description(triples);

  const onChangeTriple = (type: TripleValueType, triples: ITriple[]) => {
    send({
      type: 'CHANGE_TRIPLE_TYPE',
      payload: {
        type,
        triples,
      },
    });
  };

  const removeOrResetEntityTriple = (triple: ITriple) => {
    hideSchema(triple.attributeId);
    send({
      type: 'REMOVE_PAGE_ENTITY',
      payload: {
        triple,
        isLastEntity: groupedTriples[triple.attributeId].length === 1,
      },
    });
  };

  const linkAttribute = (
    oldAttributeId: string,
    attribute: {
      id: string;
      name: string | null;
    }
  ) => {
    send({
      type: 'LINK_ATTRIBUTE',
      payload: {
        triplesByAttributeId: groupedTriples,
        oldAttribute: {
          id: oldAttributeId,
        },
        newAttribute: attribute,
      },
    });
  };

  const addEntityValue = (
    attributeId: string,
    linkedEntity: {
      id: string;
      name: string | null;
    }
  ) => {
    // If it's an empty triple value
    send({
      type: 'ADD_PAGE_ENTITY_VALUE',
      payload: {
        triplesByAttributeId: groupedTriples,
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
      type: 'CREATE_ENTITY_TRIPLE_WITH_VALUE',
      payload: {
        attributeId: triple.attributeId,
        attributeName: triple.attributeName || '',
        entityId: linkedEntity.id,
        entityName: linkedEntity.name || '',
      },
    });
  };

  const createStringTripleFromPlaceholder = (triple: ITriple, value: string) => {
    send({
      type: 'CREATE_STRING_TRIPLE_WITH_VALUE',
      payload: {
        attributeId: triple.attributeId,
        attributeName: triple.attributeName || '',
        value,
      },
    });
  };

  const createUrlTripleFromPlaceholder = (triple: ITriple, value: string) => {
    send({
      type: 'CREATE_URL_TRIPLE_WITH_VALUE',
      payload: {
        attributeId: triple.attributeId,
        attributeName: triple.attributeName || '',
        value,
      },
    });
  };

  const createDateTripleFromPlaceholder = (triple: ITriple, value: string) => {
    send({
      type: 'CREATE_DATE_TRIPLE_WITH_VALUE',
      payload: {
        attributeId: triple.attributeId,
        attributeName: triple.attributeName || '',
        value,
      },
    });
  };

  const updateStringValue = (triple: ITriple, name: string) => {
    send({
      type: 'UPDATE_STRING_VALUE',
      payload: {
        triple,
        value: name,
      },
    });
  };

  const updateUrlValue = (triple: ITriple, value: string) => {
    send({
      type: 'UPDATE_URL_VALUE',
      payload: {
        triple,
        value,
      },
    });
  };

  const updateDateValue = (triple: ITriple, value: string) => {
    send({
      type: 'UPDATE_DATE_VALUE',
      payload: {
        triple,
        value,
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

  const removeImage = (triple: ITriple) => {
    send({
      type: 'REMOVE_IMAGE',
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
        triple: nameTriple,
      },
    });
  };

  const onDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    send({
      type: 'EDIT_ENTITY_DESCRIPTION',
      payload: {
        name,
        description: e.target.value,
        triple: descriptionTriple,
      },
    });
  };

  const tripleToEditableField = (attributeId: string, triple: ITriple, isEmptyEntity: boolean) => {
    switch (triple.value.type) {
      case 'string':
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
                : updateStringValue(triple, e.target.value);
            }}
          />
        );
      case 'image':
        return (
          <PageImageField
            key={triple.attributeId}
            variant="avatar"
            imageSrc={triple.value.value}
            onImageChange={imageSrc => {
              uploadImage(triple, imageSrc);
            }}
            onImageRemove={() => {
              removeImage(triple);
            }}
          />
        );
      case 'number':
        return null;
      case 'date':
        return (
          <DateField
            isEditing
            value={triple.value.value}
            onBlur={v => (triple.placeholder ? createDateTripleFromPlaceholder(triple, v) : updateDateValue(triple, v))}
          />
        );
      case 'url':
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
      case 'entity':
        if (isEmptyEntity) {
          const relationTypes = allowedTypes[attributeId]?.length > 0 ? allowedTypes[attributeId] : undefined;

          return (
            <div data-testid={triple.placeholder ? 'placeholder-entity-autocomplete' : 'entity-autocomplete'}>
              <EntityTextAutocomplete
                spaceId={spaceId}
                key={`entity-${attributeId}-${triple.value.id}`}
                placeholder="Add value..."
                allowedTypes={relationTypes}
                onDone={result =>
                  triple.placeholder
                    ? createEntityTripleFromPlaceholder(triple, result)
                    : addEntityValue(attributeId, result)
                }
                itemIds={entityValueTriples
                  .filter(triple => triple.attributeId === attributeId)
                  .map(triple => triple.value.id)}
                attributeId={attributeId}
              />
            </div>
          );
        }

        return (
          <div key={`entity-${triple.value.id}`}>
            <DeletableChipButton
              href={NavUtils.toEntity(triple.space, triple.value.id)}
              onClick={() => removeOrResetEntityTriple(triple)}
            >
              {triple.value.name || triple.value.id}
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
      {orderedGroupedTriples.map(([attributeId, triples], index) => {
        if (attributeId === SYSTEM_IDS.BLOCKS) return null;
        const isEntityGroup = triples.find(triple => triple.value.type === 'entity');

        const tripleType: TripleValueType = triples[0].value.type || 'string';

        const isEmptyEntity = triples.length === 1 && triples[0].value.type === 'entity' && !triples[0].value.id;
        const attributeName = triples[0].attributeName;
        const isPlaceholder = triples[0].placeholder;
        const relationTypes = allowedTypes[attributeId]?.length > 0 ? allowedTypes[attributeId] : [];

        return (
          <div key={`${entityId}-${attributeId}-${index}`} className="relative break-words">
            {attributeId === '' ? (
              <EntityTextAutocomplete
                spaceId={spaceId}
                placeholder="Add attribute..."
                onDone={result => linkAttribute(attributeId, result)}
                itemIds={attributeIds}
                allowedTypes={relationTypes}
                attributeId={attributeId}
              />
            ) : (
              <Text as="p" variant="bodySemibold">
                {attributeName || attributeId}
              </Text>
            )}
            {isEntityGroup && <Spacer height={4} />}
            <div className="flex flex-wrap items-center gap-1">
              {triples.map(triple => tripleToEditableField(attributeId, triple, isEmptyEntity))}
              {/* This is the + button next to attribute ids with existing entity values */}
              {isEntityGroup && !isEmptyEntity && (
                <EntityAutocompleteDialog
                  spaceId={spaceId}
                  onDone={entity => addEntityValue(attributeId, entity)}
                  allowedTypes={relationTypes}
                  entityValueIds={entityValueTriples
                    .filter(triple => triple.attributeId === attributeId)
                    .map(triple => triple.value.id)}
                  attributeId={attributeId}
                />
              )}
              <div className="absolute right-0 top-6 flex items-center gap-1">
                {isEntityGroup ? (
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
                          value: 'string',
                          onClick: () => onChangeTriple('string', triples),
                          disabled: false,
                        },
                        {
                          label: (
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <Relation />
                              <Spacer width={8} />
                              Relation
                            </div>
                          ),
                          value: 'entity',
                          onClick: () => onChangeTriple('entity', triples),
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
                          value: 'image',
                          onClick: () => onChangeTriple('image', triples),
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
                          value: 'date',
                          onClick: () => onChangeTriple('date', triples),
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
                          value: 'url',
                          onClick: () => onChangeTriple('url', triples),
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
                          triples
                            .filter(triple => triple.attributeId === attributeId)
                            .forEach(triple => send({ type: 'REMOVE_TRIPLE', payload: { triple } }));
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
