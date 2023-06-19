import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { SYSTEM_IDS } from '@geogenesis/ids';

import { LinkableChip } from '~/modules/design-system/chip';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { Triple } from '~/modules/types';
import { groupBy, NavUtils } from '~/modules/utils';
import { ImageZoom } from '../editable-fields/editable-fields';
import { sortEntityPageTriples } from './entity-page-utils';
import { ReferencedByEntity } from './types';
import { ChevronDownSmall } from '~/modules/design-system/icons/chevron-down-small';
import { Tag } from '~/modules/design-system/tag';
import { RightArrowDiagonal } from '~/modules/design-system/icons/right-arrow-diagonal';
import { useEntityStore } from '~/modules/entity';
import { DateField } from '../editable-fields/date-field';
import { SmallButton } from '~/modules/design-system/button';

interface Props {
  triples: Triple[];
  id: string;
  name: string;
  referencedByEntities: ReferencedByEntity[];
}

export function ReadableEntityPage({ triples, id, name, referencedByEntities }: Props) {
  const { schemaTriples } = useEntityStore();

  const sortedTriples = sortEntityPageTriples(triples, schemaTriples);

  return (
    <>
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
          <ReferencedByEntities referencedByEntities={referencedByEntities} />
        )}
      </div>
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
      case 'date':
        return <DateField isEditing={false} value={new Date().toISOString()} />;
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
      {Object.entries(groupedTriples).map(([attributeId, triples], index) => {
        if (attributeId === SYSTEM_IDS.BLOCKS) return null;

        return (
          <div key={`${entityId}-${attributeId}-${index}`} className="break-words">
            <Text as="p" variant="bodySemibold">
              {triples[0].attributeName || attributeId}
            </Text>
            <div className="flex flex-wrap gap-2">{triples.map(tripleToEditableField)}</div>
          </div>
        );
      })}
    </>
  );
}

type ReferencedByEntitiesProps = {
  referencedByEntities: Array<ReferencedByEntity>;
};

function ReferencedByEntities({ referencedByEntities }: ReferencedByEntitiesProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const count = referencedByEntities.length;

  if (count <= 3)
    return (
      <>
        <Spacer height={20} />
        <div className="flex flex-col gap-6">
          {referencedByEntities.map(referencedByEntity => (
            <ReferencedByEntityItem key={referencedByEntity.id} referencedByEntity={referencedByEntity} />
          ))}
        </div>
      </>
    );

  const firstReferencedByEntities = referencedByEntities.slice(0, 3);
  const lastReferencedByEntities = referencedByEntities.slice(3);

  return (
    <>
      <Spacer height={20} />
      <div className="flex flex-col gap-6">
        {firstReferencedByEntities.map(referencedByEntity => (
          <ReferencedByEntityItem key={referencedByEntity.id} referencedByEntity={referencedByEntity} />
        ))}
        {!isExpanded ? (
          <div>
            <SmallButton variant="secondary" onClick={() => setIsExpanded(true)}>
              Show more
            </SmallButton>
          </div>
        ) : (
          <>
            {lastReferencedByEntities.map(referencedByEntity => (
              <ReferencedByEntityItem key={referencedByEntity.id} referencedByEntity={referencedByEntity} />
            ))}
          </>
        )}
      </div>
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
            {referencedByEntity.space.image && (
              <span className="relative h-3 w-3 overflow-hidden rounded-xs">
                <Image layout="fill" objectFit="cover" src={referencedByEntity.space.image} />
              </span>
            )}
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
