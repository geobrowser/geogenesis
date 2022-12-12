import styled from '@emotion/styled';
import Head from 'next/head';
import { SquareButton } from '~/modules/design-system/button';
import { ChipButton } from '~/modules/design-system/chip';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { createTripleWithId, createValueId } from '~/modules/services/create-id';
import { useEntityTriples } from '~/modules/state/use-entity-triples';
import { EntityNames, Triple } from '~/modules/types';
import { getEntityDescription, getEntityName, groupBy } from '~/modules/utils';
import { EntityAutocompleteDialog } from '../entity-autocomplete';
import { FlowBar } from '../flow-bar';
import { CopyIdButton } from './copy-id';
import { NumberField, StringField } from './editable-fields';

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

interface Props {
  triples: Triple[];
  id: string;
  name: string;
  space: string;
  entityNames: EntityNames;
}

export function EditableEntityPage({ id, name: serverName, space, triples: serverTriples, entityNames }: Props) {
  const { triples: localTriples, actions, publish, update, create } = useEntityTriples();

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  const triples = localTriples.length === 0 ? serverTriples : localTriples;
  const nameTriple = triples.find(t => t.attributeId === 'name');
  const descriptionTriple = triples.find(t => t.attributeId === 'Description');
  const description = getEntityDescription(triples, entityNames);
  const name = getEntityName(triples) ?? serverName;

  const onNameBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (!nameTriple) {
      return create([
        createTripleWithId(space, id, 'name', { id: createValueId(), type: 'string', value: e.target.value }),
      ]);
    }

    update(
      {
        ...nameTriple,
        value: { ...nameTriple.value, type: 'string', value: e.target.value },
      },
      nameTriple
    );
  };

  const onDescriptionBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (!descriptionTriple) {
      return create([
        createTripleWithId(space, id, 'Description', { id: createValueId(), type: 'string', value: e.target.value }),
      ]);
    }

    update(
      {
        ...descriptionTriple,
        value: { ...descriptionTriple.value, type: 'string', value: e.target.value },
      },
      descriptionTriple
    );
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
          initialValue={name ?? id}
          onBlur={onNameBlur}
        />

        <Spacer height={16} />
        <StringField
          variant="body"
          placeholder="Add a description..."
          initialValue={description ?? ''}
          onBlur={onDescriptionBlur}
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
        </Content>
      </EntityContainer>

      <FlowBar actionsCount={actions.length} onPublish={publish} />
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

const GroupedAttributes = styled.div(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.space,
  flexWrap: 'wrap',
}));

const AddEntityButton = styled(SquareButton)({
  width: 23,
  height: 23,
});

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
  const { create, update, remove } = useEntityTriples();
  const groupedTriples = groupBy(triples, t => t.attributeId);

  const linkEntityToAttribute = (attributeId: string, linkedEntity: { id: string; name: string | null }) => {
    create([
      {
        ...createTripleWithId({
          space: space,
          entityId: entityId,
          attributeId: attributeId,
          value: {
            type: 'entity',
            id: linkedEntity.id,
          },
        }),
        entityName: linkedEntity.name,
      },
    ]);
  };

  const tripleToEditableField = (triple: Triple) => {
    switch (triple.value.type) {
      case 'string':
        return (
          <StringField
            key={triple.id}
            variant="body"
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
        return (
          <div key={`entity-${triple.id}`}>
            <ChipButton icon="check-close" onClick={() => remove([triple])}>
              {entityNames[triple.value.id] || triple.value.id}
            </ChipButton>
          </div>
        );
    }
  };

  return (
    <>
      {Object.entries(groupedTriples).map(([attributeId, triples], index) => (
        <EntityAttributeContainer key={`${entityId}-${attributeId}-${index}`}>
          <Text as="p" variant="bodySemibold">
            {entityNames[attributeId] || attributeId}
          </Text>
          <GroupedAttributes>
            {/* 
              Have to do some janky layout stuff instead of being able to just use gap since we want different
              height between the attribute name and the attribute value for entities vs strings
            */}
            {triples.map(tripleToEditableField)}
            {triples.find(t => t.value.type === 'entity') && (
              <EntityAutocompleteDialog
                withSearch={triples.length > 0}
                trigger={<AddEntityButton icon="createSmall" />}
                onDone={entity => linkEntityToAttribute(attributeId, entity)}
              />
            )}
            <TripleActions>
              <SquareButton icon="relation" />
              <SquareButton icon="trash" onClick={() => remove(triples.filter(t => t.attributeId === attributeId))} />
            </TripleActions>
          </GroupedAttributes>
        </EntityAttributeContainer>
      ))}
    </>
  );
}
