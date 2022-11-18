import styled from '@emotion/styled';
import { GetServerSideProps } from 'next';
import { useEffect, useState } from 'react';
import { Chip } from '~/modules/design-system/chip';
import { Copy } from '~/modules/design-system/icons/copy';
import { Facts } from '~/modules/design-system/icons/facts';
import { RightArrowDiagonal } from '~/modules/design-system/icons/right-arrow-diagonal';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { ToggleButton } from '~/modules/design-system/toggle-button';
import { getConfigFromUrl } from '~/modules/params';
import { Network } from '~/modules/services/network';
import { StorageClient } from '~/modules/services/storage';
import { usePageName } from '~/modules/state/use-page-name';
import { EntityNames, StringValue, Triple } from '~/modules/types';

const Content = styled.div(({ theme }) => ({
  boxShadow: theme.shadows.button,
  borderRadius: theme.radius,
  backgroundColor: theme.colors.white,
}));

const Header = styled.header(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.space * 5,

  img: {
    borderRadius: theme.radius,
  },
}));

const Attributes = styled.div(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
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

export default function EntityPage({ triples, relatedTriples, id, name, space, entityNames }: Props) {
  const { setPageName } = usePageName();
  const [step, setStep] = useState<'entity' | 'related'>('entity');

  useEffect(() => {
    if (name !== id) setPageName(name);
    return () => setPageName('');
  }, [name, id, setPageName]);

  return (
    <div>
      <Header>
        <img src="/facts-large.svg" alt="Icon representing entities in the Geo database" />
        <Text as="h1" variant="mainPage">
          {name}
        </Text>
      </Header>

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
          {step === 'entity' && <EntityAttributes triples={triples} space={space} entityNames={entityNames} />}
          {step === 'related' && <RelatedEntities triples={relatedTriples} space={space} entityNames={entityNames} />}
        </Attributes>
      </Content>
    </div>
  );
}

function EntityAttributes({
  triples,
  space,
  entityNames,
}: {
  triples: Triple[];
  space: string;
  entityNames: EntityNames;
}) {
  return (
    <>
      {triples.map(triple => (
        <div key={triple.id}>
          <Text as="p" variant="bodySemibold">
            {entityNames[triple.attributeId] || triple.attributeId}
          </Text>
          {triple.value.type === 'entity' ? (
            <Chip href={`/space/${space}/${triple.value.id}`}>{entityNames[triple.value.id] || triple.value.id}</Chip>
          ) : (
            <Text as="p">{triple.value.value}</Text>
          )}
        </div>
      ))}
    </>
  );
}

function RelatedEntities({
  triples,
  space,
  entityNames,
}: {
  triples: Triple[];
  space: string;
  entityNames: EntityNames;
}) {
  return <EntityCard triples={triples} />;
}

const EntityCardContainer = styled.div(({ theme }) => ({
  borderRadius: theme.radius,
  border: `1px solid ${theme.colors['grey-02']}`,
  overflow: 'hidden',
}));

const EntityCardHeader = styled.header(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',

  padding: theme.space * 3,
  borderBottom: `1px solid ${theme.colors['grey-02']}`,

  div: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.space * 3,
  },

  img: {
    borderRadius: theme.radius,
  },
}));

const EntityCardContent = styled.div(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  padding: theme.space * 4,
}));

const EntityCardFooter = styled.div(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: `${theme.space * 2}px ${theme.space * 4}px`,
  backgroundColor: theme.colors.bg,
}));

function EntityCard({ triples }: { triples: Triple[] }) {
  // TODO: Fix this wonkiness
  const name = 'Unnamed';

  return (
    <EntityCardContainer>
      <EntityCardHeader>
        <div>
          <img src="/facts-medium.svg" alt="Icon representing entities in the Geo database" />
          <Text as="h2" variant="mediumTitle">
            {name}
          </Text>
        </div>
        <RightArrowDiagonal color="grey-04" />
      </EntityCardHeader>
      <EntityCardContent>Hello world</EntityCardContent>
      <EntityCardFooter>
        <Text variant="breadcrumb">{triples.length} values</Text>
      </EntityCardFooter>
    </EntityCardContainer>
  );
}

type EntityGroup = {
  triples: Triple[];
  name: string;
  description: string;
  id: string;
};

interface Props {
  triples: Triple[];
  relatedTriples: Triple[];
  id: string;
  name: string;
  space: string;
  entityNames: EntityNames;
  entityGroups: EntityGroup[];
}

export const getServerSideProps: GetServerSideProps<Props> = async context => {
  const space = context.query.id as string;
  const entityId = context.query.entityId as string;
  const config = getConfigFromUrl(context.resolvedUrl);

  const storage = new StorageClient(config.ipfs);

  const [entity, related] = await Promise.all([
    new Network(storage, config.subgraph).fetchTriples({
      space,
      query: '',
      skip: 0,
      first: 100,
      filter: [{ field: 'entity-id', value: entityId }],
    }),

    new Network(storage, config.subgraph).fetchTriples({
      space,
      query: '',
      skip: 0,
      first: 100,
      filter: [{ field: 'relates-to', value: entityId }],
    }),
  ]);

  const nameValue = entity.triples.find(triple => triple.attributeId === 'name')?.value;
  const name = nameValue?.type === 'string' ? nameValue.value : entityId;
  // TODO: entityDescription

  // TODO:
  // Group by entityId
  // Add entityName and entityDescription to each group

  return {
    props: {
      triples: entity.triples,
      relatedTriples: related.triples,
      id: entityId,
      name,
      space: space,
      entityNames: entity.entityNames,
      entityGroups: [],
    },
  };
};
