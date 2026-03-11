'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';
import { useState } from 'react';

import { useKey } from '~/core/hooks/use-key';
import { useSearch } from '~/core/hooks/use-search';

import { NativeGeoImage } from './geo-image';
import { Search } from './icons/search';
import { Text } from './text';

export type SelectEntityCompactResult = {
  id: string;
  name: string | null;
  primarySpace?: string;
  primarySpaceImage?: string;
  primarySpaceName?: string | null;
};

type SelectEntityCompactProps = {
  spaceId: string;
  onDone: (result: SelectEntityCompactResult) => void;
  selected?: SelectEntityCompactResult[];
  onRemoveSelected?: (id: string) => void;
};

export function SelectEntityCompact({
  spaceId,
  onDone,
  selected = [],
  onRemoveSelected,
}: SelectEntityCompactProps) {
  const { query, onQueryChange, results, isLoading, isEmpty } = useSearch();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const hasResults = query.trim() && results.length > 0;

  const handleSelectResult = React.useCallback(
    (result: (typeof results)[number]) => {
      const space = result.spaces?.[0];
      onDone({
        id: result.id,
        name: result.name,
        primarySpace: space?.spaceId,
        primarySpaceImage: space?.image,
        primarySpaceName: space?.name,
      });
      onQueryChange('');
    },
    [onDone, onQueryChange]
  );

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [query, results.length]);

  useKey('Escape', () => {
    onQueryChange('');
  });

  useKey('Enter', () => {
    if (!hasResults) return;
    const result = results[selectedIndex];
    if (result) handleSelectResult(result);
  });

  useKey('ArrowUp', e => {
    if (!hasResults) return;
    e.preventDefault();
    setSelectedIndex(i => (i - 1 + results.length) % results.length);
  });

  useKey('ArrowDown', e => {
    if (!hasResults) return;
    e.preventDefault();
    setSelectedIndex(i => (i + 1) % results.length);
  });

  return (
    <Popover.Root open={query.trim().length > 0}>
      <Popover.Anchor asChild>
        <div className="w-full space-y-2">
          <div className="relative w-full">
            <div className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2">
              <Search />
            </div>
            <input
              type="text"
              value={query}
              onChange={e => {
                onQueryChange(e.target.value);
                setSelectedIndex(0);
              }}
              aria-label="Search"
              className="w-full rounded-md border border-grey-02 bg-white py-2 pl-9 pr-3 text-body text-text shadow-inner shadow-grey-02 outline-hidden placeholder:text-grey-03 focus:shadow-inner-lg focus:shadow-text"
            />
          </div>
          {selected.length > 0 && (
            <>
              <div>
                <Text variant="body" color="grey-04" className="text-[14px] font-medium">
                  New attributes
                </Text>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selected.map((item, idx) => (
                  <span
                    key={`${item.id}-${item.primarySpace ?? ''}-${idx}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-grey-02 bg-white px-2 py-1 text-[0.8125rem] text-text"
                  >
                    {item.primarySpaceImage != null && (
                      <span className="inline-flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-grey-04">
                        <NativeGeoImage
                          value={item.primarySpaceImage}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </span>
                    )}
                    <span className="max-w-[120px] truncate">{item.name ?? item.id}</span>
                    {onRemoveSelected && (
                      <button
                        type="button"
                        onClick={() => onRemoveSelected(item.id)}
                        className="shrink-0 rounded p-0.5 hover:bg-grey-02"
                        aria-label={`Remove ${item.name ?? item.id}`}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          sideOffset={4}
          align="start"
          className="z-1001 w-(--radix-popper-anchor-width) overflow-hidden rounded-md border border-grey-02 bg-white shadow-lg"
          collisionPadding={10}
          avoidCollisions
          onOpenAutoFocus={e => e.preventDefault()}
        >
          <div className="max-h-[min(50vh,300px)] overflow-y-auto">
            {isLoading && (
              <div className="px-3 py-2 text-resultTitle text-text">Loading...</div>
            )}
            {!isLoading && isEmpty && (
              <div className="px-3 py-2 text-resultTitle text-grey-04">No results.</div>
            )}
            {!isLoading && !isEmpty && (
              <div className="divide-y divide-divider">
                {results.map((result, index) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => handleSelectResult(result)}
                    className={`flex w-full flex-col px-3 py-2 text-left transition-colors hover:bg-grey-01 focus:outline-hidden ${
                      index === selectedIndex ? 'bg-grey-01' : ''
                    }`}
                  >
                    <div className="max-w-full truncate text-resultTitle text-text">
                      {result.name}
                    </div>
                    {(result.spaces ?? []).length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1">
                        <span className="inline-flex size-[12px] shrink-0 items-center justify-center overflow-hidden rounded-sm border border-grey-04">
                          <NativeGeoImage
                            value={result.spaces[0].image}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </span>
                        <span className="text-[0.875rem] text-text">
                          {result.spaces[0].name}
                        </span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
