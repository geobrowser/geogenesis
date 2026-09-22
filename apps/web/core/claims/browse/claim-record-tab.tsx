'use client';

import * as React from 'react';

import type { HubFilterOption } from '~/core/debates/matchmaking/hub-filter-menu';
import { keepSelectableTopics, orderFacetOptions } from '~/core/debates/matchmaking/topic-facets';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { normId } from '~/core/utils/norm-id';

import { PersonRecordFeed } from '~/partials/profile/person-record-feed';
import { RecordFilterRow } from '~/partials/profile/record-filter-row';
import { useRecordSelection } from '~/partials/profile/use-record-selection';

import type { ClaimRecordSort } from './claim-record-query';
import { useClaimRecord } from './use-claim-record';
import { useClaimRecordFacets } from './use-claim-record-facets';

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
  return (
    <ClaimRecordTabContent
      key={`${kind}:${normId(claimId)}:${normId(spaceId)}`}
      kind={kind}
      claimId={claimId}
      spaceId={spaceId}
      availableSpaceIds={availableSpaceIds}
      sourceTopics={sourceTopics}
    />
  );
}

function ClaimRecordTabContent({
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
  const facets = useClaimRecordFacets({
    kind,
    claimId,
    allSpaceIds,
    selectedSpaceIds,
    sourceTopicIds,
    selectedTopicIds: kind === 'claims' ? topics.values : [],
  });

  const facetSpaces = kind === 'claims' ? facets.claimSpaces : facets.debateSpaces;
  const countsBySpace = React.useMemo(
    () => new Map(facetSpaces.map(facet => [normId(facet.id), facet.count])),
    [facetSpaces]
  );

  const { labelsById, isLoading: spaceLabelsLoading } = useSpaceLabels(allSpaceIds);
  const spaceOptions = React.useMemo(
    () =>
      allSpaceIds
        .map(id => ({
          value: id,
          label: spaceLabel(labelsById, id)?.name ?? `Space ${id.slice(0, 6)}`,
          pending: spaceLabelsLoading && !spaceLabel(labelsById, id),
          count: countsBySpace.get(normId(id)),
        }))
        // Keep every option while the facet is arriving, then only spaces that lead somewhere —
        // plus a selected zero, which has to stay visible so it can be un-picked.
        .filter(option =>
          facets.facetsSettled
            ? (option.count ?? 0) > 0 || spaces.values.some(id => normId(id) === normId(option.value))
            : true
        )
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.value.localeCompare(b.value)),
    [allSpaceIds, countsBySpace, facets.facetsSettled, labelsById, spaceLabelsLoading, spaces.values]
  );
  const topicOptions = React.useMemo(
    () =>
      orderFacetOptions(facets.claimTopics, topics.values).map(topic => ({
        value: topic.id,
        label: topic.name?.trim() || 'Topic',
        count: topic.count,
        ...(facets.topicNamesPending && !topic.name ? { pending: true } : {}),
      })),
    [facets.claimTopics, facets.topicNamesPending, topics.values]
  );

  const replaceTopics = topics.replace;
  React.useEffect(() => {
    if (kind !== 'claims' || !facets.facetsSettled) return;
    replaceTopics(current => keepSelectableTopics(current, facets.claimTopics, true));
  }, [facets.claimTopics, facets.facetsSettled, kind, replaceTopics]);

  const dimensions = [
    {
      key: 'spaces',
      options: spaceOptions,
      values: spaces.values,
      onToggle: spaces.toggle,
      onClear: spaces.clear,
      anyLabel: 'Any space',
      noun: ['space', 'spaces'] as const,
      isPending: facets.countsPending,
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
            isPending: facets.countsPending,
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
              : 'No debates on this claim yet.'
        }
        errorLabel={isClaims ? 'Couldn’t load claims.' : 'Couldn’t load debates.'}
        noun={isClaims ? 'claims' : 'debates'}
      />
    </div>
  );
}
