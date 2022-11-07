import styled from '@emotion/styled';
import { GetServerSideProps } from 'next';
import { useEffect } from 'react';
import { Chip } from '~/modules/design-system/chip';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { getConfigFromUrl } from '~/modules/params';
import { extractValue, NetworkTriple } from '~/modules/services/network';
import { useNav } from '~/modules/state/nav-store';
import { EntityNames, Triple } from '~/modules/types';

const MainAttributes = styled.div(props => ({
  marginBottom: props.theme.space * 8,
}));

const Attributes = styled.div(props => ({
  display: 'grid',
  gap: props.theme.space * 6,
}));

export default function EntityPage({
  triples,
  id,
  name,
  space,
  entityNames,
}: {
  triples: Triple[];
  id: string;
  name: string;
  space: string;
  entityNames: EntityNames;
}) {
  const { setPageName } = useNav();

  useEffect(() => {
    if (name !== id) setPageName(name);
  }, [name, id, setPageName]);

  return (
    <div>
      <MainAttributes>
        <Text as="p" variant="largeTitle">
          {name}
        </Text>
      </MainAttributes>

      <Attributes>
        {triples.map(triple => (
          <div key={triple.id}>
            <Text as="p" variant="metadata">
              {entityNames[triple.attributeId] || triple.attributeId}
            </Text>
            <Spacer height={8} />
            {triple.value.type === 'entity' ? (
              <Chip href={`/space/${space}/${triple.value.id}`}>{entityNames[triple.value.id] || triple.value.id}</Chip>
            ) : (
              <Text as="p" variant="metadataMedium">
                {triple.value.value}
              </Text>
            )}
          </div>
        ))}
      </Attributes>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async context => {
  const space = context.query.id as string;
  const entityId = context.query.entityId as string;
  const stringifyEntity = JSON.stringify(entityId);
  const config = getConfigFromUrl(context.resolvedUrl);

  const response = await fetch(config.subgraph, {
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
          valueId
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
      space: space,
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

  const nameValue = triples.find(triple => triple.attributeId === 'name')?.value;
  const name = nameValue?.type === 'string' ? nameValue.value : entityId;

  return {
    props: {
      triples,
      id: entityId,
      name,
      space: space,
      entityNames,
    },
  };
};
