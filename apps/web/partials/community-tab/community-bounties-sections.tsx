'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';

import type { SpaceBountiesResult, SpaceBounty } from '~/core/community/bounty-types';
import { useInterestedBountyIds, useInterestedInBounty } from '~/core/community/use-interested-in-bounty';
import {
  BOUNTY_DIFFICULTY_LEVELS,
  BOUNTY_TASK_STATUS_DONE_ENTITY_ID,
  BOUNTY_TASK_STATUS_IN_PROGRESS_ENTITY_ID,
  BOUNTY_TASK_STATUS_TODO_ENTITY_ID,
} from '~/core/constants';
import { useInfiniteScrollSentinel } from '~/core/hooks/use-infinite-scroll-sentinel';

import { Skeleton } from '~/design-system/skeleton';
import { SlideUp } from '~/design-system/slide-up';

import {
  AVAILABLE_CARD_HEIGHT_PX,
  AVAILABLE_CARD_WIDTH_PX,
  AvailableBountyCard,
  BountyCard,
  BountyCardActivateProvider,
  CARD_WIDTH_PX,
  COMPLETED_CARD_HEIGHT_PX,
  IN_PROGRESS_CARD_HEIGHT_PX,
  InProgressBountyCard,
} from './bounty-card';
import { type BountyScope, CheckboxFilter, ScopeFilter } from './bounty-filters';
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

  return React.useCallback(
    ({ bounty }: { bounty: SpaceBounty }) => (
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
    ),
    [canRegisterInterest, interestedIds, pendingBountyId, registerInterest]
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

function BountiesSection({
  spaceId,
  title,
  taskStatusId,
  emptyMessage,
  useCard,
  cardHeightPx,
  cardWidthPx = CARD_WIDTH_PX,
  isInfinite = false,
}: {
  spaceId: string;
  title: string;
  taskStatusId: string;
  emptyMessage: string;
  useCard: UseBountyCard;
  cardHeightPx: number;
  cardWidthPx?: number;
  isInfinite?: boolean;
}) {
  const [scope, setScope] = React.useState<BountyScope>('featured');
  const [difficulties, setDifficulties] = React.useState<Set<string>>(() => new Set(BOUNTY_DIFFICULTY_LEVELS));
  const [selectedSkills, setSelectedSkills] = React.useState<Set<string> | null>(null);
  const [isViewAllOpen, setIsViewAllOpen] = React.useState(false);

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
  const isLoading = !data;

  const skillSelection = selectedSkills ?? new Set(skills);

  const filtered = React.useMemo(
    () => applyFilters(bounties, scope, difficulties, skillSelection, skills),
    [bounties, scope, difficulties, skillSelection, skills]
  );

  const [visibleCount, setVisibleCount] = React.useState(INFINITE_PAGE_SIZE);

  const filterKey = `${scope}|${[...difficulties].sort().join(',')}|${
    selectedSkills ? [...selectedSkills].sort().join(',') : '*'
  }`;

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

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={SECTION_TITLE_CLASS}>{title}</h2>

        <div className="flex flex-wrap items-center gap-2">
          <ScopeFilter value={scope} onChange={setScope} />
          <CheckboxFilter
            allLabel="Any difficulty"
            options={[...BOUNTY_DIFFICULTY_LEVELS]}
            selected={difficulties}
            onChange={setDifficulties}
          />
          <CheckboxFilter
            allLabel="Any skill"
            options={skills}
            selected={skillSelection}
            onChange={setSelectedSkills}
          />
          {isInfinite ? null : (
            <button
              type="button"
              onClick={() => setIsViewAllOpen(true)}
              disabled={filtered.length === 0}
              className={cx(
                FILTER_PILL_CLASS,
                'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white'
              )}
            >
              View all
            </button>
          )}
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

      <SlideUp isOpen={!isInfinite && isViewAllOpen} setIsOpen={setIsViewAllOpen}>
        <div className="flex h-full flex-col overflow-hidden bg-white">
          <div className="flex items-center justify-between border-b border-grey-02 px-6 py-4">
            <h2 className={SECTION_TITLE_CLASS}>{title}</h2>
            <button
              type="button"
              onClick={() => setIsViewAllOpen(false)}
              className="text-[16px] leading-[20px] text-grey-04 hover:text-[#2A2B2E]"
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <BountyCardActivateProvider onActivate={() => setIsViewAllOpen(false)}>
              <BountyGrid bounties={filtered} card={card} />
            </BountyCardActivateProvider>
          </div>
        </div>
      </SlideUp>
    </section>
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
    />
  );
}
