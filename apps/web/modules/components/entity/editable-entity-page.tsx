import styled from '@emotion/styled';
import Head from 'next/head';
import { Button, SquareButton } from '~/modules/design-system/button';
import { ChipButton } from '~/modules/design-system/chip';
import { Text as TextIcon } from '~/modules/design-system/icons/text';
import { Relation } from '~/modules/design-system/icons/relation';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { ID } from '~/modules/id';
import { useEntityTriples } from '~/modules/stores/use-entity-triples';
import { Triple as TripleType } from '~/modules/types';
import { groupBy } from '~/modules/utils';
import { EntityAutocompleteDialog } from './entity-autocomplete';
import { FlowBar } from '../flow-bar';
import { CopyIdButton } from './copy-id';
import { NumberField, StringField } from './editable-fields';
import { TripleTypeDropdown } from './triple-type-dropdown';
import { SYSTEM_IDS } from '~/modules/constants';
import { EntityTextAutocomplete } from './entity-text-autocomplete';
import { Action } from '~/modules/action';
import { Triple } from '~/modules/triple';
import { Entity } from '~/modules/entity';
import { useActions } from '~/modules/stores/use-actions-store';

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
  const { triples: localTriples, update, create } = useEntityTriples();
  const { actions, publish } = useActions(space);

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  const triples = localTriples.length === 0 && actions.length === 0 ? serverTriples : localTriples;

  const nameTriple = triples.find(t => t.attributeId === SYSTEM_IDS.NAME);
  const descriptionTriple = triples.find(
    t => t.attributeId === SYSTEM_IDS.DESCRIPTION || t.attributeName === 'Description'
  );
  const description = Entity.description(triples);
  const name = Entity.name(triples) ?? serverName;

  const onNameChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!nameTriple) {
      return create(
        Triple.withId({
          space,
          entityId: id,
          entityName: e.target.value,
          attributeId: 'name',
          attributeName: 'Name',
          value: { id: ID.createValueId(), type: 'string', value: e.target.value },
        })
      );
    }

    update(
      {
        ...nameTriple,
        value: { ...nameTriple.value, type: 'string', value: e.target.value },
      },
      nameTriple
    );
  };

  const onDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!descriptionTriple) {
      return create(
        Triple.withId({
          space,
          entityId: id,
          attributeId: 'Description',
          attributeName: 'Description',
          entityName: name,
          value: {
            id: ID.createValueId(),
            type: 'string',
            value: e.target.value,
          },
        })
      );
    }

    update(
      {
        ...descriptionTriple,
        value: { ...descriptionTriple.value, type: 'string', value: e.target.value },
      },
      descriptionTriple
    );
  };

  const onCreateNewTriple = () => create(Triple.empty(space, id));

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
              <EntityAttributes entityId={id} space={space} triples={triples} name={name} />
            </Attributes>
          ) : null}
          <AddTripleContainer>
            <Button onClick={onCreateNewTriple} variant="secondary" icon="create">
              Add triple
            </Button>
          </AddTripleContainer>
        </Content>
      </EntityContainer>

      <FlowBar actionsCount={Action.getChangeCount(actions)} spaceId={space} onPublish={publish} />
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
  space,
  triples,
  name,
}: {
  entityId: string;
  space: Props['space'];
  triples: Props['triples'];
  name: string;
}) {
  const { update, remove, create } = useEntityTriples();
  const groupedTriples = groupBy(triples, t => t.attributeId);

  const onChangeTripleType = (type: 'string' | 'entity', triples: TripleType[]) => {
    triples.forEach(triple => {
      update(
        {
          ...triple,
          value: {
            ...(type === 'entity'
              ? { type: 'entity', id: '', name: '' }
              : { type: 'string', id: triple.value.id, value: '' }),
          },
        },
        triple
      );
    });
  };

  const removeOrResetEntityTriple = (triple: TripleType) => {
    if (triple.value.type === 'entity') {
      // When we remove the last linked entity, we just want to set the value to empty
      // instead of completely deleting the last triple.
      // TODO: Set it to entity type instead of string
      if (groupedTriples[triple.attributeId].length === 1) {
        return update(
          {
            ...triple,
            value: { ...triple.value, type: 'entity', id: '' },
          },
          triple
        );
      }
    }

    return remove([triple]);
  };

  const linkEntityAttribute = (oldAttributeId: string, attribute: { id: string; name: string | null }) => {
    const triplesToUpdate = groupedTriples[oldAttributeId];

    if (triplesToUpdate.length > 0) {
      if (groupedTriples[attribute.id]?.length > 0) {
        // If triples at the new id already exists we want the user to use the existing entry method
        return;
      }

      triplesToUpdate.forEach(triple => {
        const newTriple = {
          ...triple,
          attributeId: attribute.id,
          attributeName: attribute.name,
        };

        update(newTriple, triple);
      });
    }
  };

  const addEntityRelationToValue = (attributeId: string, linkedEntity: { id: string; name: string | null }) => {
    // If it's an empty triple value
    if (
      groupedTriples[attributeId]?.length === 1 &&
      groupedTriples[attributeId][0].value.type === 'entity' &&
      !groupedTriples[attributeId][0].value.id
    ) {
      return update(
        {
          ...groupedTriples[attributeId][0],
          value: {
            ...groupedTriples[attributeId][0].value,
            type: 'entity',
            id: linkedEntity.id,
            name: linkedEntity.name,
          },
          attributeName: groupedTriples[attributeId][0].attributeName,
        },
        groupedTriples[attributeId][0]
      );
    }

    create({
      ...groupedTriples[attributeId][0],
      space: space,
      entityId: entityId,
      entityName: name,
      attributeId: attributeId,
      attributeName: groupedTriples[attributeId][0].attributeName,
      value: {
        type: 'entity',
        id: linkedEntity.id,
        name: linkedEntity.name,
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
            onChange={e =>
              update(
                {
                  ...triple,
                  value: { ...triple.value, type: 'string', value: e.target.value },
                },
                triple
              )
            }
            value={triple.value.value}
          />
        );
      case 'number':
        return (
          <NumberField
            key={triple.id}
            placeholder="Add value..."
            onBlur={e =>
              update(
                {
                  ...triple,
                  value: { ...triple.value, type: 'string', value: e.target.value },
                },
                triple
              )
            }
            initialValue={triple.value.value}
          />
        );
      case 'entity':
        if (isEmptyEntity) {
          return (
            <EntityTextAutocomplete
              key={`entity-${attributeId}-${triple.id}`}
              placeholder="Add value..."
              onDone={result => addEntityRelationToValue(attributeId, result)}
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
                onDone={result => linkEntityAttribute(attributeId, result)}
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
                <EntityAutocompleteDialog onDone={entity => addEntityRelationToValue(attributeId, entity)} />
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
                  onClick={() => triples.filter(t => t.attributeId === attributeId).forEach(t => remove(t))}
                />
              </TripleActions>
            </GroupedAttributesList>
          </EntityAttributeContainer>
        );
      })}
    </>
  );
}
