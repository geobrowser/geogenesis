'use client';

import cx from 'classnames';

import { type Tier, UNGRADED_SECTION_LABEL } from '~/core/blocks/ranking/ranking-grades';

/**
 * A tier's header in "Your ranking" (GEO-3729 mockup): the tier and how many debates are in it,
 * then a hairline. Dragging a debate past it moves the debate into the next tier.
 */
export function BestDebatesTierHeader({ tier, count }: { tier: Tier; count: number }) {
  return (
    <div
      className={cx(
        'flex items-center gap-3 pt-3 pb-1 text-metadataMedium font-semibold',
        tier === 'ungraded' ? 'text-grey-04' : 'text-text'
      )}
      data-testid={`best-debates-tier-${tier}`}
    >
      <span className="shrink-0">
        {tier === 'ungraded' ? UNGRADED_SECTION_LABEL : tier}{' '}
        <span className="font-normal text-grey-04">· {count}</span>
      </span>
      <span className="h-px flex-1 bg-grey-02" aria-hidden />
    </div>
  );
}
