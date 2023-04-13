import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';

import { LinkableChip } from '~/modules/design-system/chip';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { Truncate } from '~/modules/design-system/truncate';
import { Entity } from '~/modules/entity';
import { Triple } from '~/modules/types';
import { groupBy, NavUtils } from '~/modules/utils';
import { ImageZoom } from './editable-fields';
import { sortEntityPageTriples } from './entity-page-utils';
import { EntityPageMetadataHeader } from '../entity-page/entity-page-metadata-header';
import { ReferencedByEntity } from './types';
import { ChevronDownSmall } from '~/modules/design-system/icons/chevron-down-small';
import { Tag } from '~/modules/design-system/tag';
import { RightArrowDiagonal } from '~/modules/design-system/icons/right-arrow-diagonal';
import { Editor } from '../editor/editor';
import { EntityPageContentContainer } from '~/modules/components/entity/entity-page-content-container';
import { EntityPageCover } from './entity-page-cover';

interface Props {
  triples: Triple[];
  schemaTriples: Triple[];
  id: string;
  name: string;
  spaceId: string;
  referencedByEntities: ReferencedByEntity[];
  serverAvatarUrl: string | null;
  serverCoverUrl: string | null;
}

export function ReadableEntityPage({
  triples,
  id,
  name,
  spaceId,
  referencedByEntities,
  schemaTriples,
  serverAvatarUrl,
  serverCoverUrl,
}: Props) {
  const sortedTriples = sortEntityPageTriples(triples, schemaTriples);
  const types = Entity.types(triples, spaceId).flatMap(t => (t ? [t] : []));
  const avatarUrl = Entity.avatar(triples) ?? serverAvatarUrl;
  const coverUrl = Entity.cover(triples) ?? serverCoverUrl;

  return (
    <>
      <EntityPageCover avatarUrl={avatarUrl} coverUrl={coverUrl} />
      <EntityPageContentContainer>
        <Truncate maxLines={3} shouldTruncate>
          <Text as="h1" variant="mainPage">
            {name}
          </Text>
        </Truncate>
        <Spacer height={12} />
        <EntityPageMetadataHeader id={id} spaceId={spaceId} types={types} />
        <Spacer height={40} />
        <Editor editable={false} />
        <div className="rounded border border-grey-02 shadow-button">
          <div className="flex flex-col gap-6 p-5">
            <EntityAttributes entityId={id} triples={sortedTriples} />
          </div>
        </div>
        <Spacer height={40} />
        <Text as="h2" variant="mediumTitle">
          Referenced by
        </Text>
        <div className="flex flex-col flex-wrap">
          {referencedByEntities.length === 0 ? (
            <>
              <Spacer height={12} />
              <Text color="grey-04">There are no entities referencing {name}.</Text>
            </>
          ) : (
            <>
              <Spacer height={20} />
              <div className="flex flex-col gap-6">
                {referencedByEntities.map(referencedByEntity => (
                  <ReferencedByEntityItem key={referencedByEntity.id} referencedByEntity={referencedByEntity} />
                ))}
              </div>
            </>
          )}
        </div>
      </EntityPageContentContainer>
    </>
  );
}

function EntityAttributes({ entityId, triples }: { entityId: string; triples: Props['triples'] }) {
  const groupedTriples = groupBy(triples, t => t.attributeId);

  const tripleToEditableField = (triple: Triple) => {
    switch (triple.value.type) {
      case 'string':
        return (
          <Text key={`string-${triple.attributeId}-${triple.value.id}-${triple.id}`} as="p">
            {triple.value.value}
          </Text>
        );
      case 'image':
        return (
          <ImageZoom
            key={`image-${triple.attributeId}-${triple.value.id}-${triple.id}`}
            imageSrc={triple.value.value}
          />
        );
      case 'entity': {
        return (
          <div key={`entity-${triple.attributeId}-${triple.value.id}-${triple.id}`} className="mt-1">
            <LinkableChip href={NavUtils.toEntity(triple.space, triple.value.id)}>
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
          <div className="flex flex-wrap gap-2">{triples.map(tripleToEditableField)}</div>
        </div>
      ))}
    </>
  );
}

function ReferencedByEntityItem({ referencedByEntity }: { referencedByEntity: ReferencedByEntity }) {
  const [isHovered, hover] = React.useState(false);

  return (
    <Link href={NavUtils.toEntity(referencedByEntity.space.id, referencedByEntity.id)} passHref>
      <a onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)} className="relative">
        <div className="flex items-center justify-between">
          <Text as="h3" variant="metadataMedium">
            {referencedByEntity.name}
          </Text>
          {isHovered && (
            <div className="absolute right-0 animate-fade-in transition-opacity duration-100">
              <RightArrowDiagonal color="grey-04" />
            </div>
          )}
        </div>
        <Spacer height={8} />
        <div className="flex items-center">
          <div className="flex items-center gap-1">
            <span className="relative h-3 w-3 overflow-hidden rounded-xs">
              <Image layout="fill" objectFit="cover" src={referencedByEntity.space.image ?? ''} />
            </span>
            <Text as="p" variant="footnoteMedium">
              {referencedByEntity.space.name}
            </Text>
          </div>
          <Spacer width={8} />
          <span className="-rotate-90">
            <ChevronDownSmall />
          </span>
          <Spacer width={8} />
          <div className="flex items-center gap-1">
            {referencedByEntity.types.map(type => (
              <Tag key={type.id}>{type.name}</Tag>
            ))}
          </div>
        </div>
      </a>
    </Link>
  );
}
