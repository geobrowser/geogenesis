'use client';

import * as React from 'react';
import { SYSTEM_IDS } from '@geogenesis/ids';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { Button, SquareButton } from '~/design-system/button';
import { DeletableChipButton } from '~/design-system/chip';
import { IconName } from '~/design-system/icon';
import { Image } from '~/design-system/icons/image';
import { Relation } from '~/design-system/icons/relation';
import { Text as TextIcon } from '~/design-system/icons/text';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';
import { Entity } from '~/core/utils/entity';
import { useEntityPageStore } from '~/core/hooks/use-entity-page-store';
import { Triple as ITriple, TripleValueType } from '~/core/types';
import { groupBy, NavUtils } from '~/core/utils/utils';
import { EntityAutocompleteDialog } from '~/design-system/autocomplete/entity-autocomplete';
import { EntityTextAutocomplete } from '~/design-system/autocomplete/entity-text-autocomplete';
import { useEditEvents } from '~/core/events/edit-events';
import { PageImageField, PageStringField } from '~/design-system/editable-fields/editable-fields';
import { sortEntityPageTriples } from './entity-page-utils';
import { EntityOthersToast } from '~/core/presence/entity-others-toast';
import { EntityPresenceProvider } from '~/core/presence/presence-provider';
import { TripleTypeDropdown } from './triple-type-dropdown';
import { DateField } from '~/design-system/editable-fields/date-field';
import { Services } from '~/core/services';
import { AttributeConfigurationMenu } from './attribute-configuration-menu';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { Url } from '~/design-system/icons/url';
import { Date } from '~/design-system/icons/date';

interface Props {
  triples: ITriple[];
  id: string;
  spaceId: string;
  typeId?: string | null;
  filterId?: string | null;
  filterValue?: string | null;
}

export function EditableEntityPage({ id, spaceId, triples: serverTriples, typeId, filterId, filterValue }: Props) {
  const {
    triples: localTriples,
    schemaTriples,
    update,
    create,
    remove,
    hideSchema,
    hiddenSchemaIds,
    attributeRelationTypes,
  } = useEntityPageStore();

  const { actionsFromSpace } = useActionsStore(spaceId);
  const { network } = Services.useServices();

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

  const [hasSetType, setHasSetType] = React.useState(false);
  const [hasSetFilter, setHasSetFilter] = React.useState(false);

  React.useEffect(() => {
    if (hasSetType) return;

    const setTypeTriple = async () => {
      const typeEntity = await network.fetchEntity(typeId ?? '');

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
    };

    if (typeId) {
      setTypeTriple();
    }

    setHasSetType(true);
  }, [hasSetType, network, send, typeId]);

  React.useEffect(() => {
    if (!hasSetType) return;
    if (hasSetFilter) return;

    const setFilterTriple = async () => {
      const idEntity = await network.fetchEntity(filterId ?? '');
      const valueEntity = await network.fetchEntity(filterValue ?? '');

      if (filterId && filterValue && idEntity && valueEntity) {
        send({
          type: 'CREATE_ENTITY_TRIPLE_WITH_VALUE',
          payload: {
            attributeId: idEntity.id,
            attributeName: idEntity.name ?? '',
            entityId: valueEntity.id,
            entityName: valueEntity.name || '',
          },
        });
      }
    };

    if (filterId && filterValue) {
      setFilterTriple();
    }

    setHasSetFilter(true);
  }, [hasSetType, hasSetFilter, network, send, filterId, filterValue]);

  return (
    <>
      <div className="rounded border border-grey-02 shadow-button">
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
          <Button onClick={onCreateNewTriple} variant="secondary" icon="create">
            Add triple
          </Button>
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
  allowedTypes: Record<string, { typeId: string; typeName: string | null; spaceId: string }[]>;
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
          <div className="absolute top-[6px] right-0 flex items-center gap-8">
            <SquareButton
              icon="trash"
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
          <div className="absolute top-[6px] right-0 flex items-center gap-8">
            <SquareButton
              icon="trash"
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
                />
              )}
              <div className="absolute top-6 right-0 flex items-center gap-1">
                {isEntityGroup ? (
                  <AttributeConfigurationMenu
                    attributeId={attributeId}
                    attributeName={attributeName}
                    configuredTypes={relationTypes}
                  />
                ) : null}
                {!isPlaceholder && (
                  <>
                    <TripleTypeDropdown
                      value={tripleType as IconName}
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
                  icon="trash"
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
