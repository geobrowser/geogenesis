'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { useSetAtom } from 'jotai';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { RemoveScroll } from 'react-remove-scroll';

import type { SpaceBountiesResult, SpaceBounty } from '~/core/community/bounty-types';
import { useInterestedBountyIds, useInterestedInBounty } from '~/core/community/use-interested-in-bounty';
import {
  BOUNTY_DIFFICULTY_LEVELS,
  BOUNTY_TASK_STATUS_DONE_ENTITY_ID,
  BOUNTY_TASK_STATUS_IN_PROGRESS_ENTITY_ID,
  BOUNTY_TASK_STATUS_TODO_ENTITY_ID,
} from '~/core/constants';
import { useInfiniteScrollSentinel } from '~/core/hooks/use-infinite-scroll-sentinel';
import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';
import { NavUtils } from '~/core/utils/utils';

import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import {
  AVAILABLE_CARD_HEIGHT_PX,
  AVAILABLE_CARD_WIDTH_PX,
  AvailableBountyCard,
  BountyCard,
  CARD_WIDTH_PX,
  COMPLETED_CARD_HEIGHT_PX,
  IN_PROGRESS_CARD_HEIGHT_PX,
  InProgressBountyCard,
} from './bounty-card';
import { type BountyScope, CheckboxFilter, ScopeFilter } from './bounty-filters';
import type { BountyStatusSlug } from './bounty-status';
import { FILTER_PILL_CLASS } from './community-filter-pill';
import { communityFullscreenActiveAtom } from '~/atoms';

const EMPTY_RESULT: SpaceBountiesResult = { bounties: [], skills: [], truncated: false };

const INLINE_CARD_LIMIT = 4;

const INFINITE_PAGE_SIZE = 8;

const SECTION_TITLE_CLASS = 'text-[24px] leading-[29px] font-semibold tracking-[-0.75px] text-[#2A2B2E]';

const selectsEverything = (selected: Set<string>, options: readonly string[]) =>
  selected.size === 0 || options.every(option => selected.has(option));

function applyFilters(
  bounties: SpaceBounty[],
  scope: BountyScope,
  difficulties: Set<string>,
  skills: Set<string>,
  allSkills: string[]
): SpaceBounty[] {
  const allDifficultiesSelected = selectsEverything(difficulties, BOUNTY_DIFFICULTY_LEVELS);
  const allSkillsSelected = selectsEverything(skills, allSkills);

  return bounties.filter(bounty => {
    if (scope === 'featured' && !bounty.isFeatured) return false;

    if (!allDifficultiesSelected && !(bounty.difficulty && difficulties.has(bounty.difficulty))) return false;

    if (!allSkillsSelected && !bounty.skills.some(skill => skills.has(skill))) return false;

    return true;
  });
}

type BountyCardComponent = (props: { bounty: SpaceBounty }) => React.ReactElement;

const GRID_CLASS = 'flex flex-wrap gap-4';

function BountyGrid({ bounties, card: Card }: { bounties: SpaceBounty[]; card: BountyCardComponent }) {
  return (
    <div className={GRID_CLASS}>
      {bounties.map(bounty => (
        <Card key={bounty.id} bounty={bounty} />
      ))}
    </div>
  );
}

type BountyGridProps = {
  bounties: SpaceBounty[];
  allBounties: SpaceBounty[];
};

type BountyGridComponent = (props: BountyGridProps) => React.ReactElement;

function CompletedBountyGrid({ bounties }: BountyGridProps) {
  return <BountyGrid bounties={bounties} card={BountyCard} />;
}

function InProgressBountyGrid({ bounties }: BountyGridProps) {
  return <BountyGrid bounties={bounties} card={InProgressBountyCard} />;
}

/**
 * Available bounties bind each card to the viewer's interest state
 */
function AvailableBountyGrid({ bounties, allBounties }: BountyGridProps) {
  const bountyIds = React.useMemo(() => allBounties.map(bounty => bounty.id), [allBounties]);
  const { interestedIds, isLoading: isInterestLoading } = useInterestedBountyIds(bountyIds);
  const { registerInterest, pendingBountyId, canRegisterInterest } = useInterestedInBounty();

  return (
    <div className={GRID_CLASS}>
      {bounties.map(bounty => (
        <AvailableBountyCard
          key={bounty.id}
          bounty={bounty}
          isInterested={interestedIds.has(bounty.id)}
          isPending={pendingBountyId === bounty.id}
          isInterestLoading={isInterestLoading}
          canRegisterInterest={canRegisterInterest}
          onRegisterInterest={target =>
            void registerInterest({
              bountyId: target.id,
              bountyName: target.name,
              bountySpaceId: target.spaceId,
            })
          }
        />
      ))}
    </div>
  );
}

