import styled from '@emotion/styled';
import { motion } from 'framer-motion';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import pluralize from 'pluralize';
import { useEffect, useState } from 'react';
import { SmallButton } from '~/modules/design-system/button';
import { Chip } from '~/modules/design-system/chip';
import { ChevronDownSmall } from '~/modules/design-system/icons/chevron-down-small';
import { RightArrowDiagonal } from '~/modules/design-system/icons/right-arrow-diagonal';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { getConfigFromUrl } from '~/modules/params';
import { Network } from '~/modules/services/network';
import { StorageClient } from '~/modules/services/storage';
import { usePageName } from '~/modules/state/use-page-name';
import { EntityNames, Triple } from '~/modules/types';
import { getEntityDescription, getEntityName, groupBy, navUtils, partition } from '~/modules/utils';
import { Tick } from '~/modules/design-system/icons/tick';
import { AnimatePresence } from 'framer-motion';
import { Truncate } from '~/modules/design-system/truncate';

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

const Entities = styled.div(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.space * 3,
}));

const EntityActionGroup = styled.div(({ theme }) => ({
  display: 'flex',
  justifyContent: 'flex-end',
}));

interface Props {
  triples: Triple[];
  id: string;
  name: string;
  space: string;
  entityNames: EntityNames;
  linkedEntities: Record<string, EntityGroup>;
}

const CopyText = styled(Text)`
  display: inline-flex;
  align-items: center;
`;

const MotionCopyText = motion(CopyText);

export default function EntityPage({ triples, id, name, space, entityNames, linkedEntities }: Props) {
  const { setPageName } = usePageName();
  const [copyText, setCopyText] = useState<'Copy ID' | 'Entity ID Copied'>('Copy ID');

  useEffect(() => {
    if (name !== id) setPageName(name);
    return () => setPageName('');
  }, [name, id, setPageName]);

  const onCopyEntityId = () => {
    navigator.clipboard.writeText(id);
    setCopyText('Entity ID Copied');
    setTimeout(() => setCopyText('Copy ID'), 3600);
  };

  const description = getEntityDescription(triples, entityNames);
  const triplesWithoutDescription = triples.filter(t =>
    t.value.type === 'string' ? t.value.value !== description : true
  );

  return (
    <div>
      <Truncate maxLines={3} shouldTruncate>
        <Text as="h1" variant="mainPage">
          {name}
        </Text>
      </Truncate>

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
        <SmallButton
          onClick={onCopyEntityId}
          variant={copyText === 'Entity ID Copied' ? 'tertiary' : 'secondary'}
          icon={copyText === 'Entity ID Copied' ? undefined : 'copy'}
        >
          <AnimatePresence mode="wait">
            {copyText === 'Entity ID Copied' ? (
              <MotionCopyText
                color="white"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                variant="smallButton"
              >
                <Tick />
                <Spacer width={4} />
                {copyText}
              </MotionCopyText>
            ) : (
              <motion.span
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
              >
                {copyText}
              </motion.span>
            )}
          </AnimatePresence>
        </SmallButton>
      </EntityActionGroup>

      <Spacer height={8} />

      <Content>
        <Attributes>
          <EntityAttributes entityId={id} triples={triplesWithoutDescription} space={space} entityNames={entityNames} />
        </Attributes>
      </Content>

      <Spacer height={40} />

      <Text as="h2" variant="mediumTitle">
        Linked by
      </Text>

      <Entities>
        {Object.entries(linkedEntities).length === 0 ? (
          <Text color="grey-04">There are no other entities that are linking to this entity.</Text>
        ) : (
          <>
            <Spacer height={12} />
            {Object.values(linkedEntities).map(group => (
              <LinkedEntityCard
                key={group.id}
                originalEntityId={id}
                entityGroup={group}
                space={space}
                entityNames={entityNames}
              />
            ))}
          </>
        )}
      </Entities>
    </div>
  );
}

function EntityAttribute({ triple, space, entityNames }: { triple: Triple; space: string; entityNames: EntityNames }) {
  return (
    <div key={triple.attributeId}>
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
  );
}

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
      {Object.entries(groupedTriples).map(([attributeId, triples]) => (
        <div key={`${entityId}-entity-attributes-${attributeId}`}>
          <Text as="p" variant="bodySemibold">
            {entityNames[attributeId] || attributeId}
          </Text>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* 
              Have to do some janky layout stuff instead of being able to just use gap since we want different
              height between the attribute name and the attribute value for entities vs strings
            */}
            {triples.map(triple =>
              triple.value.type === 'entity' ? (
                <div style={{ marginTop: 4 }}>
                  <Chip href={navUtils.toEntity(space, triple.value.id)}>
                    {entityNames[triple.value.id] || triple.value.id}
                  </Chip>
                </div>
              ) : (
                <>
                  <Text as="p">{triple.value.value}</Text>
                </>
              )
            )}
          </div>
        </div>
      ))}
    </>
  );
}

