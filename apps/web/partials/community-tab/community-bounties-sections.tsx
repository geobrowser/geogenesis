'use client';

import * as React from 'react';

import cx from 'classnames';

import { collectSkillNames, skillIdsByName, toSpaceBounty } from '~/core/bounties/community-adapter';
import { type CommunitySection, buildBountiesHref, communitySectionFilters } from '~/core/bounties/filters';
import { type DifficultyKey, statusKeyForId } from '~/core/bounties/labels';
import { useBoardBounties } from '~/core/bounties/use-bounties';
import type { SpaceBounty } from '~/core/community/bounty-types';
import { useInterestedBountyIds, useInterestedInBounty } from '~/core/community/use-interested-in-bounty';
import { BOUNTY_DIFFICULTY_LEVELS } from '~/core/constants';
import { useInfiniteScrollSentinel } from '~/core/hooks/use-infinite-scroll-sentinel';
import { NavUtils } from '~/core/utils/utils';

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

/**
 * One section's bounties, sliced from the space's board data (`core/bounties`
 * — one query for the whole space, shared with the board and the detail page)
 * by workflow status and adapted to the card view-model.
 */
function useSectionBounties(spaceId: string, section: CommunitySection) {
  const { data, isLoading, isError, refetch } = useBoardBounties([spaceId]);
  const statuses = communitySectionFilters(section).statuses;

  const sectionBounties = React.useMemo(
    () => (data?.bounties ?? []).filter(bounty => statuses.includes(statusKeyForId(bounty.statusId))),
    [data?.bounties, statuses]
  );
  const bounties = React.useMemo(() => sectionBounties.map(toSpaceBounty), [sectionBounties]);
  const skills = React.useMemo(() => collectSkillNames(sectionBounties), [sectionBounties]);
  const skillIds = React.useMemo(() => skillIdsByName(sectionBounties), [sectionBounties]);

  return { bounties, skills, skillIds, isLoading, isError, refetch };
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
  values: BountyFilterValues;
};

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

  return { filtered, filterKey, controls, clearFilters, values: { scope, difficulties, selectedSkills } };
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
 * "View all" deep-links into the space's bounty board with this section's
 * statuses and its current controls applied. The board filters are
 * single-select for difficulty and skill, so those carry over only when the
 * section has exactly one selected; the Featured scope always carries over.
 */
export function viewAllHref(
  spaceId: string,
  section: CommunitySection,
  values: BountyFilterValues,
  skills: string[],
  skillIds: Map<string, string>
): string {
  const singleDifficulty =
    values.difficulties.size === 1 ? ([...values.difficulties][0].toLowerCase() as DifficultyKey) : null;
  const selectedSkillNames = values.selectedSkills ?? new Set(skills);
  const singleSkillId =
    selectedSkillNames.size === 1 && selectedSkillNames.size !== skills.length
      ? (skillIds.get([...selectedSkillNames][0]) ?? null)
      : null;
  return buildBountiesHref(
    NavUtils.toSpaceBounties(spaceId),
    communitySectionFilters(section, {
      featuredOnly: values.scope === 'featured',
      difficulty: singleDifficulty,
      skillId: singleSkillId,
    })
  );
}

function BountiesSection({
  spaceId,
  section,
  title,
  emptyMessage,
  grid: Grid,
  cardHeightPx,
  cardWidthPx = CARD_WIDTH_PX,
  isInfinite = false,
}: {
  spaceId: string;
  section: CommunitySection;
  title: string;
  emptyMessage: string;
  grid: BountyGridComponent;
  cardHeightPx: number;
  cardWidthPx?: number;
  isInfinite?: boolean;
}) {
  const { bounties, skills, skillIds, isLoading, isError, refetch } = useSectionBounties(spaceId, section);
  const {
    filtered,
    filterKey,
    controls: filterControls,
    clearFilters,
    values,
  } = useBountyFilterState(bounties, skills);
  const viewAll = viewAllHref(spaceId, section, values, skills, skillIds);

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
            href={viewAll}
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
          {hasMore ? <div ref={sentinelRef} aria-hidden className="h-px w-full" /> : null}
        </>
      )}
    </section>
  );
}

type BountyStatusConfig = {
  title: string;
  grid: BountyGridComponent;
  cardHeightPx: number;
  cardWidthPx: number;
  emptyMessage: string;
  isInfinite?: boolean;
};

const BOUNTY_STATUS_CONFIG: Record<BountyStatusSlug, BountyStatusConfig> = {
  completed: {
    title: 'Completed bounties',
    grid: CompletedBountyGrid,
    cardHeightPx: COMPLETED_CARD_HEIGHT_PX,
    cardWidthPx: CARD_WIDTH_PX,
    emptyMessage: 'No completed bounties yet.',
  },
  'in-progress': {
    title: 'In progress bounties',
    grid: InProgressBountyGrid,
    cardHeightPx: IN_PROGRESS_CARD_HEIGHT_PX,
    cardWidthPx: CARD_WIDTH_PX,
    emptyMessage: 'No in progress bounties yet.',
  },
  available: {
    title: 'Available bounties',
    grid: AvailableBountyGrid,
    cardHeightPx: AVAILABLE_CARD_HEIGHT_PX,
    cardWidthPx: AVAILABLE_CARD_WIDTH_PX,
    emptyMessage: 'No available bounties yet.',
    isInfinite: true,
  },
};

export function BountiesStatusSection({ spaceId, status }: { spaceId: string; status: BountyStatusSlug }) {
  return <BountiesSection spaceId={spaceId} section={status} {...BOUNTY_STATUS_CONFIG[status]} />;
}
