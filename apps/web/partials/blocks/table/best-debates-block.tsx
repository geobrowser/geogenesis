'use client';

import * as React from 'react';

import cx from 'classnames';

import { capture } from '~/core/analytics';
import {
  BEST_DEBATES_TEAM_VIEW_PARAM,
  BEST_DEBATES_TEAM_VIEW_TO_RANK,
  BEST_DEBATES_VIEWS,
  BEST_DEBATES_WINDOW_DAYS,
  type BestDebatesPeriod,
  type BestDebatesView,
  type PeriodDebate,
  buildBestDebatesViewRows,
  buildDayCoverage,
  coverageSentence,
  dayLabel,
  rankerCountLabel,
  recentDayKeys,
  weekCoverageSentence,
} from '~/core/blocks/ranking/best-debates-views';
import type { RankingComposeMode } from '~/core/blocks/ranking/ranking-compose-url';
import { useBestDebateDisplays } from '~/core/blocks/ranking/use-best-debate-displays';
import {
  type BestDebatesRankers,
  useBestDebatesRankers,
  useBestDebatesWindow,
  useNyTodayKey,
} from '~/core/blocks/ranking/use-best-debates';
import { useMyPushedDownDebates } from '~/core/blocks/ranking/use-my-pushed-down-debates';
import { type RankingEntryDisplay, useRankingEntryEntities } from '~/core/blocks/ranking/use-ranking-entry-entities';
import { SegmentedControl } from '~/core/debates/matchmaking/debate-calendar-controls';
import { normId } from '~/core/utils/norm-id';

import { Button } from '~/design-system/button';

import { BestDebateRow, RankerAvatars } from './best-debates/best-debate-row';
import { BestDebateWatchProvider } from './best-debates/best-debate-watch';
import { RankingGlobalDesktopRow } from './ranking-block-ui';
import { RankingEntryRowSkeleton } from './ranking-entry-row';

/**
 * The Debates space's Best debates block (GEO-3677): Day, This week and All time over one team
 * order, a coverage line for today, and ranker counts from the shared ballot reader (GEO-3686).
 *
 * The block is graph data everyone sees, so only the actions are gated: Rank and Rank the rest
 * need the `debateRankings` flag and membership of the Debates space. Without both there's no
 * compose entry point at all, so nothing here can send the background membership request that
 * composing does (#3099). Rows never carry vote arrows on this block.
 */

const PAGE = 10;

export type BestDebatesBlockProps = {
  blockId: string;
  spaceId: string;
  /** The block's whole team order (RANK_POSITION), all time, unpaginated. */
  teamOrder: readonly string[];
  /** True until the team order has loaded. */
  isLoadingTeamOrder?: boolean;
  /**
   * The `debateRankings` flag and Debates membership, from the block state (`canComposeEdit`),
   * which also guards `openRankingCompose` itself.
   */
  canRank: boolean;
  isMobile: boolean;
  onOpenCompose: (mode: RankingComposeMode, extraParams?: Readonly<Record<string, string>>) => void;
  onOpenEntity: (entityId: string) => void;
  /**
   * Draws the block's title row with `actions` (the Rank button) at its end. The coverage line sits
   * above it, as in the mockups, so the block draws the header itself rather than its host.
   */
  renderHeader?: (actions: React.ReactNode) => React.ReactNode;
  /** Between the header and the period control: the host's filter and link panels. */
  belowHeader?: React.ReactNode;
};

const defaultHeader = (actions: React.ReactNode) =>
  actions ? <div className="flex items-center justify-end gap-3">{actions}</div> : null;

