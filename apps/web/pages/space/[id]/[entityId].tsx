import styled from '@emotion/styled';
import { GetServerSideProps } from 'next';
import { useEffect, useState } from 'react';
import { Chip } from '~/modules/design-system/chip';
import { Copy } from '~/modules/design-system/icons/copy';
import { Facts } from '~/modules/design-system/icons/facts';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { ToggleButton } from '~/modules/design-system/toggle-button';
import { getConfigFromUrl } from '~/modules/params';
import { extractValue, NetworkTriple } from '~/modules/services/network';
import { usePageName } from '~/modules/state/use-page-name';
import { EntityNames, Triple } from '~/modules/types';

const Content = styled.div(({ theme }) => ({
  boxShadow: theme.shadows.button,
  borderRadius: theme.radius,
  backgroundColor: theme.colors.white,
}));

const Attributes = styled.div(({ theme }) => ({
  display: 'grid',
  gap: theme.space * 6,
  padding: theme.space * 5,
}));

const ToggleGroup = styled.div(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.space * 5,
  padding: theme.space * 5,
  borderBottom: `1px solid ${theme.colors.divider}`,
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
  const { setPageName } = usePageName();
  const [step, setStep] = useState<'entity' | 'related'>('entity');

  useEffect(() => {
    if (name !== id) setPageName(name);
    return () => setPageName('');
  }, [name, id, setPageName]);

  return (
    <div>
      <Text as="h1" variant="mainPage">
        {name}
      </Text>

      <Spacer height={40} />

      <Content>
        <ToggleGroup>
          <ToggleButton isActive={step === 'entity'} onClick={() => setStep('entity')}>
            <Facts color={step === 'entity' ? 'white' : `grey-04`} />
            <Spacer width={8} />
            Entity data
          </ToggleButton>

          <ToggleButton isActive={step === 'related'} onClick={() => setStep('related')}>
            <Copy color={step === 'related' ? 'white' : `grey-04`} />
            <Spacer width={8} />
            Related to
          </ToggleButton>
        </ToggleGroup>

        <Attributes>
          {triples.map(triple => (
            <div key={triple.id}>
              <Text as="p" variant="bodySemibold">
                {entityNames[triple.attributeId] || triple.attributeId}
              </Text>
              {triple.value.type === 'entity' ? (
                <Chip href={`/space/${space}/${triple.value.id}`}>
                  {entityNames[triple.value.id] || triple.value.id}
                </Chip>
              ) : (
                <Text as="p">{triple.value.value}</Text>
              )}
            </div>
          ))}
        </Attributes>
      </Content>
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
