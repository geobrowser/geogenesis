'use client';

import * as React from 'react';

import cx from 'classnames';

import { type PersonClaimEntry, personTopics, usePersonClaims } from '~/core/debates/use-person-claims';
import { equals as idEquals } from '~/core/id/normalize';
import { responsePositionLabel } from '~/core/responses/entity-response';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { ALL_FILTER, PersonDebateFilters } from './person-debate-filters';

/**
 * Every claim the person holds a position on, with the Space and Topic filters that narrow it.
 */
export function PersonClaimsCollection({ personId }: { personId: string }) {
  const { entries, claimByHex, topicsByClaimHex, isLoading } = usePersonClaims(personId);

  const [selectedSpace, setSelectedSpace] = React.useState(ALL_FILTER);
  const [selectedTopic, setSelectedTopic] = React.useState(ALL_FILTER);

  // The spaces the person's claims live in — the filter is claim-scoped, so its options are too.
  const spaceIds = React.useMemo(() => [...new Set(entries.flatMap(entry => entry.spaceIds))], [entries]);
  const topics = React.useMemo(() => personTopics(topicsByClaimHex), [topicsByClaimHex]);

  const visible = React.useMemo(
    () =>
      entries.filter(entry => {
        if (selectedSpace !== ALL_FILTER && !entry.spaceIds.some(spaceId => idEquals(spaceId, selectedSpace))) {
          return false;
        }
        if (selectedTopic !== ALL_FILTER) {
          const claimTopics = topicsByClaimHex.get(entry.claimHex) ?? [];
          if (!claimTopics.some(topic => idEquals(topic.id, selectedTopic))) return false;
        }
        return true;
      }),
    [entries, topicsByClaimHex, selectedSpace, selectedTopic]
  );

  if (isLoading && entries.length === 0) return <Skeleton className="h-[120px] w-full rounded-lg" />;
  if (entries.length === 0) return null;

  return (
    <section aria-label="Claims">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Text as="h2" variant="mediumTitle" color="text">
          Claims
        </Text>
        <PersonDebateFilters
          spaceIds={spaceIds}
          topics={topics}
          selectedSpace={selectedSpace}
          selectedTopic={selectedTopic}
          onSelectSpace={setSelectedSpace}
          onSelectTopic={setSelectedTopic}
        />
      </div>

      {visible.length === 0 ? (
        <Text as="p" variant="metadata" color="grey-04">
          No claims match these filters.
        </Text>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {visible.map(entry => (
            <li key={entry.claimHex}>
              <ClaimPositionRow entry={entry} name={claimByHex.get(entry.claimHex)?.name ?? 'Claim'} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ClaimPositionRow({ entry, name }: { entry: PersonClaimEntry; name: string }) {
  // One chip per distinct side taken on this claim — usually one; two only when the person answered
  // both the stance and veracity axis.
  const chips = React.useMemo(() => {
    const seen = new Map<string, { responseKind: 'stance' | 'veracity'; position: boolean }>();
    for (const position of entry.positions) {
      seen.set(`${position.responseKind}:${String(position.position)}`, {
        responseKind: position.responseKind,
        position: position.position,
      });
    }
    return [...seen.values()];
  }, [entry.positions]);

  return (
    <Link
      href={NavUtils.toEntity(entry.positions[0].spaceId, entry.claimId)}
      className="flex items-center justify-between gap-3 rounded-lg border border-grey-02 bg-white p-3 transition-colors hover:border-grey-03"
    >
      <Text as="span" variant="metadataMedium" color="text" className="min-w-0 flex-1 truncate">
        {name}
      </Text>
      <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        {chips.map(chip => (
          <span
            key={`${chip.responseKind}:${String(chip.position)}`}
            className={cx(
              'rounded-xs px-1 py-px text-[0.6875rem] font-medium',
              chip.position ? 'bg-successTertiary text-text' : 'bg-errorTertiary text-text'
            )}
          >
            {responsePositionLabel(chip.responseKind, chip.position)}
          </span>
        ))}
      </span>
    </Link>
  );
}