export function BestDebatesBlock({
  blockId,
  spaceId,
  teamOrder,
  isLoadingTeamOrder = false,
  canRank,
  isMobile,
  onOpenCompose,
  onOpenEntity,
  renderHeader = defaultHeader,
  belowHeader,
}: BestDebatesBlockProps) {
  const todayKey = useNyTodayKey();
  const dayKeys = React.useMemo(() => recentDayKeys(todayKey), [todayKey]);
  const oldestWindowDay = dayKeys[dayKeys.length - 1];

  const [view, setView] = React.useState<BestDebatesView>('day');
  const [pickedDayKey, setPickedDayKey] = React.useState<string | null>(null);
  const dayKey = pickedDayKey ?? todayKey;

  // The block reads the last seven days only: the day strip is the way to a day (the calendar for
  // older days was taken out on 12 Nov; it can come back with its own read).
  const windowQuery = useBestDebatesWindow({ fromDayKey: oldestWindowDay, toDayKey: todayKey });
  const periodQuery = windowQuery;

  const rankers = useBestDebatesRankers({ blockId, spaceId });

  const period: BestDebatesPeriod =
    view === 'all' ? { view: 'all' } : view === 'week' ? { view: 'week', todayKey } : { view: 'day', dayKey };

  const periodDebates = periodQuery.data ?? NO_DEBATES;
  const rows = buildBestDebatesViewRows({
    period,
    teamOrder,
    periodDebates,
    rankerCount: rankers.rankerCount,
  });
  // The viewer's own push-downs count as handled in the coverage line (GEO-3679). Only rankers
  // (flag and membership) have any, so nobody else reads them.
  const { debates: pushedDownDebates } = useMyPushedDownDebates({ blockId: canRank ? blockId : null });
  const pushedDownIds = React.useMemo(() => pushedDownDebates.map(debate => debate.entityId), [pushedDownDebates]);
  const coverage = buildDayCoverage({
    dayKeys,
    teamOrder,
    periodDebates: windowQuery.data ?? NO_DEBATES,
    rankerCount: rankers.rankerCount,
    pushedDownIds,
  });

  const [rankedLimit, setRankedLimit] = React.useState(PAGE);
  const [unrankedLimit, setUnrankedLimit] = React.useState(PAGE);
  React.useEffect(() => {
    setRankedLimit(PAGE);
    setUnrankedLimit(PAGE);
  }, [view, dayKey]);

  const rankedRows = [...rows.ranked, ...rows.awaitingPlace];
  const unplacedRows = rankers.status === 'ready' ? rows.notRanked : rows.unplacedUnknown;
  const visibleRanked = rankedRows.slice(0, rankedLimit);
  const visibleUnplaced = unplacedRows.slice(0, unrankedLimit);

  const nameById = React.useMemo(
    () => new Map(periodDebates.map(debate => [debate.id, debate.name] as const)),
    [periodDebates]
  );
  const { entries } = useRankingEntryEntities(spaceId, [...visibleRanked, ...visibleUnplaced]);
  const entryById = React.useMemo(() => new Map(entries.map(entry => [normId(entry.entityId), entry])), [entries]);
  const displays = useBestDebateDisplays([...visibleRanked, ...visibleUnplaced]);
  const entryFor = (id: string): RankingEntryDisplay | null => {
    const entry = entryById.get(id);
    if (entry) return entry;
    const name = nameById.get(id);
    return name ? { entityId: id, name, description: null, image: null } : null;
  };

  const changeView = (next: BestDebatesView) => {
    if (next === view) return;
    capture('element_changed', {
      source: 'best_debates_block',
      element: 'period',
      value: next,
      previous_value: view,
      block_id: blockId,
      space_id: spaceId,
    });
    setView(next);
    setPickedDayKey(null);
  };

  const today = coverage[0];
  // With nothing from today yet, the line speaks for the whole window, which is what To rank (Rank
  // the rest) holds anyway, rather than leaving an empty box.
  const week = coverage.reduce((sum, day) => ({ ranked: sum.ranked + day.ranked, total: sum.total + day.total }), {
    ranked: 0,
    total: 0,
  });
  const coverageCounts =
    today && today.total > 0 ? { ...today, scope: 'today' as const } : { ...week, scope: 'week' as const };
  const rankTheRest = () => {
    capture('element_clicked', {
      source: 'best_debates_block',
      element_action: 'rank_the_rest',
      block_id: blockId,
      space_id: spaceId,
      unranked_count: coverageCounts.total - coverageCounts.ranked,
    });
    onOpenCompose('edit', { [BEST_DEBATES_TEAM_VIEW_PARAM]: BEST_DEBATES_TEAM_VIEW_TO_RANK });
  };

  // Nothing is said about who ranked what until the reads it rests on are in: an empty list off a
  // pending read would read as "Nobody has ranked". All time is the team order alone, so only Day
  // and This week wait for the period and ballot reads; counts fill in on All time as they arrive.
  const periodLoading =
    (view !== 'all' && (periodQuery.isLoading || rankers.status === 'loading')) || isLoadingTeamOrder;
  const rankersFailed = rankers.status === 'error';
  const periodFailed = view !== 'all' && Boolean(periodQuery.error) && !periodQuery.data;
  // A row's number is its team place, the same in Day, This week and All time.
  const placeOffset = React.useMemo(() => {
    const places = new Map<string, number>();
    teamOrder.forEach(raw => {
      const id = normId(raw);
      if (id && !places.has(id)) places.set(id, places.size + 1);
    });
    return places;
  }, [teamOrder]);

  const renderRow = (id: string, place: number | null) => {
    const entry = entryFor(id);
    const data = displays.get(id);
    const count = rankers.rankerCount(id);
    if (!entry && !data) {
      return (
        <div key={id} className="w-full py-3">
          <RankingEntryRowSkeleton rank={place ?? undefined} />
        </div>
      );
    }
    const rankedBy = count != null && count > 0 ? (rankers.rankersOf?.(id) ?? []) : [];
    const row = (
      <BestDebateRow
        entityId={id}
        fallbackName={entry?.name ?? 'Untitled debate'}
        data={data}
        rank={place}
        aside={
          count != null && count > 0 ? (
            <>
              <RankerAvatars rankers={rankedBy} />
              <span
                className="text-[14px] leading-[15px] whitespace-nowrap text-grey-04 tabular-nums"
                data-testid="best-debates-ranker-count"
              >
                {rankerCountLabel(count)}
              </span>
            </>
          ) : null
        }
      />
    );
    return (
      <div key={id} className="w-full py-3" data-testid="best-debates-row" data-entity-id={id}>
        {isMobile ? (
          <button type="button" className="w-full text-left" onClick={() => onOpenEntity(id)}>
            {row}
          </button>
        ) : (
          <RankingGlobalDesktopRow onOpenSidePanel={() => onOpenEntity(id)}>{row}</RankingGlobalDesktopRow>
        )}
      </div>
    );
  };

  return (
    <BestDebateWatchProvider>
      <div className="flex w-full min-w-0 flex-col gap-4" data-testid="best-debates-block">
        <CoverageLine
          counts={windowQuery.data ? coverageCounts : null}
          loading={windowQuery.isLoading}
          rankers={rankers}
          onRankTheRest={canRank ? rankTheRest : null}
        />

        <div className="flex flex-col gap-2">
          {renderHeader(
            canRank ? (
              <Button
                variant="primary"
                className="h-8 shrink-0 !rounded-full border-text bg-text !px-3.5 text-[16px] whitespace-nowrap text-white hover:bg-text/90 focus-visible:border-text focus-visible:shadow-inner-text"
                onClick={() => onOpenCompose('edit')}
              >
                Rank
              </Button>
            ) : null
          )}
          {belowHeader}
          <div className="w-[300px] md:w-full">
            <SegmentedControl
              label="Period"
              variant="tinted"
              options={BEST_DEBATES_VIEWS}
              value={view}
              onChange={changeView}
            />
          </div>
        </div>

        {view === 'day' ? (
          <DayStrip
            dayKeys={dayKeys}
            todayKey={todayKey}
            selectedDayKey={dayKey}
            coverage={windowQuery.data ? coverage : null}
            countsKnown={rankers.status === 'ready'}
            onSelect={key => {
              capture('element_changed', {
                source: 'best_debates_block',
                element: 'day',
                value: key === todayKey ? 'today' : key,
                block_id: blockId,
                space_id: spaceId,
              });
              setPickedDayKey(key === todayKey ? null : key);
            }}
          />
        ) : null}

        {periodFailed ? (
          <div className="flex items-center gap-3 rounded-lg bg-grey-01 px-4 py-3">
            <p className="text-metadata text-grey-04">Couldn&rsquo;t load these debates.</p>
            <Button variant="secondary" small onClick={() => void periodQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : periodLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map(rank => (
              <RankingEntryRowSkeleton key={rank} rank={rank} />
            ))}
          </div>
        ) : (
          <>
            {rankedRows.length === 0 ? (
              rankersFailed ? (
                <div
                  className="flex items-center gap-3 rounded-lg bg-grey-01 px-4 py-3"
                  data-testid="best-debates-rankers-error"
                >
                  <p className="text-metadata text-grey-04">Couldn&rsquo;t load who ranked these debates.</p>
                  <Button variant="secondary" small onClick={() => void rankers.retry()}>
                    Retry
                  </Button>
                </div>
              ) : (
                <p className="text-metadata text-grey-04">{emptyRankedCopy(view, unplacedRows.length > 0)}</p>
              )
            ) : (
              <div className="flex flex-col">{visibleRanked.map(id => renderRow(id, placeOffset.get(id) ?? null))}</div>
            )}
            {rankedRows.length > rankedLimit ? (
              <ShowMore onClick={() => setRankedLimit(limit => limit + PAGE)} />
            ) : null}

            {view !== 'all' && unplacedRows.length > 0 ? (
              <section className="flex flex-col gap-3" aria-label="Not ranked yet">
                <div className="flex items-center gap-3 pt-2">
                  <span className="text-breadcrumb font-medium whitespace-nowrap text-grey-04">
                    {rankers.status === 'ready' ? 'Not ranked yet' : 'Not in the team ranking yet'} ·{' '}
                    {unplacedRows.length}
                  </span>
                  <span className="h-px flex-1 bg-grey-02" aria-hidden />
                </div>
                <div className="flex flex-col">{visibleUnplaced.map(id => renderRow(id, null))}</div>
                {unplacedRows.length > unrankedLimit ? (
                  <ShowMore onClick={() => setUnrankedLimit(limit => limit + PAGE)} />
                ) : null}
              </section>
            ) : null}
          </>
        )}
      </div>
    </BestDebateWatchProvider>
  );
}

