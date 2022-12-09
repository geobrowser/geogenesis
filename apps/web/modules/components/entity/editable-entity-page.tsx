import styled from '@emotion/styled';
import Head from 'next/head';
import { useEffect } from 'react';
import { Chip } from '~/modules/design-system/chip';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { useEntityStore } from '~/modules/state/entity-store-provider';
import { usePageName } from '~/modules/state/use-page-name';
import { EntityNames, Triple } from '~/modules/types';
import { getEntityDescription, groupBy, navUtils } from '~/modules/utils';
import { StringField } from './editable-fields';

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

interface Props {
  triples: Triple[];
  id: string;
  name: string;
  space: string;
  entityNames: EntityNames;
}

// TODO: Can probably scope down the Triples store for just reading data in the triples table

export function EditableEntityPage({ id, name, space, triples: serverTriples, entityNames }: Props) {
  const { setPageName } = usePageName();
  const { triples: localTriples } = useEntityStore();

  // This is a janky way to set the name in the navbar until we have nested layouts
  // and the navbar can query the name itself in a nice way.
  useEffect(() => {
    if (name !== id) setPageName(name);
    return () => setPageName('');
  }, [name, id, setPageName]);

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  const triples = localTriples.length === 0 ? serverTriples : localTriples;

  const description = getEntityDescription(triples, entityNames);
  const triplesWithoutDescription = triples.filter(t =>
    t.value.type === 'entity'
      ? entityNames[t.value.id] !== description
      : t.value.type === 'string'
      ? t.value.value !== description
      : false
  );

  return (
    <div>
      <Head>
        <title>{name ?? id}</title>
        <meta property="og:url" content={`https://geobrowser.io/spaces/${id}`} />
      </Head>

      <Text as="h1" variant="mainPage">
        {name}
      </Text>

      {description && (
        <>
          <Spacer height={16} />
          <Text as="p" color="grey-04">
            {description}
          </Text>
        </>
      )}

      <Spacer height={8} />

      <Content>
        <Attributes>
          <EntityAttributes entityId={id} triples={triplesWithoutDescription} space={space} entityNames={entityNames} />
        </Attributes>
      </Content>
    </div>
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
                    placeholder="Add value..."
                    // onChange={tripleStore etc etc}
                    defaultValue={triple.value.value}
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
