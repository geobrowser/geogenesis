'use client';

import * as React from 'react';

import type { HubFilterOption } from '~/core/debates/matchmaking/hub-filter-menu';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { normId } from '~/core/utils/norm-id';

import { PersonRecordFeed } from '~/partials/profile/person-record-feed';
import { RecordFilterRow } from '~/partials/profile/record-filter-row';
import { useRecordSelection } from '~/partials/profile/use-record-selection';

import type { ClaimRecordSort } from './claim-record-query';
import { useClaimRecord } from './use-claim-record';

const SORT_OPTIONS: HubFilterOption<string>[] = [
  { value: 'best', label: 'Best' },
  { value: 'top', label: 'Top' },
  { value: 'new', label: 'New' },
];

type ClaimRecordTabProps = {
  kind: 'claims' | 'debates';
  claimId: string;
  /** The space whose claim page the reader opened; it is the initial Spaces selection. */
  spaceId: string;
  /** Every space carrying this claim, and therefore meaningful as a record scope. */
  availableSpaceIds: string[];
  /** The claim topics that define Related claims and can further narrow that union. */
  sourceTopics: Array<{ id: string; name: string | null }>;
};

/**
 * Controlled record feed shared by the claim page's Related claims and Debates tabs.
 *
 * It deliberately reuses the personal-space control row and selection hooks. The only contextual
 * difference is the initial space: a claim page opens scoped to the space in its URL, while
 * clearing Spaces broadens the tab to every space carrying that same claim.
 */
export function ClaimRecordTab({
  kind,
  claimId,
  spaceId,
  availableSpaceIds,
  sourceTopics,
}: ClaimRecordTabProps) {
  const [sort, setSort] = React.useState<ClaimRecordSort>('best');
  const spaces = useRecordSelection([spaceId]);
  const topics = useRecordSelection();

  const allSpaceIds = React.useMemo(
    () => [...new Map([spaceId, ...availableSpaceIds].map(id => [normId(id), id])).values()],
    [availableSpaceIds, spaceId]
  );
  // No selection is the menu's “Any space”: every space that carries this claim. Starting with the
  // URL space selected preserves the existing space-scoped result until the reader broadens it.
  const selectedSpaceIds = spaces.values.length > 0 ? spaces.values : allSpaceIds;
  const sourceTopicIds = React.useMemo(() => sourceTopics.map(topic => topic.id), [sourceTopics]);

  const record = useClaimRecord({
    claimId,
    spaceId,
    topicIds: sourceTopicIds,
    spaceIds: selectedSpaceIds,
    filterTopicIds: kind === 'claims' ? topics.values : [],
    claimSort: kind === 'claims' ? sort : 'best',
    debateSort: kind === 'debates' ? sort : 'best',
    claimsEnabled: kind === 'claims',
    debatesEnabled: kind === 'debates',
    countsEnabled: false,
  });

  const { labelsById, isLoading: spaceLabelsLoading } = useSpaceLabels(allSpaceIds);
  const spaceOptions = React.useMemo(
    () =>
      allSpaceIds.map(id => ({
        value: id,
        label: spaceLabel(labelsById, id)?.name ?? `Space ${id.slice(0, 6)}`,
        pending: spaceLabelsLoading && !spaceLabel(labelsById, id),
      })),
    [allSpaceIds, labelsById, spaceLabelsLoading]
  );
  const topicOptions = React.useMemo(
    () =>
      sourceTopics.map(topic => ({
        value: topic.id,
        label: topic.name?.trim() || 'Unnamed topic',
      })),
    [sourceTopics]
  );

  const dimensions = [
    {
      key: 'spaces',
      options: spaceOptions,
      values: spaces.values,
      onToggle: spaces.toggle,
      onClear: spaces.clear,
      anyLabel: 'Any space',
      noun: ['space', 'spaces'] as const,
    },
    ...(kind === 'claims'
      ? [
          {
            key: 'topics',
            options: topicOptions,
            values: topics.values,
            onToggle: topics.toggle,
            onClear: topics.clear,
            anyLabel: 'Any topic',
            noun: ['topic', 'topics'] as const,
          },
        ]
      : []),
  ];

  const isFiltered = spaces.values.length !== 1 || !spaces.values.includes(spaceId) || topics.values.length > 0;
  const isClaims = kind === 'claims';

  return (
    <div className="flex flex-col gap-4">
      <RecordFilterRow
        sort={{ value: sort, options: SORT_OPTIONS, onChange: value => setSort(value as ClaimRecordSort) }}
        dimensions={dimensions}
      />

      <PersonRecordFeed
        rows={isClaims ? record.claimRows : record.debateRows}
        isLoading={isClaims ? record.claimsLoading : record.debatesLoading}
        isError={isClaims ? record.claimsError : record.debatesError}
        isFetchingNextPage={isClaims ? record.claimsFetchingNextPage : record.debatesFetchingNextPage}
        hasNextPage={isClaims ? record.claimsHasNextPage : record.debatesHasNextPage}
        fetchNextPage={isClaims ? record.fetchNextClaimsPage : record.fetchNextDebatesPage}
        loadingLabel={isClaims ? 'Loading claims…' : 'Loading debates…'}
        emptyLabel={
          isFiltered
            ? `No ${isClaims ? 'claims' : 'debates'} match these filters.`
            : isClaims
              ? 'No related debate claims yet.'
              : 'No debates on this claim or its related claims yet.'
        }
        errorLabel={isClaims ? 'Couldn’t load claims.' : 'Couldn’t load debates.'}
        noun={isClaims ? 'claims' : 'debates'}
      />
    </div>
  );
}
