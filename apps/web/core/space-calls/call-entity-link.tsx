'use client';

import Link from 'next/link';

import { useFeatureFlag } from '~/core/state/feature-flags';
import { NavUtils } from '~/core/utils/utils';

export const CALL_ENTITY_LINK_COPY = { label: 'View on Geo' } as const;

/** The call's Call Event entity page (GEO-3593), once geo-chat has recorded one. Behind `spaceCalls`. */
export function CallEntityLink({
  spaceId,
  entityId,
  className,
}: {
  spaceId: string;
  entityId: string | null | undefined;
  className?: string;
}) {
  const enabled = useFeatureFlag('spaceCalls');
  if (!enabled || !entityId) return null;
  return (
    <Link
      href={NavUtils.toEntity(spaceId, entityId)}
      className={className ?? 'text-ctaPrimary hover:underline'}
      data-testid="call-entity-link"
      data-geo-analytics-label="Call entity link"
    >
      {CALL_ENTITY_LINK_COPY.label}
    </Link>
  );
}
