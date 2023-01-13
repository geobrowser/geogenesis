import styled from '@emotion/styled';
import Head from 'next/head';
import { useActionsStore } from '~/modules/action';
import { Button, SquareButton } from '~/modules/design-system/button';
import { DeletableChipButton } from '~/modules/design-system/chip';
import { Relation } from '~/modules/design-system/icons/relation';
import { Text as TextIcon } from '~/modules/design-system/icons/text';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { Entity, useEntityStore } from '~/modules/entity';
import { Entity as EntityType, Triple as TripleType } from '~/modules/types';
import { groupBy, NavUtils } from '~/modules/utils';
import { EntityAutocompleteDialog } from './autocomplete/entity-autocomplete';
import { EntityTextAutocomplete } from './autocomplete/entity-text-autocomplete';
import { CopyIdButton } from './copy-id';
import { useEditEvents } from './edit-events';
import { sortEditableEntityPageTriples } from './editable-entity-page-utils';
import { NumberField, PlaceholderField, StringField } from './editable-fields';
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
  schemaTriples: TripleType[];
  id: string;
  name: string;
  space: string;
}

export function EditableEntityPage({
  id,
  name: serverName,
  space,
  schemaTriples: serverSchemaTriples,
  triples: serverTriples,
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

  const { actions } = useActionsStore(space);

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  const triples = localTriples.length === 0 && actions.length === 0 ? serverTriples : localTriples;
  const schemaTriples = localSchemaTriples.length === 0 ? serverSchemaTriples : localSchemaTriples;

  const nameTriple = Entity.nameTriple(triples);
  const descriptionTriple = Entity.descriptionTriple(triples);
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
                spaceId={space}
                schemaTriples={schemaTriples}
                name={name}
                send={send}
                hideSchema={hideSchema}
                hiddenSchemaIds={hiddenSchemaIds}
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

  const sortedTriples = sortEditableEntityPageTriples(visibleTriples, schemaTriples);

  const groupedTriples = groupBy(sortedTriples, triple => triple.attributeId);
  const attributeIds = Object.keys(groupedTriples);

  const orderedGroupedTriples = Object.entries(groupedTriples);

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
    hideSchema(triple.attributeId);
    send({
      type: 'REMOVE_ENTITY',
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

  const createEntityTripleFromPlaceholder = (triple: TripleType, linkedEntity: EntityType) => {
    send({
      type: 'CREATE_ENTITY_TRIPLE_FROM_PLACEHOLDER',
      payload: {
        triple,
        entityId: linkedEntity.id,
        entityName: linkedEntity.name || '',
      },
    });
  };

  const createStringTripleFromPlaceholder = (triple: TripleType, value: string) => {
    send({
      type: 'CREATE_STRING_TRIPLE_FROM_PLACEHOLDER',
      payload: {
        triple,
        value,
      },
    });
  };

  const updateValue = (triple: TripleType, value: string) => {
    send({
      type: 'UPDATE_VALUE',
      payload: {
        triple,
        value,
      },
    });
  };

  const tripleToEditableField = (attributeId: string, triple: TripleType, isEmptyEntity: boolean) => {
    switch (triple.value.type) {
      case 'string':
        return triple.placeholder ? (
          <PlaceholderField
            key={triple.id}
            variant="body"
            placeholder="Add value..."
            aria-label="placeholder-text-field"
            onBlur={e => {
              createStringTripleFromPlaceholder({ ...triple }, e.target.value);
            }}
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
              href={NavUtils.toEntity(spaceId, triple.value.id)}
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
      {orderedGroupedTriples.map(([attributeId, triples], index) => {
        const isEntityGroup = triples.find(triple => triple.value.type === 'entity');
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
                spaceId={spaceId}
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
                  entityValueIds={entityValueTriples.map(triple => triple.value.id)}
                  spaceId={spaceId}
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
                            Text
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
                            Relation
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
              </TripleActions>
            </GroupedAttributesList>
          </EntityAttributeContainer>
        );
      })}
    </>
  );
}
