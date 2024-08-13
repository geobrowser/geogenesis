'use client';

import * as React from 'react';

import { useSearch } from '~/core/hooks/use-search';
import { useMergeEntity } from '~/core/state/merge-entity-store';

import { ResultContent, ResultsList } from '~/design-system/autocomplete/results-list';
import { Input } from '~/design-system/input';
import { Text } from '~/design-system/text';

interface Props {
  entityId: string;
}

export function MergeEntityMenu({ entityId }: Props) {
  const { setIsMergeReviewOpen, setEntityIdOne, setEntityIdTwo } = useMergeEntity();
  const autocomplete = useSearch();

  const filteredResults = autocomplete.results.filter(result => result.id !== entityId);

  return (
    <div className="flex flex-col gap-2 bg-white">
      <div className="flex flex-col gap-2 px-2 py-2">
        <Text variant="smallButton">Search for an entity to merge with</Text>
        <Input onChange={e => autocomplete.onQueryChange(e.currentTarget.value)} value={autocomplete.query} />
      </div>
      {filteredResults.length > 0 && (
        <ResultsList>
          {filteredResults.map(result => (
            <ResultContent
              onClick={() => {
                setEntityIdOne(entityId);
                setEntityIdTwo(result.id);
                setIsMergeReviewOpen(true);
              }}
              key={result.id}
              result={result}
            />
          ))}
        </ResultsList>
      )}
    </div>
  );
}
