import * as React from 'react';

import { SYSTEM_IDS } from '~/../../packages/ids';
import { useActionsStore } from '~/modules/action';
import { Button, SquareButton } from '~/modules/design-system/button';
import { DeletableChipButton } from '~/modules/design-system/chip';
import { IconName } from '~/modules/design-system/icon';
import { Image } from '~/modules/design-system/icons/image';
import { Relation } from '~/modules/design-system/icons/relation';
import { Text as TextIcon } from '~/modules/design-system/icons/text';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { Entity, useEntityStore } from '~/modules/entity';
import { Entity as EntityType, Triple as TripleType, TripleValueType, Version } from '~/modules/types';
import { groupBy, NavUtils } from '~/modules/utils';
import { EntityPageMetadataHeader } from '../entity-page/entity-page-metadata-header';
import { EntityAutocompleteDialog } from './autocomplete/entity-autocomplete';
import { EntityTextAutocomplete } from './autocomplete/entity-text-autocomplete';
import { useEditEvents } from './edit-events';
import { PageImageField, PageStringField } from './editable-fields';
import { Editor } from './editor/editor';
import { sortEntityPageTriples } from './entity-page-utils';
import { EntityTypeChipGroup } from './entity-type-chip-group';
import { EntityOthersToast } from './presence/entity-others-toast';
import { EntityPresenceProvider } from './presence/entity-presence-provider';
import { TripleTypeDropdown } from './triple-type-dropdown';

interface Props {
  triples: TripleType[];
  schemaTriples: TripleType[];
  versions: Version[];
  id: string;
  name: string;
  spaceId: string;
}

