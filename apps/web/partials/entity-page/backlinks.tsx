'use client';

import Image from 'next/image';

import { useState } from 'react';

import { useSpace } from '~/core/hooks/use-space';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { PrefetchLink } from '~/design-system/prefetch-link';
import { Tag } from '~/design-system/tag';

type BacklinksProps = {
  backlinks: Backlink[];
};

type Backlink = { id: string; name?: string | null; spaces: Array<string | null> };

export const Backlinks = ({ backlinks }: BacklinksProps) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  return (
    <div>
      <div className="text-mediumTitle">Referenced by</div>
      <div className="mt-4 flex flex-col gap-6">
        {isExpanded || backlinks.length <= 3 ? (
          <>
            {backlinks.map(backlink => (
              <Backlink key={backlink.id} backlink={backlink} />
            ))}
          </>
        ) : (
          <>
            {backlinks.slice(0, 3).map(backlink => (
              <Backlink key={backlink.id} backlink={backlink} />
            ))}
            <div>
              <SmallButton variant="secondary" onClick={() => setIsExpanded(true)}>
                Show more
              </SmallButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

type BacklinkProps = {
  backlink: Backlink;
};

const Backlink = ({ backlink }: BacklinkProps) => {
  const { space } = useSpace(backlink.spaces[0] ?? '');

  if (!space) return;

  return (
    <div>
      <PrefetchLink
        entityId={backlink.id}
        href={NavUtils.toEntity(space.id, backlink.id)}
        className="inline-flex flex-col"
      >
        <span className="text-metadataMedium">{backlink.name}</span>
        <span className="mt-1.5 inline-flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5">
            {space.entity.image && (
              <span className="relative h-3 w-3 overflow-hidden rounded-xs">
                <Image layout="fill" objectFit="cover" src={getImagePath(space.entity.image)} alt="" />
              </span>
            )}
            <span className="text-breadcrumb">{space.entity.name}</span>
          </span>
          <ChevronRight />
          <span className="inline-flex items-center gap-1.5">
            {space.entity.types.map(t => (
              <Tag key={t.id}>{t.name}</Tag>
            ))}
          </span>
        </span>
      </PrefetchLink>
    </div>
  );
};
