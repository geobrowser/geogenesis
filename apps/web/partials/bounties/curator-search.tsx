'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { usePersonalSpacesByPageIds } from '~/core/hooks/use-personal-spaces-by-page-ids';
import { useSearch } from '~/core/hooks/use-search';
import { uuidToHex } from '~/core/id/normalize';

import { Text } from '~/design-system/text';

const PERSON_TYPES = [SystemIds.PERSON_TYPE];

export type CuratorMatch = {
  /** The curator's personal space — what an allocation points at. */
  spaceId: string;
  personId: string;
  name: string | null;
};

/**
 * People who front a personal space, matching the typed name. The graph has
 * no filter for spaces by their profile's name, so this searches Person
 * entities and keeps only those that are a personal space's page — anyone
 * else (a public figure, a mention) can't be allocated or paid, so is never
 * offered.
 */
export function filterToCurators(
  results: readonly { id: string; name: string | null }[],
  spaceByPerson: ReadonlyMap<string, string>
): CuratorMatch[] {
  const seen = new Set<string>();
  const matches: CuratorMatch[] = [];
  for (const result of results) {
    const personId = uuidToHex(result.id);
    const spaceId = spaceByPerson.get(personId);
    if (!spaceId || seen.has(spaceId)) continue;
    seen.add(spaceId);
    matches.push({ spaceId, personId, name: result.name });
  }
  return matches;
}

type Props = {
  placeholder: string;
  /** Allocation targets already on the bounty — personal spaces, or person ids from curator-app. */
  allocatedIds: ReadonlySet<string>;
  onSelect: (curator: CuratorMatch) => void;
};

export function CuratorSearch({ placeholder, allocatedIds, onSelect }: Props) {
  const { query, onQueryChange, results, isLoading } = useSearch({
    filterByTypes: PERSON_TYPES,
    restrictToFilterTypes: true,
    analyticsSurface: false,
  });
  const personIds = React.useMemo(() => results.map(r => r.id), [results]);
  const spaces = usePersonalSpacesByPageIds(personIds);
  const matches = React.useMemo(() => filterToCurators(results, spaces.data ?? new Map()), [results, spaces.data]);

  const searching = query.trim() !== '' && (isLoading || (personIds.length > 0 && spaces.isLoading));
  const isAllocated = (match: CuratorMatch) =>
    allocatedIds.has(uuidToHex(match.spaceId)) || allocatedIds.has(match.personId);

  return (
    <div className="relative flex flex-col gap-1" data-testid="curator-search">
      <input
        type="search"
        value={query}
        onChange={e => onQueryChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-md border border-grey-02 px-3 py-2 text-metadata"
      />
      {query.trim() !== '' ? (
        <div className="rounded-md border border-grey-02 bg-white">
          {searching ? (
            <Text variant="metadata" color="grey-04" className="block px-3 py-2">
              Searching…
            </Text>
          ) : matches.length === 0 ? (
            <Text variant="metadata" color="grey-04" className="block px-3 py-2">
              No one with a personal space matches “{query.trim()}”.
            </Text>
          ) : (
            <ul role="listbox" aria-label="Curators" className="flex max-h-60 flex-col overflow-y-auto">
              {matches.map(match => {
                const allocated = isAllocated(match);
                return (
                  <li key={match.spaceId}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      disabled={allocated}
                      onClick={() => {
                        onSelect(match);
                        onQueryChange('');
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-metadata hover:bg-grey-01 disabled:cursor-default disabled:text-grey-04 disabled:hover:bg-transparent"
                    >
                      <span className="truncate">{match.name ?? `${match.spaceId.slice(0, 6)}…`}</span>
                      {allocated ? <span className="shrink-0 text-footnote">Allocated</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
