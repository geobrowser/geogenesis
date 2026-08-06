'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type { SpaceBountiesResult, SpaceBounty } from '~/core/community/bounty-types';
import { useInterestedBountyIds, useInterestedInBounty } from '~/core/community/use-interested-in-bounty';
import {
  BOUNTY_DIFFICULTY_LEVELS,
  BOUNTY_TASK_STATUS_DONE_ENTITY_ID,
  BOUNTY_TASK_STATUS_IN_PROGRESS_ENTITY_ID,
  BOUNTY_TASK_STATUS_TODO_ENTITY_ID,
} from '~/core/constants';
import { useInfiniteScrollSentinel } from '~/core/hooks/use-infinite-scroll-sentinel';
import { NavUtils } from '~/core/utils/utils';

import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { RankingComposeFullscreen } from '~/partials/blocks/table/ranking-compose-fullscreen';

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

const EMPTY_RESULT: SpaceBountiesResult = { bounties: [], skills: [] };

const INLINE_CARD_LIMIT = 4;

const INFINITE_PAGE_SIZE = 8;

const SECTION_TITLE_CLASS = 'text-[24px] leading-[29px] font-semibold tracking-[-0.75px] text-[#2A2B2E]';

function applyFilters(
  bounties: SpaceBounty[],
  scope: BountyScope,
  difficulties: Set<string>,
  skills: Set<string>,
  allSkills: string[]
): SpaceBounty[] {
  const allDifficultiesSelected = BOUNTY_DIFFICULTY_LEVELS.every(level => difficulties.has(level));
  const allSkillsSelected = allSkills.length === 0 || allSkills.every(skill => skills.has(skill));

  return bounties.filter(bounty => {
    if (scope === 'featured' && !bounty.isFeatured) return false;

    if (!allDifficultiesSelected && !(bounty.difficulty && difficulties.has(bounty.difficulty))) return false;

    if (!allSkillsSelected && !bounty.skills.some(skill => skills.has(skill))) return false;

    return true;
  });
}

type BountyCardComponent = (props: { bounty: SpaceBounty }) => React.ReactElement;

function BountyGrid({ bounties, card: Card }: { bounties: SpaceBounty[]; card: BountyCardComponent }) {
  return (
    <div className="flex flex-wrap gap-4">
      {bounties.map(bounty => (
        <Card key={bounty.id} bounty={bounty} />
      ))}
    </div>
  );
}

/**
 * Available bounties bind each card to the viewer's interest state
 */
function useAvailableBountyCard(bounties: SpaceBounty[]): BountyCardComponent {
  const bountyIds = React.useMemo(() => bounties.map(bounty => bounty.id), [bounties]);
  const interestedIds = useInterestedBountyIds(bountyIds);
  const { registerInterest, pendingBountyId, canRegisterInterest } = useInterestedInBounty();

  const latest = React.useRef({ interestedIds, pendingBountyId, canRegisterInterest, registerInterest });
  latest.current = { interestedIds, pendingBountyId, canRegisterInterest, registerInterest };

  return React.useMemo<BountyCardComponent>(
    () =>
      function AvailableBountyCardConnected({ bounty }: { bounty: SpaceBounty }) {
        const { interestedIds, pendingBountyId, canRegisterInterest, registerInterest } = latest.current;
        return (
          <AvailableBountyCard
            bounty={bounty}
            isInterested={interestedIds.has(bounty.id)}
            isPending={pendingBountyId === bounty.id}
            canRegisterInterest={canRegisterInterest}
            onRegisterInterest={target =>
              void registerInterest({
                bountyId: target.id,
                bountyName: target.name,
                bountySpaceId: target.spaceId,
              })
            }
          />
        );
      },
    []
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-grey-02 bg-white px-4 py-8 text-center text-[16px] leading-[20px] text-grey-04">
      {message}
    </div>
  );
}

type UseBountyCard = (bounties: SpaceBounty[]) => BountyCardComponent;

function staticCard(Component: BountyCardComponent): UseBountyCard {
  return () => Component;
}

const USE_COMPLETED_CARD = staticCard(BountyCard);
const USE_IN_PROGRESS_CARD = staticCard(InProgressBountyCard);

