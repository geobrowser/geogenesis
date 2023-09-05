'use client';

import * as React from 'react';

import { useAccount } from 'wagmi';

import { useAutocomplete } from '~/core/hooks/use-autocomplete';
import { useSpaces } from '~/core/hooks/use-spaces';
import { useMergeEntity } from '~/core/state/merge-entity-store';

import { ResultContent, ResultsList } from '~/design-system/autocomplete/results-list';
import { Input } from '~/design-system/input';
import { Text } from '~/design-system/text';

interface Props {
  entityId: string;
}

export function MergeEntityMenu({ entityId }: Props) {
  /*
  1. List possible entities:
    - Pulling in from useAutocomplete
      - Filter out the current entity
      - Filter entities user has access to?
  2. Show entity name + description
  3. Select entity to merge with -- copy the entityId (entityIdTo)
  4. Pass over the entityId that is the current selection from params (entityIdFrom)
  5. Open the merge entity modal and pass in the two entityIds
*/
  const { setIsMergeReviewOpen, setEntityIdOne, setEntityIdTwo } = useMergeEntity();

  const autocomplete = useAutocomplete();
  const { spaces } = useSpaces();
  const { address } = useAccount();

  // filter out the current entity -- see if this can move to the autocomplete filters field
  // see if it is reasonable to add a `not-entity-id` filter to the where clause filter
  // would we also want to potentially filter out entities that are in spaces where the user doesn't have editor permissions?
  const spacesUserIsEditor = spaces.filter(space => space.editors.includes(address ?? '')).map(space => space.id);
  const filteredResults = autocomplete.results.filter(
    result => result.id !== entityId && spacesUserIsEditor.includes(result.nameTripleSpace ?? '')
  );

  return (
    <div className="flex flex-col gap-2 bg-white">
      <div className="flex flex-col gap-2 px-2 py-2">
        <Text variant="smallButton">Search for an entity to merge with</Text>
        <Input onChange={e => autocomplete.onQueryChange(e.currentTarget.value)} value={autocomplete.query} />
      </div>
      <ResultsList>
        {autocomplete.results.length === 0 ? (
          <div className="flex flex-col gap-1 p-2 pt-0">
            <Text variant="footnoteMedium"> No entities found in spaces where you are an editor. .</Text>
            <Text variant="footnote">
              You will need to become an editor of the space for an entity you want to merge with. Consider revising
              your search term.
            </Text>
          </div>
        ) : null}
        {filteredResults.map(result => (
          <ResultContent
            onClick={() => {
              setEntityIdOne(entityId);
              setEntityIdTwo(result.id);
              setIsMergeReviewOpen(true);
            }}
            key={result.id}
            result={result}
            spaces={spaces}
          />
        ))}
      </ResultsList>
      <div className="flex flex-col max-h-[300px] overflow-y-auto justify-between w-full"></div>
    </div>
  );
}
