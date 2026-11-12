'use client';

import * as React from 'react';

import cx from 'classnames';

import { type SpaceGroup, groupBySpace } from '~/core/blocks/ranking/best-debates-team-filters';
import { type RankersRead, rankedByLabel, rankedByText } from '~/core/blocks/ranking/use-best-debates-to-rank';
import { normId } from '~/core/utils/norm-id';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { RankingChart } from '~/design-system/icons/ranking-chart';

import { SpaceThumb } from '~/partials/explore/space-thumb';

import { RankingEntryRow } from '../ranking-entry-row';
import { BestDebateDisplaysContext } from './best-debate-row';

/** Who has ranked a debate: the purple "Nobody has ranked this yet", or "Ranked by …". */
export function RankedByBadge({ rankers, entityId }: { rankers: RankersRead; entityId: string }) {
  const label = rankedByLabel(rankers, entityId);
  if (label.kind === 'unknown') return null;
  if (label.kind === 'nobody') {
    return (
      <span className="inline-flex h-5 items-center rounded-[4px] bg-purple-tint px-1.5 text-tag whitespace-nowrap text-purple">
        Nobody has ranked this yet
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 items-center rounded-[4px] bg-grey-01 px-1.5 text-tag whitespace-nowrap text-grey-04">
      {rankedByText(label)}
    </span>
  );
}

/** The drag handle the mockups draw on a row that can go into "Your ranking". */
const GRIP = (
  <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden className="shrink-0 text-grey-03">
    <g fill="currentColor">
      <circle cx="3" cy="3" r="1.2" />
      <circle cx="7" cy="3" r="1.2" />
      <circle cx="3" cy="8" r="1.2" />
      <circle cx="7" cy="8" r="1.2" />
      <circle cx="3" cy="13" r="1.2" />
      <circle cx="7" cy="13" r="1.2" />
    </g>
  </svg>
);

/** The red down arrow Push it down has always had. */
function PushDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-red-01">
      <path d="M8 2.5v9M4.5 8L8 11.5 11.5 8M3 13.5h10" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/**
 * One row of the team column, the same in All and To rank (mockups 07 and 08): the grip where it
 * can be dragged, the team place in All, the poster, claim and meta, who has ranked it, and on the
 * right either "You: #N" or the rank mark; Push down follows the badge. The row itself is the button that places it.
 */
export function BestDebatesTeamRowContent({
  entityId,
  name,
  spaceId,
  rank,
  rankers,
  myRank,
  draggable,
  onPushDown,
}: {
  entityId: string;
  name: string;
  spaceId: string;
  rank?: number;
  rankers: RankersRead;
  /** The debate's place in your ranking, when it's there. */
  myRank: number | null;
  draggable: boolean;
  /** Push it down from the row (Preston, 12 Nov), inline after the ranked-by badge. */
  onPushDown?: () => void;
}) {
  return (
    <div className="flex w-full min-w-0 items-center gap-3" data-testid="best-debates-team-row">
      {draggable && !myRank ? GRIP : draggable ? <span className="w-2.5 shrink-0" aria-hidden /> : null}
      <div className="min-w-0 flex-1">
        <RankingEntryRow
          rank={rank}
          rankStyle="leading"
          linkToEntity={false}
          entry={{ entityId, name, description: null, image: null }}
          spaceId={spaceId}
          actions={
            // Push it down sits inline after the ranked-by badge (Preston, 12 Nov), at the start of the
            // line when there is no badge, so it is always in the same place.
            <div className="flex items-center gap-2">
              <RankedByBadge rankers={rankers} entityId={entityId} />
              {onPushDown && !myRank ? (
                <button
                  type="button"
                  aria-label={`Down rank ${name}`}
                  title="Down rank"
                  onClick={event => {
                    event.stopPropagation();
                    onPushDown();
                  }}
                  onKeyDown={event => event.stopPropagation()}
                  className={cx(
                    'relative inline-flex h-5 shrink-0 items-center gap-1 rounded-[4px] px-1.5 text-tag whitespace-nowrap text-grey-04 transition-colors hover:bg-grey-01 hover:text-text focus-visible:ring-2 focus-visible:ring-text focus-visible:outline-none',
                    // A 44px hit area on a phone without a taller row.
                    'md:after:absolute md:after:-inset-x-1 md:after:-inset-y-3'
                  )}
                >
                  <PushDownIcon />
                  Down rank
                </button>
              ) : null}
            </div>
          }
          debateAside={
            myRank ? (
              <span className="text-breadcrumb whitespace-nowrap text-grey-04 tabular-nums">You: #{myRank}</span>
            ) : (
              <span
                className="grid size-8 place-items-center rounded-md border border-grey-02 bg-white text-text md:size-11"
                aria-hidden
              >
                <RankingChart />
              </span>
            )
          }
        />
      </div>
    </div>
  );
}

const COLLAPSED_SPACES_KEY = 'geo.bestDebates.collapsedSpaces';

function readCollapsedSpaces(): Set<string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_SPACES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

// One store for the page, so the ranked and unranked sections of By space (and To rank) fold a
// space together.
let collapsedSpaces: Set<string> | null = null;
const collapsedListeners = new Set<() => void>();
const getCollapsedSpaces = () => (collapsedSpaces ??= readCollapsedSpaces());
const EMPTY_SET: Set<string> = new Set();
function setCollapsedSpaces(next: Set<string>) {
  collapsedSpaces = next;
  try {
    window.localStorage.setItem(COLLAPSED_SPACES_KEY, JSON.stringify([...next]));
  } catch {
    // Private windows and blocked storage: it still works for this visit.
  }
  collapsedListeners.forEach(listener => listener());
}

/** For tests: forget the in-memory copy so the next read comes from storage. */
export function resetCollapsedSpacesForTests() {
  collapsedSpaces = null;
}

/**
 * Which By space groups the viewer collapsed (Preston, 12 Nov): all open to start, remembered per
 * viewer by space id. A search or topic filter never opens one; its count still shows.
 */
export function useCollapsedSpaces() {
  const collapsed = React.useSyncExternalStore(
    listener => {
      collapsedListeners.add(listener);
      return () => collapsedListeners.delete(listener);
    },
    getCollapsedSpaces,
    () => EMPTY_SET
  );
  const toggle = React.useCallback((key: string) => {
    const next = new Set(getCollapsedSpaces());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsedSpaces(next);
  }, []);
  const setAll = React.useCallback((keys: readonly string[], close: boolean) => {
    const next = new Set(getCollapsedSpaces());
    for (const key of keys) {
      if (close) next.add(key);
      else next.delete(key);
    }
    setCollapsedSpaces(next);
  }, []);
  return { collapsed, toggle, setAll };
}

const groupKey = (group: SpaceGroup) => (group.space ? normId(group.space.id) : 'other');

/** A space's section header in the team column when it is grouped by space: the toggle for it. */
export function SpaceGroupHeader({
  group,
  expanded,
  onToggle,
  trailing,
}: {
  group: SpaceGroup;
  expanded: boolean;
  onToggle: () => void;
  /** At the row's right end: the first header carries Collapse all / Expand all. */
  trailing?: React.ReactNode;
}) {
  const name = group.space?.name ?? 'Other';
  return (
    <div className="flex items-center gap-2 pt-4 pb-1 md:pt-2">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-2 text-left text-footnoteMedium text-grey-04 transition-colors hover:text-text md:min-h-11"
      >
        <span className={cx('grid size-3 shrink-0 place-items-center transition-transform', !expanded && '-rotate-90')}>
          <ChevronDownSmall />
        </span>
        {group.space ? <SpaceThumb image={group.space.image} name={name} /> : null}
        <span className="whitespace-nowrap">
          {name} · {group.ids.length}
        </span>
        <span className="h-px flex-1 bg-grey-02" aria-hidden />
      </button>
      {trailing}
    </div>
  );
}

/**
 * Draws `ids` with `render`, grouped by space when asked: a header per space, rows in their order
 * inside it, and no header for a space with nothing left in it. Each group collapses to its header.
 */
export function BestDebatesGroupedRows({
  ids,
  grouped,
  render,
  collapseAllIds = ids,
}: {
  ids: readonly string[];
  grouped: boolean;
  render: (entityId: string) => React.ReactNode;
  /**
   * The debates Collapse all / Expand all covers, on this list's first header; `null` leaves it off
   * (a later section of the same column, whose first section carries it for both).
   */
  collapseAllIds?: readonly string[] | null;
}) {
  const displays = React.useContext(BestDebateDisplaysContext);
  const { collapsed, toggle, setAll } = useCollapsedSpaces();
  if (!grouped || !displays) return <>{ids.map(render)}</>;
  const groups = groupBySpace(ids, id => displays.get(normId(id)));
  const keys = collapseAllIds ? groupBySpace(collapseAllIds, id => displays.get(normId(id))).map(groupKey) : [];
  const allCollapsed = keys.length > 0 && keys.every(key => collapsed.has(key));
  return (
    <>
      {groups.map((group, index) => {
        const key = groupKey(group);
        const expanded = !collapsed.has(key);
        return (
          <section key={key} aria-label={group.space?.name ?? 'Other'} data-testid="space-group">
            <SpaceGroupHeader
              group={group}
              expanded={expanded}
              onToggle={() => toggle(key)}
              trailing={
                // On the first header's row, so it never takes a band of its own (Preston, 12 Nov).
                index === 0 && keys.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setAll(keys, !allCollapsed)}
                    className="h-6 shrink-0 rounded px-1 text-smallButton text-grey-04 transition-colors hover:text-text md:h-11"
                  >
                    {allCollapsed ? 'Expand all' : 'Collapse all'}
                  </button>
                ) : null
              }
            />
            {expanded ? group.ids.map(render) : null}
          </section>
        );
      })}
    </>
  );
}
