'use client';

import Image from 'next/legacy/image';
import Link from 'next/link';

import * as React from 'react';

import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { OmitStrict } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { RightArrowDiagonal } from '~/design-system/icons/right-arrow-diagonal';
import { Spacer } from '~/design-system/spacer';
import { Tag } from '~/design-system/tag';
import { Text } from '~/design-system/text';

import { ReferencedByEntity } from './types';

type ReferencedByEntitiesProps = {
  referencedByEntities: Array<ReferencedByEntity>;
  name: string | null;
};

export function EntityPageReferencedBy({ referencedByEntities, name: serverName }: ReferencedByEntitiesProps) {
  const { triples } = useEntityPageStore();
  const name = triples.length === 0 ? serverName : Entity.name(triples) ?? '';

  return (
    <div>
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
    </div>
  );
}

function ReferencedByEntities({ referencedByEntities }: OmitStrict<ReferencedByEntitiesProps, 'name'>) {
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
    <Link
      href={NavUtils.toEntity(referencedByEntity.space.id, referencedByEntity.id)}
      onMouseEnter={() => hover(true)}
      onMouseLeave={() => hover(false)}
      className="relative"
    >
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
              <Image layout="fill" objectFit="cover" src={getImagePath(referencedByEntity.space.image)} alt="" />
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
    </Link>
  );
}
