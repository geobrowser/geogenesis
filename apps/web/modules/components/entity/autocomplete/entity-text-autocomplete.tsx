import * as React from 'react';
import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

import { ResizableContainer } from '~/modules/design-system/resizable-container';
import { Text } from '~/modules/design-system/text';
import { useAutocomplete } from '~/modules/search';
import { useSpaces } from '~/modules/spaces/use-spaces';
import { Entity } from '~/modules/types';
import { ResultContent, ResultsList } from './results-list';

interface Props {
  placeholder?: string;
  onDone: (result: Entity) => void;
  itemIds: string[];
  spaceId: string;
}

export function EntityTextAutocomplete({ placeholder, itemIds, onDone, spaceId }: Props) {
  const { query, results, onQueryChange } = useAutocomplete(spaceId);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemIdsSet = new Set(itemIds);
  const { spaces } = useSpaces();

  useEffect(() => {
    document.addEventListener('click', e => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onQueryChange('');
      }
    });
  }, [onQueryChange]);

  // TODO: Implement keyboard navigation

  return (
    <div className="relative w-full">
      <input
        value={query}
        onChange={e => onQueryChange(e.target.value)}
        placeholder={placeholder}
        className="m-0 h-full w-full bg-transparent p-0 text-body placeholder:text-grey-02 focus:outline-none"
      />
      {query && (
        <div
          ref={containerRef}
          className="absolute top-[36px] z-[1] flex max-h-[340px] w-[384px] flex-col overflow-hidden rounded bg-white shadow-inner-grey-02"
        >
          <p className="p-2.5">
            <Text variant="smallButton">Add a relation</Text>
          </p>
          <ResizableContainer duration={0.125}>
            <ResultsList>
              {results.map((result, i) => (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.02 * i }}
                  key={result.id}
                  onSelect={() => onDone(result)}
                >
                  <ResultContent
                    key={result.id}
                    onClick={() => {
                      if (!itemIdsSet.has(result.id)) onDone(result);
                    }}
                    spaces={spaces}
                    alreadySelected={itemIdsSet.has(result.id)}
                    result={result}
                  />
                </motion.div>
              ))}
            </ResultsList>
          </ResizableContainer>
        </div>
      )}
    </div>
  );
}
