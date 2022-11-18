import styled from '@emotion/styled';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import pluralize from 'pluralize';
import { useEffect, useState } from 'react';
import { Chip } from '~/modules/design-system/chip';
import { Entity } from '~/modules/design-system/icons/entity';
import { Facts } from '~/modules/design-system/icons/facts';
import { RightArrowDiagonal } from '~/modules/design-system/icons/right-arrow-diagonal';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { ToggleButton } from '~/modules/design-system/toggle-button';
import { getConfigFromUrl } from '~/modules/params';
import { Network } from '~/modules/services/network';
import { StorageClient } from '~/modules/services/storage';
import { usePageName } from '~/modules/state/use-page-name';
import { EntityNames, Triple } from '~/modules/types';
import { getEntityDescription, getEntityName, navUtils } from '~/modules/utils';

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

export default function EntityPage({ triples, id, name, space, entityNames, entityGroups }: Props) {
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
            <Entity color={step === 'related' ? 'white' : `grey-04`} />
            <Spacer width={8} />
            Linked by
          </ToggleButton>
        </ToggleGroup>

        <Attributes>
          {step === 'entity' && <EntityAttributes triples={triples} space={space} entityNames={entityNames} />}
          {step === 'related' && (
            <RelatedEntities entityGroups={entityGroups} space={space} entityNames={entityNames} />
          )}
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
  triples: Props['triples'];
  space: Props['space'];
  entityNames: Props['entityNames'];
}) {
  return (
    <>
      {triples.map(triple => (
        <div key={triple.id}>
          <Text as="p" variant="bodySemibold">
            {entityNames[triple.attributeId] || triple.attributeId}
          </Text>
          {triple.value.type === 'entity' ? (
            <>
              <Spacer height={4} />
              <Chip href={navUtils.toEntity(space, triple.value.id)}>
                {entityNames[triple.value.id] || triple.value.id}
              </Chip>
            </>
          ) : (
            <Text as="p">{triple.value.value}</Text>
          )}
        </div>
      ))}
    </>
  );
}

function RelatedEntities({
  entityGroups,
  space,
  entityNames,
}: {
  entityGroups: Props['entityGroups'];
  space: Props['space'];
  entityNames: Props['entityNames'];
}) {
  return (
    <>
      {Object.values(entityGroups).map(group => (
        <EntityCard key={group.id} entityGroup={group} space={space} entityNames={entityNames} />
      ))}
    </>
  );
}

const EntityCardContainer = styled.a(({ theme }) => ({
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

const EntityAttribute = styled.div(({ theme }) => ({}));

const EntityCardContent = styled.div(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.space * 4,
  padding: theme.space * 4,
}));

const EntityCardFooter = styled.div(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: `${theme.space * 2}px ${theme.space * 4}px`,
  backgroundColor: theme.colors.bg,
}));

function EntityCard({
  entityGroup,
  space,
  entityNames,
}: {
  entityGroup: EntityGroup;
  space: Props['space'];
  entityNames: Props['entityNames'];
}) {
  return (
    <Link href={navUtils.toEntity(space, entityGroup.id)} passHref>
      <EntityCardContainer>
        <EntityCardHeader>
          <div>
            <img src="/facts-medium.svg" alt="Icon representing entities in the Geo database" />
            <Text as="h2" variant="mediumTitle">
              {entityGroup.name ?? entityGroup.id}
            </Text>
          </div>
          <RightArrowDiagonal color="grey-04" />
        </EntityCardHeader>

        <EntityCardContent>
          {entityGroup.description && (
            <div>
              <Text as="p" variant="bodySemibold">
                Description
              </Text>
              <Text as="p" color="grey-04">
                {entityGroup.description}
              </Text>
            </div>
          )}
          {entityGroup.triples.map(triple => (
            <div key={triple.id}>
              <Text as="p" variant="bodySemibold">
                {entityNames[triple.attributeId] || triple.attributeId}
              </Text>
              {triple.value.type === 'entity' ? (
                <>
                  <Spacer height={4} />
                  <Chip href={navUtils.toEntity(space, triple.value.id)}>
                    {entityNames[triple.value.id] || triple.value.id}
                  </Chip>
                </>
              ) : (
                <Text as="p">{triple.value.value}</Text>
              )}
            </div>
          ))}
        </EntityCardContent>
        <EntityCardFooter>
          <Text variant="breadcrumb">
            {entityGroup.triples.length} {pluralize('value', entityGroup.triples.length)}
          </Text>
        </EntityCardFooter>
      </EntityCardContainer>
    </Link>
  );
}

type EntityGroup = {
  triples: Triple[];
  name: string | null;
  description: string | null;
  id: string;
};

interface Props {
  triples: Triple[];
  id: string;
  name: string;
  space: string;
  entityNames: EntityNames;
  entityGroups: Record<string, EntityGroup>;
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

  // TODO: Is there a better way to do this?
  const relatedEntities = await Promise.all(
    related.triples.map(triple =>
      new Network(storage, config.subgraph).fetchTriples({
        space,
        query: '',
        skip: 0,
        first: 100,
        filter: [{ field: 'entity-id', value: triple.entityId }],
      })
    )
  );

  const entityGroups: Record<string, EntityGroup> = relatedEntities
    .flatMap(entity => entity.triples)
    .reduce((acc, triple) => {
      if (!acc[triple.entityId])
        acc[triple.entityId] = { triples: [], name: null, description: null, id: triple.entityId };

      acc[triple.entityId].id = triple.entityId;
      acc[triple.entityId].name = triple.entityName;

      acc[triple.entityId].triples = [...acc[triple.entityId].triples, triple]; // Duplicates?
      if (triple.attributeId === 'Description' && triple.value.type === 'string') {
        acc[triple.entityId].description = triple.value.value;
        acc[triple.entityId].triples = acc[triple.entityId].triples.filter(
          triple => triple.attributeId !== 'Description'
        );
      }

      return acc;
    }, {} as Record<string, EntityGroup>);

  return {
    props: {
      triples: entity.triples,
      id: entityId,
      name: getEntityName(entity.triples) ?? entityId,
      space,
      entityNames: entity.entityNames,
      entityGroups,
    },
  };
};
