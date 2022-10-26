import styled from '@emotion/styled';
import { GetServerSideProps } from 'next';
import { Text } from '~/modules/design-system/text';
import { extractValue, NetworkTriple } from '~/modules/services/network';
import { EntityNames, Triple } from '~/modules/types';

const MainAttributes = styled.div(props => ({
  marginBottom: props.theme.space * 8,
}));

const Attributes = styled.div(props => ({
  display: 'grid',
  gap: props.theme.space * 4,
  gridTemplateColumns: 'repeat(2, 1fr)',

  '&:nth-child(4n + 2)': {
    gridRow: 1,
  },
}));

export default function TriplesPage({
  triples,
  id,
  name,
  spaceId,
  entityNames,
}: {
  triples: Triple[];
  id: string;
  name: string;
  spaceId: string;
  entityNames: EntityNames;
}) {
  return (
    <div>
      <MainAttributes>
        <Text variant="largeTitle">id: {id}</Text>
        <Text variant="largeTitle">name: {name}</Text>
        <Text variant="largeTitle">spaceId: {spaceId}</Text>
      </MainAttributes>

      <Attributes>
        {triples.map(triple => (
          <div key={triple.attributeId}>{entityNames[triple.attributeId] || triple.attributeId}</div>
        ))}
        {triples.map(triple => (
          <div key={triple.id}>{entityNames[triple.value.value] || triple.value.value}</div>
        ))}
      </Attributes>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async context => {
  const spaceId = context.query.id as string;
  const entityId = context.query.entityId as string;

  const stringifyEntity = JSON.stringify(entityId);

  const response = await fetch('https://graph-node-8000-dabbott.cloud.okteto.net/subgraphs/name/example', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `query {
        triples(where: {entity_: {id: ${stringifyEntity}}}) {
          id
          attribute {
            id
            name
          }
          entity {
            id
            name
          }
          entityValue {
            id
            name
          }
          numberValue
          stringValue
          valueType
          isProtected
        }
      }`,
    }),
  });

  const json: {
    data: {
      triples: NetworkTriple[];
    };
  } = await response.json();

  const triples = json.data.triples.map((networkTriple): Triple => {
    return {
      id: networkTriple.id,
      entityId: networkTriple.entity.id,
      attributeId: networkTriple.attribute.id,
      value: extractValue(networkTriple),
      space: spaceId,
    };
  });

  const entityNames: EntityNames = json.data.triples.reduce((acc, triple) => {
    if (triple.entity.name !== null) {
      acc[triple.entity.id] = triple.entity.name;
    }

    if (triple.valueType === 'ENTITY') {
      acc[triple.entityValue.id] = triple.entityValue.name;
    }

    if (triple.attribute.name !== null) {
      acc[triple.attribute.id] = triple.attribute.name;
    }
    return acc;
  }, {} as EntityNames);

  return {
    props: {
      triples,
      id: entityId,
      name: triples.find(triple => triple.attributeId === 'name')?.value.value || '',
      space: spaceId,
      entityNames,
    },
  };
};
