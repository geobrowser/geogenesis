import styled from '@emotion/styled';
import Head from 'next/head';
import { Button, SquareButton } from '~/modules/design-system/button';
import { ChipButton } from '~/modules/design-system/chip';
import { Text as TextIcon } from '~/modules/design-system/icons/text';
import { Relation } from '~/modules/design-system/icons/relation';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { createTripleWithId, createValueId } from '~/modules/services/create-id';
import { useEntityTriples } from '~/modules/state/use-entity-triples';
import { EntityNames, Triple } from '~/modules/types';
import { getEntityDescription, getEntityName, groupBy } from '~/modules/utils';
import { EntityAutocompleteDialog } from './entity-autocomplete';
import { FlowBar } from '../flow-bar';
import { CopyIdButton } from './copy-id';
import { NumberField, StringField } from './editable-fields';
import { TripleTypeDropdown } from './triple-type-dropdown';
import { useAutocomplete } from './autocomplete';
import { Action } from './Action';
import { SYSTEM_IDS } from '~/modules/constants';

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
  triples: Triple[];
  id: string;
  name: string;
  space: string;
  entityNames: EntityNames;
}

export function EditableEntityPage({
  id,
  name: serverName,
  space,
  triples: serverTriples,
  entityNames: serverEntityNames,
}: Props) {
  const { triples: localTriples, actions, publish, update, create, entityNames: localEntityNames } = useEntityTriples();

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  const triples = localTriples.length === 0 && actions.length === 0 ? serverTriples : localTriples;
  const entityNames = Object.keys(localEntityNames).length === 0 ? serverEntityNames : localEntityNames;

  const nameTriple = triples.find(t => t.attributeId === SYSTEM_IDS.NAME);
  const descriptionTriple = triples.find(
    t => t.attributeId === SYSTEM_IDS.DESCRIPTION || t.attributeId === 'Description'
  );
  const description = getEntityDescription(triples, entityNames);
  const name = getEntityName(triples) ?? serverName;

  const onNameChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!nameTriple) {
      return create(
        createTripleWithId(space, id, 'name', { id: createValueId(), type: 'string', value: e.target.value })
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
        createTripleWithId(space, id, 'Description', {
          id: createValueId(),
          type: 'string',
          value: e.target.value,
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

  const onCreateNewTriple = () => {
    create(createTripleWithId(space, id, 'banana', { id: createValueId(), type: 'string', value: '' }));
  };

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
          <Attributes>
            <EntityAttributes entityId={id} space={space} triples={triples} entityNames={entityNames} />
          </Attributes>
          <AddTripleContainer>
            <Button onClick={onCreateNewTriple} variant="secondary" icon="create">
              Add triple
            </Button>
          </AddTripleContainer>
        </Content>
      </EntityContainer>

      <FlowBar actionsCount={Action.getChangeCount(actions)} onPublish={publish} />
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
  entityNames,
}: {
  entityId: string;
  space: Props['space'];
  triples: Props['triples'];
  entityNames: Props['entityNames'];
}) {
  const { update, remove, create } = useEntityTriples();
  const groupedTriples = groupBy(triples, t => t.attributeId);
  const autocomplete = useAutocomplete();

  const onChangeTripleType = (type: 'string' | 'entity', triples: Triple[]) => {
    triples.forEach(triple => {
      update(
        {
          ...triple,
          value: {
            ...triple.value,
            type,
            value: '',
            ...(type === 'entity' ? { id: '' } : {}),
          },
        },
        triple
      );
    });
  };

  const removeOrResetEntityTriple = (triple: Triple) => {
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

  const linkEntityToAttribute = (attributeId: string, linkedEntity: { id: string; name: string | null }) => {
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
          },
          attributeName: linkedEntity.name,
        },
        groupedTriples[attributeId][0]
      );
    }

    create({
      ...createTripleWithId({
        space: space,
        entityId: entityId,
        attributeId: attributeId,
        value: {
          type: 'entity',
          id: linkedEntity.id,
        },
      }),
      attributeName: linkedEntity.name,
    });
  };

  const tripleToEditableField = (attributeId: string, triple: Triple) => {
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
        if (!triple.value.id) {
          // return (
          //   <EntityAutocompleteText
          //     key={`entity-${attributeId}-${triple.id}`}
          //     autocomplete={autocomplete}
          //     onDone={entity => linkEntityToAttribute(attributeId, entity)}
          //   />
          // );
          return null;
        }

        return (
          <div key={`entity-${triple.id}`}>
            <ChipButton icon="check-close" onClick={() => removeOrResetEntityTriple(triple)}>
              {entityNames[triple.value.id] || triple.value.id}
            </ChipButton>
          </div>
        );
    }
  };

  return (
    <>
      {Object.entries(groupedTriples).map(([attributeId, triples], index) => {
        const isEntityGroup = triples.find(t => t.value.type === 'entity');
        // const isEmptyEntity = triples.length === 1 && triples[0].value.type === 'entity' && !triples[0].value.id;

        return (
          <EntityAttributeContainer key={`${entityId}-${attributeId}-${index}`}>
            <Text as="p" variant="bodySemibold">
              {entityNames[attributeId] || attributeId}
            </Text>
            <GroupedAttributesList>
              {/* 
                Have to do some janky layout stuff instead of being able to just use gap since we want different
                height between the attribute name and the attribute value for entities vs strings
              */}
              {triples.map(triple => tripleToEditableField(attributeId, triple))}
              {isEntityGroup && (
                <EntityAutocompleteDialog
                  autocomplete={autocomplete}
                  onDone={entity => linkEntityToAttribute(attributeId, entity)}
                />
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
                <SquareButton icon="trash" onClick={() => remove(triples.filter(t => t.attributeId === attributeId))} />
              </TripleActions>
            </GroupedAttributesList>
          </EntityAttributeContainer>
        );
      })}
    </>
  );
}
