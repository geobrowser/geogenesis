'use client';

import type { RecentlyClaimedSpace } from '~/core/io/subgraph/fetch-recently-claimed-spaces';
import { normId } from '~/core/utils/norm-id';
import { NavUtils } from '~/core/utils/utils';

import { FallbackImage } from '~/design-system/fallback-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { ExploreJoinSpaceButton } from './explore-join-space-button';

type Props = {
  spaces: RecentlyClaimedSpace[];
  pendingMembershipSpaceIds: Set<string>;
  memberOrEditorSpaceIds: Set<string>;
};

function formatMembers(count: number): string {
  if (count === 1) return '1 member';
  return `${count} members`;
}

const MAX_VISIBLE = 5;

export function RecentlyClaimedSection({ spaces, pendingMembershipSpaceIds, memberOrEditorSpaceIds }: Props) {
  if (spaces.length === 0) return null;

  const visibleSpaces = spaces.slice(0, MAX_VISIBLE);

  return (
    <section className="flex flex-col">
      <h2 className="sticky top-0 z-20 bg-white pt-1 pb-4 text-[19px] leading-[23px] font-semibold tracking-[-0.02em] text-text">
        Recently claimed
      </h2>

      <ul className="flex flex-col gap-3">
        {visibleSpaces.map(space => {
          const normalized = normId(space.spaceId);
          const isMemberOrEditor = memberOrEditorSpaceIds.has(normalized);

          return (
            <li key={space.spaceId} className="flex items-center justify-between gap-3">
              <Link href={NavUtils.toSpace(space.spaceId)} className="flex min-w-0 flex-1 items-center gap-2">
                <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-grey-01">
                  <FallbackImage value={space.image} sizes="80px" className="object-cover" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[16px] leading-[20px] font-medium text-text">{space.name}</span>
                  <span className="text-[16px] leading-[20px] font-normal text-grey-04">
                    {formatMembers(space.memberCount)}
                  </span>
                </span>
              </Link>

              {!isMemberOrEditor ? (
                <ExploreJoinSpaceButton
                  spaceId={space.spaceId}
                  hasRequestedSpaceMembership={pendingMembershipSpaceIds.has(normalized)}
                  variant="button"
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
