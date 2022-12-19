import styled from '@emotion/styled';
import { LayoutGroup } from 'framer-motion';
import Head from 'next/head';
import Link from 'next/link';
import pluralize from 'pluralize';
import { useState } from 'react';
import { SmallButton } from '~/modules/design-system/button';
import { Chip } from '~/modules/design-system/chip';
import { ChevronDownSmall } from '~/modules/design-system/icons/chevron-down-small';
import { RightArrowDiagonal } from '~/modules/design-system/icons/right-arrow-diagonal';
import { ResizableContainer } from '~/modules/design-system/resizable-container';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { Truncate } from '~/modules/design-system/truncate';
import { Entity } from '~/modules/models/Entity';
import { Triple } from '~/modules/types';
import { groupBy, NavUtils, partition } from '~/modules/utils';
import { CopyIdButton } from './copy-id';
import { LinkedEntityGroup } from './types';

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
  flexWrap: 'wrap',
  gap: theme.space * 3,
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
  linkedEntities: Record<string, LinkedEntityGroup>;
}

export function ReadableEntityPage({ triples, id, name, space, linkedEntities }: Props) {
  const description = Entity.description(triples);

  return (
    <div>
      <Head>
        <title>{name ?? id}</title>
        <meta property="og:url" content={`https://geobrowser.io/spaces/${id}`} />
      </Head>

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
        <CopyIdButton id={id} />
      </EntityActionGroup>

      <Spacer height={8} />

      <Content>
        <Attributes>
          <EntityAttributes entityId={id} triples={triples} space={space} />
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
          <LayoutGroup>
            <Spacer height={12} />
            {Object.values(linkedEntities).map(group => (
              <LinkedEntityCard key={group.id} originalEntityId={id} entityGroup={group} space={space} />
            ))}
          </LayoutGroup>
        )}
      </Entities>
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

function EntityAttribute({ triple, space }: { triple: Triple; space: string }) {
  return (
    <div key={triple.attributeId}>
      <Text as="p" variant="bodySemibold">
        {triple.attributeName || triple.attributeId}
      </Text>
      {triple.value.type === 'entity' ? (
        <>
          <Spacer height={4} />
          <Chip href={NavUtils.toEntity(space, triple.value.id)}>{triple.value.name || triple.value.id}</Chip>
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
}: {
  entityId: string;
  triples: Props['triples'];
  space: Props['space'];
}) {
  const groupedTriples = groupBy(triples, t => t.attributeId);

  return (
    <>
      {Object.entries(groupedTriples).map(([attributeId, triples], index) => (
        <EntityAttributeContainer key={`${entityId}--${attributeId}-${index}`}>
          <Text as="p" variant="bodySemibold">
            {triples[0].attributeName || attributeId}
          </Text>
          <GroupedAttributes>
            {/* 
              Have to do some janky layout stuff instead of being able to just use gap since we want different
              height between the attribute name and the attribute value for entities vs strings
            */}
            {triples.map(triple =>
              triple.value.type === 'entity' ? (
                <div key={`entity-${triple.id}`} style={{ marginTop: 4 }}>
                  <Chip href={NavUtils.toEntity(space, triple.value.id)}>{triple.value.name || triple.value.id}</Chip>
                </div>
              ) : (
                <>
                  <Text as="p">{triple.value.value}</Text>
                </>
              )
            )}
          </GroupedAttributes>
        </EntityAttributeContainer>
      ))}
    </>
  );
}

const LinkedEntityCardContainer = styled.div(({ theme }) => ({
  borderRadius: theme.radius,
  border: `1px solid ${theme.colors['grey-02']}`,
  overflow: 'hidden',
  transition: 'border-color 0.15s ease-in-out',

  ':hover': {
    border: `1px solid ${theme.colors.text}`,

    a: {
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

const IconContainer = styled.div({
  // HACK: Fix visual alignment when aligning the content to the top. The icon does not
  // line up visually because of the text line height.
  marginTop: 6,
});

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
}: {
  originalEntityId: string;
  entityGroup: LinkedEntityGroup;
  space: Props['space'];
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const [linkedTriples, unlinkedTriples] = partition(
    entityGroup.triples,
    t => t.value.type === 'entity' && t.value.id === originalEntityId
  );

  const description = Entity.description(entityGroup.triples);

  const shouldMaximizeContent = Boolean(isExpanded || description || linkedTriples.length > 0);

  return (
    <ResizableContainer>
      <LinkedEntityCardContainer>
        <Link href={NavUtils.toEntity(space, entityGroup.id)} passHref>
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
                <EntityAttribute key={`${triple.attributeId}-${triple.id}-${i}`} triple={triple} space={space} />
              ))}
              {isExpanded && <EntityAttributes entityId={entityGroup.id} triples={unlinkedTriples} space={space} />}
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
              ? `Hide ${unlinkedTriples.length} more ${pluralize('value', unlinkedTriples.length)}`
              : `Show ${unlinkedTriples.length} more ${pluralize('value', unlinkedTriples.length)}`}
          </SmallButton>
        </LinkedEntityCardFooter>
      </LinkedEntityCardContainer>
    </ResizableContainer>
  );
}
