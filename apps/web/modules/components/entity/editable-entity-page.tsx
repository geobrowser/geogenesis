import styled from '@emotion/styled';
import Head from 'next/head';
import { Button, SquareButton } from '~/modules/design-system/button';
import { ChipButton } from '~/modules/design-system/chip';
import { Text as TextIcon } from '~/modules/design-system/icons/text';
import { Relation } from '~/modules/design-system/icons/relation';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { Triple as TripleType } from '~/modules/types';
import { EntityAutocompleteDialog } from './entity-autocomplete';
import { CopyIdButton } from './copy-id';
import { NumberField, StringField } from './editable-fields';
import { TripleTypeDropdown } from './triple-type-dropdown';
import { SYSTEM_IDS } from '~/modules/constants';
import { EntityTextAutocomplete } from './entity-text-autocomplete';
import { Entity, useEntityStore } from '~/modules/entity';
import { useActionsStore } from '~/modules/action';
import { useEditEvents } from './edit-events';
import { A, B, pipe } from '@mobily/ts-belt';
import { EntityAutocompleteResult } from '~/modules/entity/autocomplete';

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
  id: string;
  name: string;
  space: string;
}

export function EditableEntityPage({ id, name: serverName, space, triples: serverTriples }: Props) {
  const { triples: localTriples, update, create, remove } = useEntityStore();
  const { actions } = useActionsStore(space);
  const send = useEditEvents({
    context: {
      entityId: id,
      spaceId: space,
    },
    api: {
      create,
      update,
      remove,
    },
  });

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  const triples = pipe(
    A.isEmpty(localTriples) && A.isEmpty(actions),
    B.ifElse(
      () => serverTriples,
      () => localTriples
    )
  );

  const nameTriple = triples.find(t => t.attributeId === SYSTEM_IDS.NAME);
  const descriptionTriple = triples.find(
    t => t.attributeId === SYSTEM_IDS.DESCRIPTION || t.attributeName === 'Description'
  );
  const description = Entity.description(triples);
  const name = Entity.name(triples) ?? serverName;

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

        <Spacer height={16} />
        <StringField
          variant="body"
          placeholder="Add a description..."
          value={description ?? undefined}
          onChange={onDescriptionChange}
        />

        <Spacer height={16} />

        <EntityActionGroup>
          <CopyIdButton id={id} />
        </EntityActionGroup>

        <Spacer height={8} />

        <Content>
          {triples.length > 0 ? (
            <Attributes>
              <EntityAttributes entityId={id} triples={triples} name={name} send={send} />
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
  name,
  send,
}: {
  entityId: string;
  triples: Props['triples'];
  send: ReturnType<typeof useEditEvents>;
  name: string;
}) {
  const groupedTriples = A.groupBy(triples, t => t.attributeId);

  const onChangeTripleType = (type: 'string' | 'entity', triples: readonly TripleType[]) => {
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

  const linkAttribute = (oldAttributeId: string, attribute: EntityAutocompleteResult) => {
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

  const addEntityValue = (attributeId: string, linkedEntity: EntityAutocompleteResult) => {
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

  const tripleToEditableField = (attributeId: string, triple: TripleType, isEmptyEntity: boolean) => {
    switch (triple.value.type) {
      case 'string':
        return (
          <StringField
            key={triple.id}
            variant="body"
            placeholder="Add value..."
            onChange={e => send({ type: 'UPDATE_VALUE', payload: { triple, value: e.target.value } })}
            value={triple.value.value}
          />
        );
      case 'number':
        return (
          <NumberField
            key={triple.id}
            placeholder="Add value..."
            onBlur={e => send({ type: 'UPDATE_VALUE', payload: { triple, value: e.target.value } })}
            initialValue={triple.value.value}
          />
        );
      case 'entity':
        if (isEmptyEntity) {
          return (
            <EntityTextAutocomplete
              key={`entity-${attributeId}-${triple.id}`}
              placeholder="Add value..."
              onDone={result => addEntityValue(attributeId, result)}
            />
          );
        }

        return (
          <div key={`entity-${triple.id}`}>
            <ChipButton icon="check-close" onClick={() => removeOrResetEntityTriple(triple)}>
              {triple.value.name || triple.value.id}
            </ChipButton>
          </div>
        );
    }
  };

  return (
    <>
      {Object.entries(groupedTriples).map(([attributeId, triples], index) => {
        const isEntityGroup = triples.find(t => t.value.type === 'entity');
        const isEmptyEntity = triples.length === 1 && triples[0].value.type === 'entity' && !triples[0].value.id;
        const attributeName = triples[0].attributeName;

        return (
          <EntityAttributeContainer key={`${entityId}-${attributeId}-${index}`}>
            {attributeId === '' ? (
              <EntityTextAutocomplete
                placeholder="Add attribute..."
                onDone={result => linkAttribute(attributeId, result)}
              />
            ) : (
              <Text as="p" variant="bodySemibold">
                {attributeName || attributeId}
              </Text>
            )}
            <GroupedAttributesList>
              {/* 
                Have to do some janky layout stuff instead of being able to just use gap since we want different
                height between the attribute name and the attribute value for entities vs strings
              */}
              {triples.map(triple => tripleToEditableField(attributeId, triple, isEmptyEntity))}
              {isEntityGroup && !isEmptyEntity && (
                <EntityAutocompleteDialog onDone={entity => addEntityValue(attributeId, entity)} />
              )}
              <TripleActions>
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
                <SquareButton
                  icon="trash"
                  onClick={() =>
                    triples
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
