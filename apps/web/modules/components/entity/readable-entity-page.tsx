import cx from 'classnames';
import { LayoutGroup } from 'framer-motion';
import Head from 'next/head';
import Link from 'next/link';
import pluralize from 'pluralize';
import { useState } from 'react';

import { SmallButton } from '~/modules/design-system/button';
import { LinkableChip } from '~/modules/design-system/chip';
import { ChevronDownSmall } from '~/modules/design-system/icons/chevron-down-small';
import { RightArrowDiagonal } from '~/modules/design-system/icons/right-arrow-diagonal';
import { ResizableContainer } from '~/modules/design-system/resizable-container';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { Truncate } from '~/modules/design-system/truncate';
import { Entity } from '~/modules/entity';
import { Triple, Version } from '~/modules/types';
import { groupBy, NavUtils, partition } from '~/modules/utils';
import { ImageZoom } from './editable-fields';
import { sortEntityPageTriples } from './entity-page-utils';
import { LinkedEntityGroup } from './types';
import { EntityPageMetadataHeader } from '../entity-page/entity-page-metadata-header';
import { EntityTypeChipGroup } from './entity-type-chip-group';

interface Props {
  triples: Triple[];
  schemaTriples: Triple[];
  versions: Version[];
  id: string;
  name: string;
  space: string;
  linkedEntities: Record<string, LinkedEntityGroup>;
}

export function ReadableEntityPage({ triples, id, name, space, linkedEntities, schemaTriples, versions }: Props) {
  const description = Entity.description(triples);
  const sortedTriples = sortEntityPageTriples(triples, schemaTriples);
  const types = Entity.types(triples, space).flatMap(t => (t.name ? [t.name] : []));

  return (
    <>
      <EntityPageMetadataHeader versions={versions} />
      <Spacer height={16} />
      <Truncate maxLines={3} shouldTruncate>
        <Text as="h1" variant="mainPage">
          {name}
        </Text>
      </Truncate>
      <Spacer height={40} />
      <EntityTypeChipGroup types={types} />
      <Spacer height={40} />

      {description && (
        <>
          <Text as="p" color="grey-04">
            {description}
          </Text>
          <Spacer height={60} />
        </>
      )}

      <div className="rounded border border-grey-02 bg-white">
        <div className="flex flex-col gap-6 p-5">
          <EntityAttributes entityId={id} triples={sortedTriples} space={space} />
        </div>
      </div>
      <Spacer height={40} />
      <Text as="h2" variant="mediumTitle">
        Referenced by
      </Text>
      <div className="felx-wrap flex flex-col gap-3">
        {Object.entries(linkedEntities).length === 0 ? (
          <Text color="grey-04">There are no other entities that are referencing {name}.</Text>
        ) : (
          <LayoutGroup>
            <Spacer height={12} />
            {Object.values(linkedEntities).map(group => (
              <LinkedEntityCard key={group.id} originalEntityId={id} entityGroup={group} space={space} />
            ))}
          </LayoutGroup>
        )}
      </div>
    </>
  );
}

function EntityAttribute({ triple, space }: { triple: Triple; space: string }) {
  return (
    <div key={triple.attributeId}>
      <Text as="p" variant="bodySemibold">
        {triple.attributeName || triple.attributeId}
      </Text>
      {triple.value.type === 'entity' ? (
        <>
          <Spacer height={4} />
          <LinkableChip href={NavUtils.toEntity(space, triple.value.id)}>
            {triple.value.name || triple.value.id}
          </LinkableChip>
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

  const tripleToEditableField = (triple: Triple) => {
    switch (triple.value.type) {
      case 'string':
        return (
          <Text key={`string-${triple.value.id}`} as="p">
            {triple.value.value}
          </Text>
        );
      case 'image':
        return <ImageZoom key={`image-${triple.value.id}`} imageSrc={triple.value.value} />;
      case 'entity': {
        return (
          <div key={`entity-${triple.value.id}`} style={{ marginTop: 4 }}>
            <LinkableChip href={NavUtils.toEntity(space, triple.value.id)}>
              {triple.value.name || triple.value.id}
            </LinkableChip>
          </div>
        );
      }
      case 'number':
        return null;
    }
  };

  return (
    <>
      {Object.entries(groupedTriples).map(([attributeId, triples], index) => (
        <div key={`${entityId}-${attributeId}-${index}`} className="break-words">
          <Text as="p" variant="bodySemibold">
            {triples[0].attributeName || attributeId}
          </Text>
          <div className="flex flex-wrap gap-2">
            {/*
              Have to do some janky layout stuff instead of being able to just use gap since we want different
              height between the attribute name and the attribute value for entities vs strings
            */}
            {triples.map(tripleToEditableField)}
          </div>
        </div>
      ))}
    </>
  );
}

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
      <div className="duraiton-150 overflow-hidden rounded border border-grey-02 transition-colors ease-in-out hover:border-text hover:[&>a]:border-text">
        <Link href={NavUtils.toEntity(space, entityGroup.id)} passHref>
          <a className="flex justify-between gap-5 p-4 align-top [&>div]:flex [&>div]:items-start [&>div]:gap-4 [&>img]:rounded">
            <Text as="h2" variant="cardEntityTitle">
              {entityGroup.name ?? entityGroup.id}
            </Text>
            {/* Wrap in a div so the svg doesn't get scaled by dynamic flexbox */}
            <div className="mt-[6px]">
              <RightArrowDiagonal color="grey-04" />
            </div>
          </a>
        </Link>
        {description && (
          <div className="bg-bg p-4 pt-0">
            <Text as="p" color="grey-04">
              {description}
            </Text>
          </div>
        )}
        <div className="flex flex-col gap-4 bg-white p-4">
          {shouldMaximizeContent && (
            <>
              {linkedTriples.map((triple, i) => (
                <EntityAttribute key={`${triple.attributeId}-${triple.id}-${i}`} triple={triple} space={space} />
              ))}
              {isExpanded && <EntityAttributes entityId={entityGroup.id} triples={unlinkedTriples} space={space} />}
            </>
          )}
        </div>
        <div className="flex items-center justify-between bg-white py-2 px-4">
          <Text variant="breadcrumb">
            {entityGroup.triples.length} {pluralize('value', entityGroup.triples.length)}
          </Text>
          <SmallButton variant="secondary" onClick={() => setIsExpanded(!isExpanded)}>
            <span className={cx(isExpanded && 'rotate-180')}>
              <ChevronDownSmall color="grey-04" />
            </span>
            {isExpanded
              ? `Hide ${unlinkedTriples.length} more ${pluralize('value', unlinkedTriples.length)}`
              : `Show ${unlinkedTriples.length} more ${pluralize('value', unlinkedTriples.length)}`}
          </SmallButton>
        </div>
      </div>
    </ResizableContainer>
  );
}
