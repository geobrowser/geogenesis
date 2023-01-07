import styled from '@emotion/styled';
import Head from 'next/head';
import { useState } from 'react';
import { j } from 'vitest/dist/index-ea17aa0c';
import { useActionsStore } from '~/modules/action';
import { SYSTEM_IDS } from '~/modules/constants';
import { Button, SquareButton } from '~/modules/design-system/button';
import { ChipButton } from '~/modules/design-system/chip';
import { Relation } from '~/modules/design-system/icons/relation';
import { Text as TextIcon } from '~/modules/design-system/icons/text';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { Entity, useEntityStore } from '~/modules/entity';
import { Triple as TripleType } from '~/modules/types';
import { groupBy } from '~/modules/utils';
import { CopyIdButton } from './copy-id';
import { useEditEvents } from './edit-events';
import { NumberField, PlaceholderField, StringField } from './editable-fields';
import { EntityAutocompleteDialog } from './entity-autocomplete';
import { EntityTextAutocomplete } from './entity-text-autocomplete';
import { TripleTypeDropdown } from './triple-type-dropdown';

const PageContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
});

const EntityContainer = styled.div({
  width: '100%',
});

const Content = styled.div(({ theme }) => ({
  border: `1px solid ${theme.colors['grey-02']}`,
  borderRadius: theme.radius,
  backgroundColor: theme.colors.white,
}));

const Attributes = styled.div(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.space * 6,
  padding: theme.space * 5,
}));

const EntityActionGroup = styled.div({
  display: 'flex',
  justifyContent: 'flex-end',

  '@media (max-width: 600px)': {
    button: {
      flexGrow: 1,
    },
  },
});

const AddTripleContainer = styled.div(({ theme }) => ({
  padding: theme.space * 4,
}));

interface Props {
  triples: TripleType[];
  placeholderTriples: TripleType[];
  id: string;
  name: string;
  space: string;
}

