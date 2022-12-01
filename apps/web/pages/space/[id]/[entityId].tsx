import styled from '@emotion/styled';
import { motion } from 'framer-motion';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import pluralize from 'pluralize';
import { useEffect, useState } from 'react';
import { Button, SmallButton } from '~/modules/design-system/button';
import { Chip } from '~/modules/design-system/chip';
import { ChevronDownSmall } from '~/modules/design-system/icons/chevron-down-small';
import { RightArrowDiagonal } from '~/modules/design-system/icons/right-arrow-diagonal';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { TabButton } from '~/modules/design-system/tab-button';
import { getConfigFromUrl } from '~/modules/params';
import { Network } from '~/modules/services/network';
import { StorageClient } from '~/modules/services/storage';
import { usePageName } from '~/modules/state/use-page-name';
import { EntityNames, Triple } from '~/modules/types';
import { getEntityName, groupBy, navUtils } from '~/modules/utils';
import { Tick } from '~/modules/design-system/icons/tick';
import { AnimatePresence } from 'framer-motion';

const Content = styled.div(({ theme }) => ({
  boxShadow: theme.shadows.button,
  border: `1px solid ${theme.colors['grey-02']}`,
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

const Entities = styled.div(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.space * 3,
  padding: theme.space * 5,
}));

const ToggleGroup = styled.div(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: theme.space * 5,
  borderBottom: `1px solid ${theme.colors['grey-02']}`,

  div: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.space * 2,
  },
}));

const EntityId = styled.p(props => ({
  ...props.theme.typography.button,
  backgroundColor: props.theme.colors['grey-01'],
  padding: `${props.theme.space * 2.5}px ${props.theme.space * 3}px`,
  borderRadius: props.theme.radius,
}));

const CopyButton = styled(Button)`
  display: inline-flex;
  width: 143px;
`;

const CopyText = styled(Text)`
  display: inline-flex;
  align-items: center;
`;

const MotionCopyText = motion(CopyText);

