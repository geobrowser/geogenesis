'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { graphql } from '~/core/io/graphql-client';

import { isPersonId } from './person-records-document';
import { type PersonSpacesQuery, buildPersonSpacesDocument, readPersonSpaces } from './person-spaces-document';

const EMPTY_SPACES = new Map<string, string[]>();

/**
 * Which spaces each listed person belongs to, for the People tab's filter and row icons.
 *
 * One aliased batch for the whole visible list, the same arrangement `usePersonRecords` uses and
 * for the same reasons — keyed on everyone present rather than on the filtered list, so narrowing
 * the filter re-slices a batch already in hand instead of firing a request per keystroke.
 *
 * Returned as a map so a row asks with the id it already has, and an empty map while it loads. Rows
 * draw no icons until it lands, which is the right way round: an absent answer is not "this person
 * is in no spaces", and the filter treats it the same way — see `PeopleTab`.
 */
export function usePersonSpaces(personIds: string[]): Map<string, string[]> {
  // Deduplicated and sorted so the presence feed re-ordering the same people reuses the cached
  // batch rather than refetching an identical set under a different key. Unqueryable ids are
  // dropped here so `enabled` counts what will actually be asked for.
  const key = React.useMemo(() => [...new Set(personIds.filter(isPersonId))].sort(), [personIds]);

  const { data } = useQuery({
    queryKey: ['debates', 'person-spaces', key],
    enabled: key.length > 0,
    // The key is the whole list, so one person arriving makes it a different query. Without this
    // every row's icons blank out and return while the new batch lands — for memberships already
    // in hand that have not changed.
    placeholderData: keepPreviousData,
    // Presence flaps and every flap is a new key, but who belongs to which space does not move
    // second to second. Same reason `usePersonRecords` holds its batch.
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => {
      const { document, variables, ids } = buildPersonSpacesDocument(key);
      return Effect.runPromise(
        graphql({
          query: document,
          variables,
          signal,
          decoder: (response: PersonSpacesQuery) => readPersonSpaces(response, ids),
        })
      );
    },
  });

  return data ?? EMPTY_SPACES;
}