function useSpaceBounties(spaceId: string, taskStatusId: string) {
  const { data } = useQuery({
    queryKey: ['space-bounties', spaceId, taskStatusId],
    queryFn: async () => {
      const params = new URLSearchParams({ taskStatusId });
      const response = await fetch(`/api/space/${spaceId}/bounties?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to load bounties');
      return (await response.json()) as SpaceBountiesResult;
    },
    staleTime: 60_000,
  });

  const { bounties, skills } = data ?? EMPTY_RESULT;
  return { bounties, skills, isLoading: !data };
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
};

type BountyFilterState = {
  filtered: SpaceBounty[];
  filterKey: string;
  controls: React.ReactNode;
};

const allDifficultiesSelected = (difficulties: Set<string>) =>
  BOUNTY_DIFFICULTY_LEVELS.every(level => difficulties.has(level));

function useBountyFilterPresentation(
  bounties: SpaceBounty[],
  skills: string[],
  { scope, difficulties, selectedSkills }: BountyFilterValues,
  { setScope, setDifficulties, setSelectedSkills }: BountyFilterSetters
): BountyFilterState {
  const skillSelection = selectedSkills ?? new Set(skills);

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

  return { filtered, filterKey, controls };
}

function useBountyFilterState(bounties: SpaceBounty[], skills: string[]): BountyFilterState {
  const [scope, setScope] = React.useState<BountyScope>('featured');
  const [difficulties, setDifficulties] = React.useState<Set<string>>(() => new Set(BOUNTY_DIFFICULTY_LEVELS));
  const [selectedSkills, setSelectedSkills] = React.useState<Set<string> | null>(null);

  return useBountyFilterPresentation(
    bounties,
    skills,
    { scope, difficulties, selectedSkills },
    { setScope, setDifficulties, setSelectedSkills }
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
        next.selectedSkills == null || (skills.length > 0 && skills.every(skill => next.selectedSkills!.has(skill)));
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
  };

  return useBountyFilterPresentation(bounties, skills, values, setters);
}

function BountiesSection({
  spaceId,
  title,
  taskStatusId,
  emptyMessage,
  useCard,
  cardHeightPx,
  cardWidthPx = CARD_WIDTH_PX,
  isInfinite = false,
  viewAllHref,
}: {
  spaceId: string;
  title: string;
  taskStatusId: string;
  emptyMessage: string;
  useCard: UseBountyCard;
  cardHeightPx: number;
  cardWidthPx?: number;
  isInfinite?: boolean;
  /** "View all" navigates to this full-screen route. */
  viewAllHref: string;
}) {
  const { bounties, skills, isLoading } = useSpaceBounties(spaceId, taskStatusId);
  const { filtered, filterKey, controls: filterControls } = useBountyFilterState(bounties, skills);

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
  const card = useCard(bounties);

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

      {isLoading ? (
        <div className="flex flex-wrap gap-4">
          {Array.from({ length: INLINE_CARD_LIMIT }).map((_, index) => (
            <Skeleton key={index} className="rounded-lg" style={{ width: cardWidthPx, height: cardHeightPx }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <>
          <BountyGrid bounties={inlineBounties} card={card} />
          {hasMore ? <div ref={sentinelRef} aria-hidden className="h-px w-full" /> : null}
        </>
      )}
    </section>
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
  useCard,
  cardHeightPx,
  cardWidthPx = CARD_WIDTH_PX,
  emptyMessage,
}: {
  spaceId: string;
  title: string;
  taskStatusId: string;
  backHref: string;
  useCard: UseBountyCard;
  cardHeightPx: number;
  cardWidthPx?: number;
  emptyMessage: string;
}) {
  const { bounties, skills, isLoading } = useSpaceBounties(spaceId, taskStatusId);
  const { filtered, controls: filterControls } = useUrlBountyFilterState(bounties, skills);
  const card = useCard(bounties);

  // Reuse the app's full-screen shell (the same one the ranking full-screen view uses): it
  // owns the below-navbar positioning and drops the browse sidebar, so this matches that
  // layout exactly — top bar only, no gap, no left sidebar.
  return (
    <RankingComposeFullscreen>
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
        {isLoading ? (
          <div className="flex flex-wrap gap-4">
            {Array.from({ length: INLINE_CARD_LIMIT }).map((_, index) => (
              <Skeleton key={index} className="rounded-lg" style={{ width: cardWidthPx, height: cardHeightPx }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState message={emptyMessage} />
        ) : (
          <BountyGrid bounties={filtered} card={card} />
        )}
      </div>
    </RankingComposeFullscreen>
  );
}

type BountyStatusConfig = {
  title: string;
  taskStatusId: string;
  useCard: UseBountyCard;
  cardHeightPx: number;
  cardWidthPx: number;
  emptyMessage: string;
};

const BOUNTY_STATUS_CONFIG: Record<BountyStatusSlug, BountyStatusConfig> = {
  completed: {
    title: 'Completed bounties',
    taskStatusId: BOUNTY_TASK_STATUS_DONE_ENTITY_ID,
    useCard: USE_COMPLETED_CARD,
    cardHeightPx: COMPLETED_CARD_HEIGHT_PX,
    cardWidthPx: CARD_WIDTH_PX,
    emptyMessage: 'No completed bounties match these filters.',
  },
  'in-progress': {
    title: 'In progress bounties',
    taskStatusId: BOUNTY_TASK_STATUS_IN_PROGRESS_ENTITY_ID,
    useCard: USE_IN_PROGRESS_CARD,
    cardHeightPx: IN_PROGRESS_CARD_HEIGHT_PX,
    cardWidthPx: CARD_WIDTH_PX,
    emptyMessage: 'No in progress bounties match these filters.',
  },
  available: {
    title: 'Available bounties',
    taskStatusId: BOUNTY_TASK_STATUS_TODO_ENTITY_ID,
    useCard: useAvailableBountyCard,
    cardHeightPx: AVAILABLE_CARD_HEIGHT_PX,
    cardWidthPx: AVAILABLE_CARD_WIDTH_PX,
    emptyMessage: 'No available bounties match these filters.',
  },
};

export function BountiesStatusFullView({ spaceId, status }: { spaceId: string; status: BountyStatusSlug }) {
  return (
    <BountiesFullView spaceId={spaceId} backHref={NavUtils.toCommunity(spaceId)} {...BOUNTY_STATUS_CONFIG[status]} />
  );
}

export function CompletedBountiesSection({ spaceId }: { spaceId: string }) {
  return (
    <BountiesSection
      spaceId={spaceId}
      title="Completed bounties"
      taskStatusId={BOUNTY_TASK_STATUS_DONE_ENTITY_ID}
      emptyMessage="No completed bounties match these filters."
      useCard={USE_COMPLETED_CARD}
      cardHeightPx={COMPLETED_CARD_HEIGHT_PX}
      viewAllHref={NavUtils.toCommunityBounties(spaceId, 'completed')}
    />
  );
}

export function InProgressBountiesSection({ spaceId }: { spaceId: string }) {
  return (
    <BountiesSection
      spaceId={spaceId}
      title="In progress bounties"
      taskStatusId={BOUNTY_TASK_STATUS_IN_PROGRESS_ENTITY_ID}
      emptyMessage="No in progress bounties match these filters."
      useCard={USE_IN_PROGRESS_CARD}
      cardHeightPx={IN_PROGRESS_CARD_HEIGHT_PX}
      viewAllHref={NavUtils.toCommunityBounties(spaceId, 'in-progress')}
    />
  );
}

export function AvailableBountiesSection({ spaceId }: { spaceId: string }) {
  return (
    <BountiesSection
      spaceId={spaceId}
      title="Available bounties"
      taskStatusId={BOUNTY_TASK_STATUS_TODO_ENTITY_ID}
      emptyMessage="No available bounties match these filters."
      useCard={useAvailableBountyCard}
      cardHeightPx={AVAILABLE_CARD_HEIGHT_PX}
      cardWidthPx={AVAILABLE_CARD_WIDTH_PX}
      isInfinite
      viewAllHref={NavUtils.toCommunityBounties(spaceId, 'available')}
    />
  );
}