export function EditableEntityPage({ id, name: serverName, space, triples: serverTriples }: Props) {
  const { triples: localTriples, update, create, remove, placeholderTriples } = useEntityStore();

  const { actions } = useActionsStore(space);

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  const triples = localTriples.length === 0 && actions.length === 0 ? serverTriples : localTriples;

  const nameTriple = triples.find(t => t.attributeId === SYSTEM_IDS.NAME);
  const descriptionTriple = triples.find(
    t => t.attributeId === SYSTEM_IDS.DESCRIPTION || t.attributeName === 'Description'
  );
  const description = Entity.description(triples);
  const name = Entity.name(triples) ?? serverName;

  const send = useEditEvents({
    context: {
      entityId: id,
      spaceId: space,
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

  const onCreateNewTriple = () => send({ type: 'CREATE_NEW_TRIPLE' });

  return (
    <PageContainer>
      <EntityContainer>
        <Head>
          <title>{name ?? id}</title>
          <meta property="og:url" content={`https://geobrowser.io/spaces/${id}`} />
        </Head>

        <StringField
          variant="mainPage"
          color="text"
          placeholder="Entity name..."
          value={name}
          onChange={onNameChange}
        />

        {/* 
          StringField uses a textarea to handle wrapping input text to multiple lines. We need to auto-resize the
          textarea so its size grows with the text. There is no way to ensure the line-heights match the new height
          of the textarea, so we have to manually subtract below the textarea so the editable entity page and the
          readable entity page visually align.

          You'll notice that this Spacer in readable-entity-page will have a larger value.
        */}
        <Spacer height={9} />

        <StringField
          variant="body"
          placeholder="Add a description..."
          value={description ?? undefined}
          onChange={onDescriptionChange}
        />

        {/* 
          StringField uses a textarea to handle wrapping input text to multiple lines. We need to auto-resize the
          textarea so its size grows with the text. There is no way to ensure the line-heights match the new height
          of the textarea, so we have to manually subtract below the textarea so the editable entity page and the
          readable entity page visually align.

          You'll notice that this Spacer in readable-entity-page will have a larger value.
        */}
        <Spacer height={12} />

        <EntityActionGroup>
          <CopyIdButton id={id} />
        </EntityActionGroup>

        <Spacer height={8} />

        <Content>
          {triples.length > 0 ? (
            <Attributes>
              <EntityAttributes
                entityId={id}
                triples={triples}
                placeholderTriples={placeholderTriples}
                name={name}
                send={send}
              />
            </Attributes>
          ) : null}
          <AddTripleContainer>
            <Button onClick={onCreateNewTriple} variant="secondary" icon="create">
              Add triple
            </Button>
          </AddTripleContainer>
        </Content>
      </EntityContainer>
    </PageContainer>
  );
}

const EntityAttributeContainer = styled.div({
  position: 'relative',
  wordBreak: 'break-word',
});

const TripleActions = styled.div(props => ({
  position: 'absolute',
  display: 'flex',
  alignItems: 'center',
  gap: props.theme.space * 2,

  // HACK to visually align the buttons with the attribut name line-height
  top: 6,
  right: 0,
}));

const GroupedAttributesList = styled.div(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.space,
  flexWrap: 'wrap',
}));

function EntityAttributes({
  entityId,
  triples,
  placeholderTriples,
  name,
  send,
}: {
  entityId: string;
  triples: Props['triples'];
  placeholderTriples: Props['placeholderTriples'];
  send: ReturnType<typeof useEditEvents>;
  name: string;
}) {
  const [deletedPlaceholders, setDeletedPlaceholders] = useState<string[]>([]);

  const unusedPlaceholderTriples = placeholderTriples.filter(
    t => !triples.some(t2 => t2.attributeId === t.attributeId)
  );

  const displayedTriples = [...triples, ...unusedPlaceholderTriples].filter(({ attributeId }) => {
    return !deletedPlaceholders.includes(attributeId);
  });

  const groupedTriples = groupBy(displayedTriples, t => t.attributeId);
  const attributeIds = Object.keys(groupedTriples);
  const entityValueTriples = triples.filter(t => t.value.type === 'entity');

  const orderedGroupedTriples = Object.entries(groupedTriples).sort((a, b) => {
    const [attributeIdA, triplesA] = a;
    const [attributeIdB, triplesB] = b;
    const attributeA = triplesA[0].attributeName || '';
    const attributeB = triplesB[0].attributeName || '';

    if (attributeIdA === SYSTEM_IDS.NAME) return -1;
    if (attributeIdB === SYSTEM_IDS.NAME) return 1;
    if (attributeIdA === SYSTEM_IDS.DESCRIPTION) return -1;
    if (attributeIdB === SYSTEM_IDS.DESCRIPTION) return 1;
    if (attributeIdA === SYSTEM_IDS.TYPES) return -1;
    if (attributeIdB === SYSTEM_IDS.TYPES) return 1;
    if (attributeA < attributeB) return -1;
    if (attributeA > attributeB) return 1;
    return 0;
  });

  const onChangeTripleType = (type: 'string' | 'entity', triples: TripleType[]) => {
    send({
      type: 'CHANGE_TRIPLE_TYPE',
      payload: {
        type,
        triples,
      },
    });
  };

  const removeOrResetEntityTriple = (triple: TripleType) => {
    send({
      type: 'REMOVE_ENTITY',
      payload: {
        triple,
        isLastEntity: groupedTriples[triple.attributeId].length === 1,
      },
    });
  };

  const linkAttribute = (oldAttributeId: string, attribute: { id: string; name: string | null }) => {
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

  const addEntityValue = (attributeId: string, linkedEntity: { id: string; name: string | null }) => {
    // If it's an empty triple value
    send({
      type: 'ADD_ENTITY_VALUE',
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

  const updateValue = (triple: TripleType, value: string) => {
    if (triple.placeholder) {
      send({
        type: 'UPDATE_VALUE_FROM_PLACEHOLDER',
        payload: {
          triple,
          value,
        },
      });
    } else {
      send({
        type: 'UPDATE_VALUE',
        payload: {
          triple,
          value,
        },
      });
    }
  };

  const tripleToEditableField = (attributeId: string, triple: TripleType, isEmptyEntity: boolean) => {
    switch (triple.value.type) {
      case 'string':
        return triple.placeholder ? (
          <PlaceholderField
            key={triple.id}
            variant="body"
            placeholder="Add value..."
            onBlur={e => updateValue(triple, e.target.value)}
          />
        ) : (
          <StringField
            key={triple.id}
            variant="body"
            placeholder="Add value..."
            onChange={e => updateValue(triple, e.target.value)}
            value={triple.value.value}
          />
        );
      case 'number':
        return (
          <NumberField
            key={triple.id}
            placeholder="Add value..."
            onBlur={e => updateValue(triple, e.target.value)}
            initialValue={triple.value.value}
          />
        );
      case 'entity':
        if (isEmptyEntity) {
          return (
            <EntityTextAutocomplete
              key={`entity-${attributeId}-${triple.value.id}`}
              placeholder="Add value..."
              onDone={result => addEntityValue(attributeId, result)}
              itemIds={entityValueTriples.filter(t => t.attributeId === attributeId).map(t => t.value.id)}
            />
          );
        }

        return (
          <div key={`entity-${triple.value.id}`}>
            <ChipButton icon="check-close" onClick={() => removeOrResetEntityTriple(triple)}>
              {triple.value.name || triple.value.id}
            </ChipButton>
          </div>
        );
    }
  };

  return (
    <>
      {orderedGroupedTriples.map(([attributeId, triples], index) => {
        const isEntityGroup = triples.find(t => t.value.type === 'entity');
        const isEmptyEntity = triples.length === 1 && triples[0].value.type === 'entity' && !triples[0].value.id;
        const attributeName = triples[0].attributeName;
        const isPlaceholder = triples[0].placeholder;

        return (
          <EntityAttributeContainer key={`${entityId}-${attributeId}-${index}`}>
            {attributeId === '' ? (
              <EntityTextAutocomplete
                placeholder="Add attribute..."
                onDone={result => linkAttribute(attributeId, result)}
                itemIds={attributeIds}
              />
            ) : (
              <Text as="p" variant="bodySemibold">
                {attributeName || attributeId}
              </Text>
            )}
            {isEntityGroup && <Spacer height={4} />}
            <GroupedAttributesList>
              {triples.map(triple => tripleToEditableField(attributeId, triple, isEmptyEntity))}

              {/* This is the + button next to attribute ids with existing entity values */}
              {isEntityGroup && !isEmptyEntity && (
                <EntityAutocompleteDialog
                  onDone={entity => addEntityValue(attributeId, entity)}
                  entityValueIds={entityValueTriples.map(t => t.value.id)}
                />
              )}

              <TripleActions>
                {!isPlaceholder && (
                  <TripleTypeDropdown
                    value={<SquareButton as="span" icon={isEntityGroup ? 'relation' : 'text'} />}
                    options={[
                      {
                        label: (
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <TextIcon />
                            <Spacer width={8} />
                            <Text variant="button">Text</Text>
                          </div>
                        ),
                        onClick: () => onChangeTripleType('string', triples),
                        disabled: !isEntityGroup,
                      },
                      {
                        label: (
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <Relation />
                            <Spacer width={8} />
                            <Text variant="button">Relation</Text>
                          </div>
                        ),
                        onClick: () => onChangeTripleType('entity', triples),
                        disabled: Boolean(isEntityGroup),
                      },
                    ]}
                  />
                )}
                <SquareButton
                  icon="trash"
                  onClick={() =>
                    isPlaceholder
                      ? setDeletedPlaceholders([...deletedPlaceholders, attributeId])
                      : triples
                          .filter(t => t.attributeId === attributeId)
                          .forEach(t => send({ type: 'REMOVE_TRIPLE', payload: { triple: t } }))
                  }
                />
              </TripleActions>
            </GroupedAttributesList>
          </EntityAttributeContainer>
        );
      })}
    </>
  );
}