export function EditableEntityPage({
  id,
  name: serverName,
  spaceId,
  schemaTriples: serverSchemaTriples,
  triples: serverTriples,
  versions,
}: Props) {
  const {
    triples: localTriples,
    schemaTriples: localSchemaTriples,
    update,
    create,
    remove,
    hideSchema,
    hiddenSchemaIds,
  } = useEntityStore();

  const { actionsFromSpace } = useActionsStore(spaceId);

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  const triples = localTriples.length === 0 && actionsFromSpace.length === 0 ? serverTriples : localTriples;
  const schemaTriples = localSchemaTriples.length === 0 ? serverSchemaTriples : localSchemaTriples;

  const nameTriple = Entity.nameTriple(triples);

  const name = Entity.name(triples) ?? serverName;
  const types = Entity.types(triples, spaceId).flatMap(t => (t.name ? [t.name] : []));

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

  const onNameChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    send({
      type: 'EDIT_ENTITY_NAME',
      payload: {
        name: e.target.value,
        triple: nameTriple,
      },
    });
  };

  const onCreateNewTriple = () => send({ type: 'CREATE_NEW_TRIPLE' });

  return (
    <>
      <PageStringField variant="mainPage" placeholder="Entity name..." value={name} onChange={onNameChange} />
      {/* 
        This height differs from the readable page height due to how we're using an expandable textarea for editing
        the entity name. We can't perfectly match the height of the normal <Text /> field with the textarea, so we
        have to manually adjust the spacing here to remove the layout shift.
      */}
      <Spacer height={9.5} />
      <EntityPageMetadataHeader versions={versions} />
      <Spacer height={24} />
      <EntityTypeChipGroup types={types} />
      <Spacer height={40} />

      <Editor editable={true} />

      <div className="rounded border border-grey-02 shadow-button">
        <div className="flex flex-col gap-6 p-5">
          <EntityAttributes
            entityId={id}
            triples={triples}
            spaceId={spaceId}
            schemaTriples={schemaTriples}
            name={name}
            send={send}
            hideSchema={hideSchema}
            hiddenSchemaIds={hiddenSchemaIds}
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
  spaceId,
  send,
  hideSchema,
  hiddenSchemaIds,
}: {
  entityId: string;
  triples: TripleType[];
  schemaTriples: TripleType[];
  send: ReturnType<typeof useEditEvents>;
  name: string;
  spaceId: string;
  hideSchema: (id: string) => void;
  hiddenSchemaIds: string[];
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

  const onChangeTripleType = (type: TripleValueType, triples: TripleType[]) => {
    send({
      type: 'CHANGE_TRIPLE_TYPE',
      payload: {
        type,
        triples,
      },
    });
  };

  const removeOrResetEntityTriple = (triple: TripleType) => {
    hideSchema(triple.attributeId);
    send({
      type: 'REMOVE_PAGE_ENTITY',
      payload: {
        triple,
        isLastEntity: groupedTriples[triple.attributeId].length === 1,
      },
    });
  };

  const linkAttribute = (oldAttributeId: string, attribute: EntityType) => {
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

  const addEntityValue = (attributeId: string, linkedEntity: EntityType) => {
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

  const createEntityTripleFromPlaceholder = (triple: TripleType, linkedEntity: EntityType) => {
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

  const createStringTripleFromPlaceholder = (triple: TripleType, value: string) => {
    send({
      type: 'CREATE_STRING_TRIPLE_WITH_VALUE',
      payload: {
        attributeId: triple.attributeId,
        attributeName: triple.attributeName || '',
        value,
      },
    });
  };

  const updateValue = (triple: TripleType, name: string) => {
    send({
      type: 'UPDATE_VALUE',
      payload: {
        triple,
        value: name,
      },
    });
  };

  const uploadImage = (triple: TripleType, imageSrc: string) => {
    send({
      type: 'UPLOAD_IMAGE',
      payload: {
        triple,
        imageSrc,
      },
    });
  };

  const removeImage = (triple: TripleType) => {
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

  const tripleToEditableField = (attributeId: string, triple: TripleType, isEmptyEntity: boolean) => {
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
                : updateValue(triple, e.target.value);
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
      case 'entity':
        if (isEmptyEntity) {
          return (
            <div data-testid={triple.placeholder ? 'placeholder-entity-autocomplete' : 'entity-autocomplete'}>
              <EntityTextAutocomplete
                key={`entity-${attributeId}-${triple.value.id}`}
                placeholder="Add value..."
                onDone={result =>
                  triple.placeholder
                    ? createEntityTripleFromPlaceholder(triple, result)
                    : addEntityValue(attributeId, result)
                }
                itemIds={entityValueTriples
                  .filter(triple => triple.attributeId === attributeId)
                  .map(triple => triple.value.id)}
                spaceId={spaceId}
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
        const isEntityGroup = triples.find(triple => triple.value.type === 'entity');

        const tripleType: TripleValueType = triples[0].value.type || 'string';

        const isEmptyEntity = triples.length === 1 && triples[0].value.type === 'entity' && !triples[0].value.id;
        const attributeName = triples[0].attributeName;
        const isPlaceholder = triples[0].placeholder;

        return (
          <div key={`${entityId}-${attributeId}-${index}`} className="relative break-words">
            {attributeId === '' ? (
              <EntityTextAutocomplete
                placeholder="Add attribute..."
                onDone={result => linkAttribute(attributeId, result)}
                itemIds={attributeIds}
                spaceId={spaceId}
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
                  onDone={entity => addEntityValue(attributeId, entity)}
                  entityValueIds={entityValueTriples.map(triple => triple.value.id)}
                  spaceId={spaceId}
                />
              )}
              <div className="absolute top-6 right-0 flex items-center gap-2">
                {!isPlaceholder && (
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
                        onClick: () => onChangeTripleType('string', triples),
                        disabled: !isEntityGroup,
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
                        onClick: () => onChangeTripleType('entity', triples),
                        disabled: Boolean(isEntityGroup),
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
                        onClick: () => onChangeTripleType('image', triples),
                        disabled: Boolean(isEntityGroup),
                      },
                    ]}
                  />
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
