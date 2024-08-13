'use client';

import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';

import * as React from 'react';
import { useEffect, useRef } from 'react';

import { useSearch } from '~/core/hooks/use-search';

import { Dots } from '~/design-system/dots';
import { ResizableContainer } from '~/design-system/resizable-container';

import { ResultContent, ResultsList } from './results-list';

interface Props {
  placeholder?: string;
  onDone: (result: { id: string; name: string | null }) => void;
  itemIds: string[];
  className?: string;
}

export function EntitySearchAutocomplete({ placeholder, itemIds, onDone, className = '' }: Props) {
  const { query, onQueryChange, isLoading, results } = useSearch();
  const containerRef = useRef<HTMLDivElement>(null);
  const itemIdsSet = new Set(itemIds);

  useEffect(() => {
    const handleQueryChange = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onQueryChange('');
      }
    };

    document.addEventListener('click', handleQueryChange);
    return () => document.removeEventListener('click', handleQueryChange);
  }, [onQueryChange]);

  return (
    <div className="relative w-full">
      <input
        value={query}
        onChange={e => onQueryChange(e.target.value)}
        placeholder={placeholder}
        className={cx(
          'inline-flex w-48 items-center justify-between whitespace-nowrap rounded px-3 py-2 text-button shadow-inner-grey-02 placeholder:!text-text focus:outline-none',
          className
        )}
      />
      {query && (
        <div
          ref={containerRef}
          className="mt-4 max-h-[400px] w-[384px] flex-col rounded border border-grey-02 bg-white"
        >
          <ResizableContainer duration={0.125}>
            <ResultsList>
              {results.map((result, i) => (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.02 * i }}
                  key={result.id}
                >
                  <ResultContent
                    key={result.id}
                    onClick={() => {
                      onDone(result);
                      onQueryChange('');
                    }}
                    alreadySelected={itemIdsSet.has(result.id)}
                    result={result}
                  />
                </motion.div>
              ))}
            </ResultsList>
            <div className="flex items-center justify-center py-2 text-smallButton">
              <AnimatePresence mode="wait">
                {isLoading ? (
                  <motion.span
                    key="dots"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                  >
                    <Dots />
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>
          </ResizableContainer>
        </div>
      )}
    </div>
  );
}