function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-grey-02 bg-white px-4 py-8 text-center text-[16px] leading-[20px] text-grey-04">
      {message}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}

function BountiesErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      message="Could not load bounties."
      action={
        <button type="button" onClick={onRetry} className={FILTER_PILL_CLASS}>
          Try again
        </button>
      }
    />
  );
}

function BountiesTruncatedNotice({ shown, totalCount }: { shown: number; totalCount?: number }) {
  const message =
    totalCount != null && totalCount > shown
      ? `Showing ${shown} of ${totalCount} bounties.`
      : 'This list may be incomplete.';

  return <p className="text-[16px] leading-[20px] text-grey-04">{message}</p>;
}

function BountiesEmptyState({
  totalCount,
  emptyMessage,
  onShowAll,
}: {
  totalCount: number;
  emptyMessage: string;
  onShowAll: () => void;
}) {
  if (totalCount === 0) return <EmptyState message={emptyMessage} />;

  return (
    <EmptyState
      message={`${totalCount === 1 ? '1 bounty is' : `${totalCount} bounties are`} hidden by the current filters.`}
      action={
        <button type="button" onClick={onShowAll} className={FILTER_PILL_CLASS}>
          Show all
        </button>
      }
    />
  );
}

function useSpaceBounties(spaceId: string, taskStatusId: string) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['space-bounties', spaceId, taskStatusId],
    queryFn: async () => {
      const params = new URLSearchParams({ taskStatusId });
      const response = await fetch(`/api/space/${spaceId}/bounties?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to load bounties');
      return (await response.json()) as SpaceBountiesResult;
    },
    staleTime: 60_000,
    retry: 2,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 8000),
  });

  const { bounties, skills, truncated, totalCount } = data ?? EMPTY_RESULT;
  return { bounties, skills, truncated, totalCount, isLoading: isPending, isError, refetch };
}

type BountyFilterValues = {
  scope: BountyScope;
  difficulties: Set<string>;
  selectedSkills: Set<string> | null;
};

type BountyFilterSetters = {
  setScope: (next: BountyScope) => void;
  setDifficulties: (next: Set<string>) => void;
  setSelectedSkills: (next: Set<string> | null) => void;
  clearFilters: () => void;
};

type BountyFilterState = {
  filtered: SpaceBounty[];
  filterKey: string;
  controls: React.ReactNode;
  clearFilters: () => void;
};

const allDifficultiesSelected = (difficulties: Set<string>) =>
  selectsEverything(difficulties, BOUNTY_DIFFICULTY_LEVELS);

function useBountyFilterPresentation(
  bounties: SpaceBounty[],
  skills: string[],
  { scope, difficulties, selectedSkills }: BountyFilterValues,
  { setScope, setDifficulties, setSelectedSkills, clearFilters }: BountyFilterSetters
): BountyFilterState {
  const skillSelection = React.useMemo(() => selectedSkills ?? new Set(skills), [selectedSkills, skills]);

  const filtered = React.useMemo(
    () => applyFilters(bounties, scope, difficulties, skillSelection, skills),
    [bounties, scope, difficulties, skillSelection, skills]
  );

  const filterKey = `${scope}|${[...difficulties].sort().join(',')}|${
    selectedSkills ? [...selectedSkills].sort().join(',') : '*'
  }`;

  const controls = (
    <>
      <ScopeFilter value={scope} onChange={setScope} />
      <CheckboxFilter
        allLabel="Any difficulty"
        options={[...BOUNTY_DIFFICULTY_LEVELS]}
        selected={difficulties}
        onChange={setDifficulties}
      />
      <CheckboxFilter allLabel="Any skill" options={skills} selected={skillSelection} onChange={setSelectedSkills} />
    </>
  );

  return { filtered, filterKey, controls, clearFilters };
}

function useBountyFilterState(bounties: SpaceBounty[], skills: string[]): BountyFilterState {
  const [scope, setScope] = React.useState<BountyScope>('featured');
  const [difficulties, setDifficulties] = React.useState<Set<string>>(() => new Set(BOUNTY_DIFFICULTY_LEVELS));
  const [selectedSkills, setSelectedSkills] = React.useState<Set<string> | null>(null);

  const clearFilters = React.useCallback(() => {
    setScope('all');
    setDifficulties(new Set(BOUNTY_DIFFICULTY_LEVELS));
    setSelectedSkills(null);
  }, []);

  return useBountyFilterPresentation(
    bounties,
    skills,
    { scope, difficulties, selectedSkills },
    { setScope, setDifficulties, setSelectedSkills, clearFilters }
  );
}

/**
 * Filter state mirrored in the URL query
 */
function useUrlBountyFilterState(bounties: SpaceBounty[], skills: string[]): BountyFilterState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const scope: BountyScope = searchParams.get('scope') === 'all' ? 'all' : 'featured';

  const difficultyParam = searchParams.get('difficulty');
  const difficulties = React.useMemo(() => {
    if (difficultyParam == null) return new Set<string>(BOUNTY_DIFFICULTY_LEVELS);
    const levels = BOUNTY_DIFFICULTY_LEVELS as readonly string[];
    return new Set(difficultyParam.split(',').filter(level => levels.includes(level)));
  }, [difficultyParam]);

  const skillParam = searchParams.get('skill');
  const selectedSkills = React.useMemo(
    () => (skillParam == null ? null : new Set(skillParam.split(',').filter(Boolean))),
    [skillParam]
  );

  const commit = React.useCallback(
    (next: BountyFilterValues) => {
      const params = new URLSearchParams(searchParams.toString());

      if (next.scope === 'all') params.set('scope', 'all');
      else params.delete('scope');

      if (allDifficultiesSelected(next.difficulties)) params.delete('difficulty');
      else params.set('difficulty', [...next.difficulties].join(','));

      const noSkillFilter =
        next.selectedSkills == null ||
        (skills.length > 0 && selectsEverything(next.selectedSkills, skills)) ||
        next.selectedSkills.size === 0;
      if (noSkillFilter) params.delete('skill');
      else params.set('skill', [...next.selectedSkills!].join(','));

      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams, skills]
  );

  const values: BountyFilterValues = { scope, difficulties, selectedSkills };

  const setters: BountyFilterSetters = {
    setScope: nextScope => commit({ ...values, scope: nextScope }),
    setDifficulties: nextDifficulties => commit({ ...values, difficulties: nextDifficulties }),
    setSelectedSkills: nextSelectedSkills => commit({ ...values, selectedSkills: nextSelectedSkills }),
    clearFilters: () => commit({ scope: 'all', difficulties: new Set(BOUNTY_DIFFICULTY_LEVELS), selectedSkills: null }),
  };

  return useBountyFilterPresentation(bounties, skills, values, setters);
}

function BountiesSection({
  spaceId,
  title,
  taskStatusId,
  emptyMessage,
  grid: Grid,
  cardHeightPx,
  cardWidthPx = CARD_WIDTH_PX,
  isInfinite = false,
  viewAllHref,
}: {
  spaceId: string;
  title: string;
  taskStatusId: string;
  emptyMessage: string;
  grid: BountyGridComponent;
  cardHeightPx: number;
  cardWidthPx?: number;
  isInfinite?: boolean;
  /** "View all" navigates to this full-screen route. */
  viewAllHref: string;
}) {
  const { bounties, skills, isLoading, isError, refetch, truncated, totalCount } = useSpaceBounties(
    spaceId,
    taskStatusId
  );
  const { filtered, filterKey, controls: filterControls, clearFilters } = useBountyFilterState(bounties, skills);

  const [visibleCount, setVisibleCount] = React.useState(INFINITE_PAGE_SIZE);

  React.useEffect(() => {
    setVisibleCount(INFINITE_PAGE_SIZE);
  }, [filterKey]);

  const hasMore = isInfinite && visibleCount < filtered.length;

  const revealNextPage = React.useCallback(() => setVisibleCount(count => count + INFINITE_PAGE_SIZE), []);

  const sentinelRef = useInfiniteScrollSentinel({
    hasNextPage: hasMore,
    isFetchingNextPage: false,
    fetchNextPage: revealNextPage,
  });

  const inlineBounties = filtered.slice(0, isInfinite ? visibleCount : INLINE_CARD_LIMIT);

  const viewAllDisabled = filtered.length === 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={SECTION_TITLE_CLASS}>{title}</h2>

        <div className="flex flex-wrap items-center gap-2">
          {filterControls}
          <Link
            href={viewAllHref}
            aria-disabled={viewAllDisabled}
            className={cx(FILTER_PILL_CLASS, viewAllDisabled && 'pointer-events-none opacity-50')}
          >
            View all
          </Link>
        </div>
      </div>

      {isError ? (
        <BountiesErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="flex flex-wrap gap-4">
          {Array.from({ length: INLINE_CARD_LIMIT }).map((_, index) => (
            <Skeleton key={index} className="rounded-lg" style={{ width: cardWidthPx, height: cardHeightPx }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <BountiesEmptyState totalCount={bounties.length} emptyMessage={emptyMessage} onShowAll={clearFilters} />
      ) : (
        <>
          <Grid bounties={inlineBounties} allBounties={bounties} />
          {truncated ? <BountiesTruncatedNotice shown={bounties.length} totalCount={totalCount} /> : null}
          {hasMore ? <div ref={sentinelRef} aria-hidden className="h-px w-full" /> : null}
        </>
      )}
    </section>
  );
}

function CommunityFullscreen({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobileLayout();
  const setFullscreenActive = useSetAtom(communityFullscreenActiveAtom);

  React.useEffect(() => {
    setFullscreenActive(true);
    return () => setFullscreenActive(false);
  }, [setFullscreenActive]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white" style={{ top: 44 }}>
      {isMobile ? (
        <RemoveScroll className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</RemoveScroll>
      ) : (
        children
      )}
    </div>
  );
}

/**
 * Full-screen route counterpart to a section's "View all"
 */
function BountiesFullView({
  spaceId,
  title,
  taskStatusId,
  backHref,
  grid: Grid,
  cardHeightPx,
  cardWidthPx = CARD_WIDTH_PX,
  emptyMessage,
}: {
  spaceId: string;
  title: string;
  taskStatusId: string;
  backHref: string;
  grid: BountyGridComponent;
  cardHeightPx: number;
  cardWidthPx?: number;
  emptyMessage: string;
}) {
  const { bounties, skills, isLoading, isError, refetch, truncated, totalCount } = useSpaceBounties(
    spaceId,
    taskStatusId
  );
  const { filtered, controls: filterControls, clearFilters } = useUrlBountyFilterState(bounties, skills);

  return (
    <CommunityFullscreen>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={backHref}
            aria-label="Back to community"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm hover:bg-grey-01"
          >
            <ArrowLeft color="grey-04" />
          </Link>
          <h1 className={SECTION_TITLE_CLASS}>{title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">{filterControls}</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {isError ? (
          <BountiesErrorState onRetry={() => void refetch()} />
        ) : isLoading ? (
          <div className="flex flex-wrap gap-4">
            {Array.from({ length: INLINE_CARD_LIMIT }).map((_, index) => (
              <Skeleton key={index} className="rounded-lg" style={{ width: cardWidthPx, height: cardHeightPx }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <BountiesEmptyState totalCount={bounties.length} emptyMessage={emptyMessage} onShowAll={clearFilters} />
        ) : (
          <>
            <Grid bounties={filtered} allBounties={bounties} />
            {truncated ? <BountiesTruncatedNotice shown={bounties.length} totalCount={totalCount} /> : null}
          </>
        )}
      </div>
    </CommunityFullscreen>
  );
}

type BountyStatusConfig = {
  title: string;
  taskStatusId: string;
  grid: BountyGridComponent;
  cardHeightPx: number;
  cardWidthPx: number;
  emptyMessage: string;
  isInfinite?: boolean;
};

const BOUNTY_STATUS_CONFIG: Record<BountyStatusSlug, BountyStatusConfig> = {
  completed: {
    title: 'Completed bounties',
    taskStatusId: BOUNTY_TASK_STATUS_DONE_ENTITY_ID,
    grid: CompletedBountyGrid,
    cardHeightPx: COMPLETED_CARD_HEIGHT_PX,
    cardWidthPx: CARD_WIDTH_PX,
    emptyMessage: 'No completed bounties yet.',
  },
  'in-progress': {
    title: 'In progress bounties',
    taskStatusId: BOUNTY_TASK_STATUS_IN_PROGRESS_ENTITY_ID,
    grid: InProgressBountyGrid,
    cardHeightPx: IN_PROGRESS_CARD_HEIGHT_PX,
    cardWidthPx: CARD_WIDTH_PX,
    emptyMessage: 'No in progress bounties yet.',
  },
  available: {
    title: 'Available bounties',
    taskStatusId: BOUNTY_TASK_STATUS_TODO_ENTITY_ID,
    grid: AvailableBountyGrid,
    cardHeightPx: AVAILABLE_CARD_HEIGHT_PX,
    cardWidthPx: AVAILABLE_CARD_WIDTH_PX,
    emptyMessage: 'No available bounties yet.',
    isInfinite: true,
  },
};

export function BountiesStatusFullView({ spaceId, status }: { spaceId: string; status: BountyStatusSlug }) {
  return (
    <BountiesFullView spaceId={spaceId} backHref={NavUtils.toCommunity(spaceId)} {...BOUNTY_STATUS_CONFIG[status]} />
  );
}

export function BountiesStatusSection({ spaceId, status }: { spaceId: string; status: BountyStatusSlug }) {
  return (
    <BountiesSection
      spaceId={spaceId}
      viewAllHref={NavUtils.toCommunityBounties(spaceId, status)}
      {...BOUNTY_STATUS_CONFIG[status]}
    />
  );
}