const NO_DEBATES: PeriodDebate[] = [];

function emptyRankedCopy(view: BestDebatesView, hasUnplaced: boolean): string {
  if (view === 'all') return 'Nobody has ranked a debate yet.';
  if (!hasUnplaced) return view === 'day' ? 'No debates were published on this day.' : 'No debates this week yet.';
  return view === 'day'
    ? 'Nobody has ranked a debate from this day yet.'
    : 'Nobody has ranked a debate from this week yet.';
}

function ShowMore({ onClick }: { onClick: () => void }) {
  return (
    <div>
      <Button variant="secondary" small onClick={onClick}>
        Show more
      </Button>
    </div>
  );
}

function CoverageLine({
  counts,
  loading,
  rankers,
  onRankTheRest,
}: {
  counts: { ranked: number; total: number; scope: 'today' | 'week' } | null;
  loading: boolean;
  rankers: BestDebatesRankers;
  onRankTheRest: (() => void) | null;
}) {
  if (loading || !counts) return null;

  if (rankers.status === 'error') {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-grey-01 p-3" data-testid="best-debates-coverage">
        <span className="text-metadata text-grey-04">Couldn&rsquo;t check who ranked today&rsquo;s debates.</span>
        <Button variant="secondary" small onClick={() => void rankers.retry()}>
          Retry
        </Button>
      </div>
    );
  }
  // Counts need a ready read; until then a placed-only count would undercount.
  if (rankers.status !== 'ready') return null;
  // Nothing in the whole window: no line at all rather than an empty box.
  if (counts.total === 0) return null;

  const share = (counts.ranked / counts.total) * 100;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-grey-01 p-3" data-testid="best-debates-coverage">
      <span className="text-[16px] leading-[20px] text-text">
        {counts.scope === 'today' ? coverageSentence(counts) : weekCoverageSentence(counts)}
      </span>
      <span className="h-1.5 min-w-[120px] flex-1 overflow-hidden rounded-full bg-grey-02" aria-hidden>
        <span className="block h-full bg-text" style={{ width: `${share}%` }} />
      </span>
      {onRankTheRest && counts.ranked < counts.total ? (
        <Button
          variant="primary"
          small
          className="!rounded-full border-text bg-text text-white hover:bg-text/90"
          onClick={onRankTheRest}
        >
          Rank the rest
        </Button>
      ) : null}
    </div>
  );
}