export default function EntityPage({ triples, id, name, space, entityNames, linkedEntities }: Props) {
  const { setPageName } = usePageName();
  const [step, setStep] = useState<'entity' | 'related'>('entity');
  const [copyText, setCopyText] = useState<'Copy Entity ID' | 'ID Copied!'>('Copy Entity ID');

  useEffect(() => {
    if (name !== id) setPageName(name);
    return () => setPageName('');
  }, [name, id, setPageName]);

  const onCopyEntityId = () => {
    navigator.clipboard.writeText(id);
    setCopyText('ID Copied!');
    setTimeout(() => setCopyText('Copy Entity ID'), 3600);
  };

  // e.g., 48234k...934893
  const truncatedEntityId = `${id.slice(0, 7)}${id.length > 7 ? '...' : ''}${id.slice(-6)}`;

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
          <div>
            <TabButton icon="facts" isActive={step === 'entity'} onClick={() => setStep('entity')}>
              Entity data
            </TabButton>

            <TabButton icon="entity" isActive={step === 'related'} onClick={() => setStep('related')}>
              Linked by
            </TabButton>
          </div>

          <div>
            <EntityId>{truncatedEntityId}</EntityId>
            <CopyButton
              onClick={onCopyEntityId}
              variant={copyText === 'ID Copied!' ? 'done' : 'secondary'}
              icon={copyText === 'ID Copied!' ? undefined : 'copy'}
            >
              <AnimatePresence mode="wait">
                {copyText === 'ID Copied!' ? (
                  <MotionCopyText
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    variant="button"
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
            </CopyButton>
          </div>
        </ToggleGroup>

        {step === 'entity' && triples.length > 0 && (
          <Attributes>
            <EntityAttributes triples={triples} space={space} entityNames={entityNames} />
          </Attributes>
        )}

        {step === 'related' && (
          <Entities>
            {Object.entries(linkedEntities).length === 0 ? (
              <Text variant="metadataMedium" color="grey-04">
                There are no other entities that are linking to this entity.
              </Text>
            ) : (
              <RelatedEntities linkedEntities={linkedEntities} space={space} entityNames={entityNames} />
            )}
          </Entities>
        )}
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
  const groupedTriples = groupBy(triples, t => t.attributeId);

  return (
    <>
      {Object.entries(groupedTriples).map(([attributeId, triples]) => (
        <div key={attributeId}>
          <Text as="p" variant="bodySemibold">
            {entityNames[attributeId] || attributeId}
          </Text>
          <Spacer height={4} />
          <div style={{ display: 'flex', gap: 8 }}>
            {triples.map(triple =>
              triple.value.type === 'entity' ? (
                <>
                  <Chip href={navUtils.toEntity(space, triple.value.id)}>
                    {entityNames[triple.value.id] || triple.value.id}
                  </Chip>
                </>
              ) : (
                <Text as="p">{triple.value.value}</Text>
              )
            )}
          </div>
        </div>
      ))}
    </>
  );
}

function RelatedEntities({
  linkedEntities,
  space,
  entityNames,
}: {
  linkedEntities: Props['linkedEntities'];
  space: Props['space'];
  entityNames: Props['entityNames'];
}) {
  return (
    <>
      {Object.values(linkedEntities).map(group => (
        <EntityCard key={group.id} entityGroup={group} space={space} entityNames={entityNames} />
      ))}
    </>
  );
}

const EntityCardContainer = styled.div(({ theme }) => ({
  borderRadius: theme.radius,
  border: `1px solid ${theme.colors['grey-02']}`,
  overflow: 'hidden',

  ':hover': {
    border: `1px solid ${theme.colors.text}`,

    // @ts-ignore -- This is valid with emotion/styled
    [EntityCardHeader]: {
      borderColor: theme.colors.text,
    },
  },
}));

const EntityCardHeader = styled.a<{ showBorder: boolean }>(({ theme, showBorder }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  verticalAlign: 'top',
  gap: theme.space * 5,

  padding: theme.space * 3,
  ...(showBorder && { borderBottom: `1px solid ${theme.colors['grey-02']}` }),

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

const EntityCardContent = styled.div(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.space * 4,
  padding: theme.space * 4,
}));

const EntityCardFooter = styled.div(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
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
  const [isExpanded, setIsExpanded] = useState(false);

  const shouldMaximizeContent = Boolean(isExpanded || entityGroup.description);

  return (
    <EntityCardContainer>
      <Link href={navUtils.toEntity(space, entityGroup.id)} passHref>
        <EntityCardHeader showBorder={shouldMaximizeContent}>
          <div>
            <img src="/facts-medium.svg" alt="Icon representing entities in the Geo database" />
            <Text as="h2" variant="cardEntityTitle">
              {entityGroup.name ?? entityGroup.id}
            </Text>
          </div>
          {/* Wrap in a div so the svg doesn't get scaled by dynamic flexbox */}
          <IconContainer>
            <RightArrowDiagonal color="grey-04" />
          </IconContainer>
        </EntityCardHeader>
      </Link>

      {shouldMaximizeContent && (
        <>
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
            {isExpanded && <EntityAttributes triples={entityGroup.triples} space={space} entityNames={entityNames} />}
          </EntityCardContent>
        </>
      )}

      <EntityCardFooter>
        <Text variant="breadcrumb">
          {entityGroup.triples.length} {pluralize('value', entityGroup.triples.length)}
        </Text>
        <SmallButton variant="secondary" onClick={() => setIsExpanded(!isExpanded)}>
          <span style={{ rotate: isExpanded ? '180deg' : '0deg' }}>
            <ChevronDownSmall color="grey-04" />
          </span>
          <Spacer width={6} />
          {isExpanded ? 'Hide all attributes' : 'Show all attributes'}
        </SmallButton>
      </EntityCardFooter>
    </EntityCardContainer>
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
  linkedEntities: Record<string, EntityGroup>;
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
      filter: [{ field: 'linked-by', value: entityId }],
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

  const linkedEntities: Record<string, EntityGroup> = relatedEntities
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
