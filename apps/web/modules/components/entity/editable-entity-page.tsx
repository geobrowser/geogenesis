import styled from '@emotion/styled';
import Head from 'next/head';
import { Chip } from '~/modules/design-system/chip';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { createTripleWithId, createValueId } from '~/modules/services/create-id';
import { useEntityTriples } from '~/modules/state/use-entity-triples';
import { EntityNames, Triple } from '~/modules/types';
import { getEntityDescription, getEntityName, groupBy, navUtils } from '~/modules/utils';
import { FlowBar } from '../flow-bar';
import { CopyIdButton } from './copy-id';
import { StringField } from './editable-fields';

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

        {description && (
          <>
            <Spacer height={16} />
            <Text as="p" color="grey-04">
              {description}
            </Text>
          </>
        )}

        <Spacer height={16} />

        <EntityActionGroup>
          <CopyIdButton id={id} />
        </EntityActionGroup>

        <Spacer height={8} />

        <Content>
          <Attributes>
            <EntityAttributes entityId={id} triples={triples} space={space} entityNames={entityNames} />
          </Attributes>
        </Content>
      </EntityContainer>

      <FlowBar actionsCount={actions.length} onPublish={publish} />
    </PageContainer>
  );
}

const EntityAttributeContainer = styled.div({
  wordBreak: 'break-word',
});

const GroupedAttributes = styled.div(({ theme }) => ({
  display: 'flex',
  gap: theme.space * 2,
  flexWrap: 'wrap',
}));

function EntityAttributes({
  entityId,
  triples,
  space,
  entityNames,
}: {
  entityId: string;
  triples: Props['triples'];
  space: Props['space'];
  entityNames: Props['entityNames'];
}) {
  const { update } = useEntityTriples();
  const groupedTriples = groupBy(triples, t => t.attributeId);

  return (
    <>
      {Object.entries(groupedTriples).map(([attributeId, triples], index) => (
        <EntityAttributeContainer key={`${entityId}-entity-attributes-${attributeId}-${index}`}>
          <Text as="p" variant="bodySemibold">
            {entityNames[attributeId] || attributeId}
          </Text>
          <GroupedAttributes>
            {/* 
              Have to do some janky layout stuff instead of being able to just use gap since we want different
              height between the attribute name and the attribute value for entities vs strings
            */}
            {triples.map(triple =>
              triple.value.type === 'entity' ? (
                <div key={`entity-${triple.id}`} style={{ marginTop: 4 }}>
                  <Chip href={navUtils.toEntity(space, triple.value.id)}>
                    {entityNames[triple.value.id] || triple.value.id}
                  </Chip>
                </div>
              ) : (
                <>
                  <StringField
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
                </>
              )
            )}
          </GroupedAttributes>
        </EntityAttributeContainer>
      ))}
    </>
  );
}