function DayStrip({
  dayKeys,
  todayKey,
  selectedDayKey,
  coverage,
  countsKnown,
  onSelect,
}: {
  dayKeys: readonly string[];
  todayKey: string;
  selectedDayKey: string;
  coverage: ReadonlyArray<{ dayKey: string; ranked: number; total: number }> | null;
  countsKnown: boolean;
  onSelect: (dayKey: string) => void;
}) {
  const byDay = new Map(coverage?.map(day => [day.dayKey, day]) ?? []);

  const caption = (key: string) => {
    const day = byDay.get(key);
    if (!day) return ' ';
    if (day.total === 0) return 'No debates';
    return countsKnown
      ? `${day.ranked} of ${day.total} ranked`
      : `${day.total} ${day.total === 1 ? 'debate' : 'debates'}`;
  };

  return (
    <div
      className="flex [scrollbar-width:none] gap-2 overflow-x-auto p-0.5 [&::-webkit-scrollbar]:hidden"
      role="group"
      aria-label={`Last ${BEST_DEBATES_WINDOW_DAYS} days`}
    >
      {dayKeys.map(key => (
        <DayButton
          key={key}
          label={dayLabel(key, todayKey)}
          caption={caption(key)}
          pressed={selectedDayKey === key}
          onClick={() => onSelect(key)}
        />
      ))}
    </div>
  );
}

function DayButton({
  label,
  caption,
  pressed,
  onClick,
}: {
  label: string;
  caption: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        'flex min-w-[104px] shrink-0 flex-col gap-0.5 rounded-lg border p-2 text-left transition-colors',
        pressed ? 'border-text bg-white' : 'border-grey-02 bg-white hover:border-grey-03'
      )}
    >
      <span className="text-[16px] leading-[20px] font-medium text-text">{label}</span>
      <span className="text-[11px] leading-[13px] text-grey-04">{caption}</span>
    </button>
  );
}
