'use client';

import * as React from 'react';

import { MATCHING_DEBATES_CAP } from '~/core/blocks/ranking/best-debates-debates';
import { orderMatchingDebates } from '~/core/blocks/ranking/best-debates-team-filters';
import { useBestDebateDisplays } from '~/core/blocks/ranking/use-best-debate-displays';
import { normId } from '~/core/utils/norm-id';

import { BestDebateDisplaysContext } from './best-debate-row';
import { BestDebatesGroupedRows } from './best-debates-team-row';
import { useBestDebatesMatchingList } from './use-best-debates-matching-list';

/**
 * All or By space while a search or topic is active: every matching debate, read in full, so the
 * list agrees with the Topic menu's count and By space's headers count whole groups. Team places
 * first, then the rest newest first, as the paged list orders them.
 */
export function BestDebatesMatchingList({
  query,
  topicIds,
  grouped,
  rankOf,
  render,
}: {
  query: string;
  topicIds: readonly string[];
  grouped: boolean;
  rankOf: (entityId: string) => number | undefined;
  render: (entityId: string, rank: number | undefined, name: string | null) => React.ReactNode;
}) {
  const list = useBestDebatesMatchingList({ active: true, query, topicIds });
  const outer = React.useContext(BestDebateDisplaysContext);
  const ids = React.useMemo(() => (list.debates ?? []).map(debate => debate.entityId), [list.debates]);
  const own = useBestDebateDisplays(ids);
  const displays = React.useMemo(() => {
    if (!outer) return own;
    const merged = new Map(outer);
    for (const [id, data] of own) merged.set(id, data);
    return merged;
  }, [outer, own]);

  if (list.error) return <p className="py-3 text-metadata text-grey-04">Couldn’t load these debates.</p>;
  if (!list.debates || list.loading) return <p className="py-3 text-metadata text-grey-04">Loading debates…</p>;
  if (list.debates.length === 0) return <p className="py-3 text-metadata text-grey-04">No debates match.</p>;

  const names = new Map(list.debates.map(debate => [normId(debate.entityId), debate.name]));
  const { ranked, unranked } = orderMatchingDebates(list.debates, rankOf);
  const row = (id: string) => render(id, rankOf(id), names.get(normId(id)) ?? null);

  return (
    <BestDebateDisplaysContext.Provider value={displays}>
      <div className="flex flex-col" data-testid="best-debates-matching-list">
        <p className="m-0 pb-1 text-metadata text-grey-04" data-testid="best-debates-matching-count">
          {list.capped
            ? `Showing the first ${MATCHING_DEBATES_CAP} matching debates`
            : `${list.debates.length} ${list.debates.length === 1 ? 'debate' : 'debates'}`}
        </p>
        <BestDebatesGroupedRows ids={grouped ? [...ranked, ...unranked] : ranked} grouped={grouped} render={row} />
        {!grouped && unranked.length > 0 ? (
          <>
            {ranked.length > 0 ? (
              <div className="flex items-center gap-3 pt-4 pb-1">
                <span className="text-breadcrumb font-medium whitespace-nowrap text-grey-04">Unranked</span>
                <span className="h-px flex-1 bg-grey-02" aria-hidden />
              </div>
            ) : null}
            {unranked.map(row)}
          </>
        ) : null}
      </div>
    </BestDebateDisplaysContext.Provider>
  );
}
