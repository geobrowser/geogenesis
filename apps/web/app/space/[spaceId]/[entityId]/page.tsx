import { use } from 'react';
import { configOptions } from '~/modules/config';
import { getConfigFromUrl } from '~/modules/params';
import { extractValue, NetworkTriple } from '~/modules/services/network';
import { EntityNames, Triple } from '~/modules/types';
import { EntityPage } from './entity-page';

interface Props {
  params: {
    spaceId: string;
    entityId: string;
  };
}

async function getEntityData({ spaceId, entityId }: Props['params']) {
  const stringifyEntity = JSON.stringify(entityId);
  // const config = getConfigFromUrl(context.resolvedUrl);

  const response = await fetch(configOptions.development.subgraph, {
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

  const nameValue = triples.find(triple => triple.attributeId === 'name')?.value;
  const name = nameValue?.type === 'string' ? nameValue.value : entityId;

  return {
    triples,
    id: entityId,
    name,
    space: spaceId,
    entityNames,
  };
}

export default async function Page(props: Props) {
  const entityData = await getEntityData(props.params);
  return <EntityPage {...entityData} />;
}