const LinkedEntityCardContainer = styled.div(({ theme }) => ({
  borderRadius: theme.radius,
  border: `1px solid ${theme.colors['grey-02']}`,
  overflow: 'hidden',

  ':hover': {
    border: `1px solid ${theme.colors.text}`,

    // @ts-ignore -- This is valid with emotion/styled
    [LinkedEntityCardHeader]: {
      borderColor: theme.colors.text,
    },
  },
}));

const LinkedEntityCardHeader = styled.a(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  verticalAlign: 'top',
  gap: theme.space * 5,

  padding: theme.space * 4,

  div: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.space * 4,
  },

  img: {
    borderRadius: theme.radius,
  },
}));

const IconContainer = styled.div(({ theme }) => ({
  // HACK: Fix visual alignment when aligning the content to the top. The icon does not
  // line up visually because of the text line height.
  marginTop: 6,
}));

const LinkedEntityCardContent = styled.div(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.space * 4,
  padding: theme.space * 4,
  backgroundColor: theme.colors.white,
}));

const LinkedEntityCardFooter = styled.div(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${theme.space * 2}px ${theme.space * 4}px`,
  backgroundColor: theme.colors.white,
}));

const LinkedEntityDescription = styled.div(({ theme }) => ({
  padding: theme.space * 4,
  paddingTop: 0,
  backgroundColor: theme.colors.bg,
}));

function LinkedEntityCard({
  originalEntityId,
  entityGroup,
  space,
  entityNames,
}: {
  originalEntityId: string;
  entityGroup: EntityGroup;
  space: Props['space'];
  entityNames: Props['entityNames'];
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const [linkedTriples, unlinkedTriples] = partition(
    entityGroup.triples,
    t => t.value.type === 'entity' && t.value.id === originalEntityId
  );

  const description = getEntityDescription(entityGroup.triples, entityNames);
  const triplesWithoutDescription = unlinkedTriples.filter(t =>
    t.value.type === 'string' ? t.value.value !== description : true
  );

  const shouldMaximizeContent = Boolean(isExpanded || description || linkedTriples.length > 0);

  return (
    <LinkedEntityCardContainer>
      <Link href={navUtils.toEntity(space, entityGroup.id)} passHref>
        <LinkedEntityCardHeader>
          <Text as="h2" variant="cardEntityTitle">
            {entityGroup.name ?? entityGroup.id}
          </Text>
          {/* Wrap in a div so the svg doesn't get scaled by dynamic flexbox */}
          <IconContainer>
            <RightArrowDiagonal color="grey-04" />
          </IconContainer>
        </LinkedEntityCardHeader>
      </Link>

      {description && (
        <LinkedEntityDescription>
          <Text as="p" color="grey-04">
            {description}
          </Text>
        </LinkedEntityDescription>
      )}

      <LinkedEntityCardContent>
        {shouldMaximizeContent && (
          <>
            {linkedTriples.map((triple, i) => (
              <EntityAttribute
                key={`${triple.attributeId}-${triple.id}-${i}`}
                triple={triple}
                space={space}
                entityNames={entityNames}
              />
            ))}
            {isExpanded && (
              <EntityAttributes
                entityId={entityGroup.id}
                triples={triplesWithoutDescription}
                space={space}
                entityNames={entityNames}
              />
            )}
          </>
        )}
      </LinkedEntityCardContent>

      <LinkedEntityCardFooter>
        <Text variant="breadcrumb">
          {entityGroup.triples.length} {pluralize('value', entityGroup.triples.length)}
        </Text>
        <SmallButton variant="secondary" onClick={() => setIsExpanded(!isExpanded)}>
          <span style={{ rotate: isExpanded ? '180deg' : '0deg' }}>
            <ChevronDownSmall color="grey-04" />
          </span>
          <Spacer width={6} />
          {isExpanded
            ? `Hide ${triplesWithoutDescription.length} more values`
            : `Show ${triplesWithoutDescription.length} more values`}
        </SmallButton>
      </LinkedEntityCardFooter>
    </LinkedEntityCardContainer>
  );
}

type EntityGroup = {
  triples: Triple[];
  name: string | null;
  id: string;
};

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
      filter: [{ field: 'linked-to', value: entityId }],
    }),
  ]);

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

  const linkedEntities: Record<string, EntityGroup> = relatedEntities
    .flatMap(entity => entity.triples)
    .reduce((acc, triple) => {
      if (!acc[triple.entityId]) acc[triple.entityId] = { triples: [], name: null, id: triple.entityId };
      acc[triple.entityId].id = triple.entityId;
      acc[triple.entityId].name = triple.entityName;
      acc[triple.entityId].triples = [...acc[triple.entityId].triples, triple]; // Duplicates?
      return acc;
    }, {} as Record<string, EntityGroup>);

  const relatedEntityAttributeNames = relatedEntities.reduce((acc, { entityNames }) => {
    return { ...acc, ...entityNames };
  }, {} as EntityNames);

  return {
    props: {
      triples: entity.triples,
      id: entityId,
      name: getEntityName(entity.triples) ?? entityId,
      space,
      entityNames: {
        ...entity.entityNames,
        ...related.entityNames,
        ...relatedEntityAttributeNames,
      },
      linkedEntities,
      key: entityId,
    },
  };
};
