'use client';

import * as Popover from '@radix-ui/react-popover';
import pluralize from 'pluralize';

import * as React from 'react';
import { startTransition, useState } from 'react';

import { ROOT_SPACE } from '~/core/constants';
import { useSearch } from '~/core/hooks/use-search';
import { SearchResult } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { NativeGeoImage } from '~/design-system/geo-image';
import { NewTab } from '~/design-system/icons/new-tab';
import { Tag } from '~/design-system/tag';

import { ResizableContainer } from './resizable-container';
import { Spacer } from './spacer';
import { Truncate } from './truncate';

type FindEntityProps = {
  onDone: (result: { id: string; name: string | null }) => void;
  onCreateEntity: (result: { id: string; name: string | null }) => void;
  allowedTypes?: string[];
  placeholder?: string;
};

export const FindEntity = ({
  onDone,
  onCreateEntity,
  allowedTypes,
  placeholder = 'Find entity...',
}: FindEntityProps) => {
  const [hasDismissedPopover, setHasDismissedPopover] = useState<boolean>(false);
  const [result, setResult] = useState<SearchResult | null>(null);

  const { query, onQueryChange, isLoading, isEmpty, results } = useSearch({
    filterByTypes: allowedTypes,
  });

  if (query === '' && result !== null) {
    startTransition(() => {
      setResult(null);
    });
  }

  const [hasStoppedTyping, setHasStoppedTyping] = useState<boolean>(false);

  React.useEffect(() => {
    setHasStoppedTyping(false);
    const timeoutId = setTimeout(() => {
      setHasStoppedTyping(true);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [query]);

  const showPopover = hasStoppedTyping && results.length > 0 && !hasDismissedPopover;

  return (
    <div className="relative">
      <Popover.Root open={!!query} onOpenChange={() => {}}>
        <Popover.Anchor asChild>
          <input
            value={query}
            onChange={event => {
              onQueryChange(event.target.value);
              onCreateEntity({ id: '', name: event.target.value });
              setHasDismissedPopover(false);
            }}
            placeholder={placeholder}
            className="block w-full px-2 py-1 text-center text-2xl text-mediumTitle placeholder:text-grey-02 focus:outline-none"
            spellCheck={false}
          />
        </Popover.Anchor>
        {showPopover && (
          <Popover.Portal forceMount>
            <Popover.Content
              onOpenAutoFocus={event => {
                event.preventDefault();
                event.stopPropagation();
              }}
              className="z-[9999] w-[var(--radix-popper-anchor-width)] pt-2"
              forceMount
            >
              <div className="rounded-lg border border-grey-02 bg-white">
                <div className="px-4 py-3 text-center">
                  <div className="text-metadataMedium text-text">Existing entities found</div>
                  <div className="mt-1 text-breadcrumb font-normal leading-tight text-text">
                    Someone has created these entities. Select one if it matches - your space will use the same entity
                    ID.
                  </div>
                </div>
                <ResizableContainer>
                  <div className="flex max-h-[210px] flex-col overflow-y-auto overflow-x-clip border-t border-grey-02 bg-white">
                    {!results?.length && isLoading && (
                      <div className="w-full border-b border-divider bg-white px-3 py-2">
                        <div className="truncate text-button text-text">Loading...</div>
                      </div>
                    )}
                    {isEmpty ? (
                      <div className="w-full border-b border-divider bg-white px-3 py-2">
                        <div className="truncate text-button text-text">No results.</div>
                      </div>
                    ) : (
                      <div className="divider-y-divider bg-white">
                        {results.map((result, index) => (
                          <div key={index} className="w-full">
                            <div className="p-1">
                              <button
                                onClick={() => {
                                  onDone({
                                    id: result.id,
                                    name: result.name,
                                  });
                                  onQueryChange('');
                                  setHasDismissedPopover(true);
                                }}
                                className="relative z-10 flex w-full flex-col rounded-md px-2 py-1 transition-colors duration-150 hover:bg-grey-01 focus:bg-grey-01 focus:outline-none"
                              >
                                <div className="relative w-full">
                                  <div className="relative z-0 max-w-full truncate text-button text-text">
                                    {result.name}
                                  </div>
                                  <div className="absolute bottom-0 right-0 top-0 flex items-center">
                                    <button
                                      onClick={event => {
                                        event.stopPropagation();
                                        window.open(NavUtils.toEntity(ROOT_SPACE, result.id));
                                      }}
                                      className="relative text-text hover:text-ctaPrimary"
                                    >
                                      <NewTab />
                                      <div className="absolute -inset-4" />
                                    </button>
                                  </div>
                                </div>
                                {result.types.length > 0 && (
                                  <>
                                    <Spacer height={4} />
                                    <div className="flex items-center gap-1.5">
                                      {result.types.map(type => (
                                        <Tag key={type.id}>{type.name}</Tag>
                                      ))}
                                    </div>
                                  </>
                                )}
                                {result.description && (
                                  <>
                                    <Spacer height={4} />
                                    <Truncate maxLines={3} shouldTruncate variant="footnote">
                                      <p className="text-footnote text-grey-04">{result.description}</p>
                                    </Truncate>
                                  </>
                                )}

                                <div className="mt-1 inline-flex items-center gap-1 text-footnoteMedium text-grey-04">
                                  <div className="inline-flex gap-0">
                                    {(result.spaces ?? []).slice(0, 3).map(space => (
                                      <div
                                        key={space.spaceId}
                                        className="-ml-[4px] h-[14px] w-[14px] overflow-clip rounded-sm border border-white first:ml-0"
                                      >
                                        <NativeGeoImage
                                          value={space.image}
                                          alt=""
                                          className="h-full w-full object-cover"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                  {(result.spaces ?? []).length} {pluralize('space', (result.spaces ?? []).length)}
                                </div>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </ResizableContainer>
                <div className="border-t border-grey-02 p-1">
                  <button
                    onClick={() => {
                      onCreateEntity({ id: '', name: query });
                      setHasDismissedPopover(true);
                    }}
                    className="block w-full rounded-md px-2 py-1 transition-colors duration-150 hover:bg-grey-01 focus:bg-grey-01 focus:outline-none"
                  >
                    <div className="text-metadataMedium text-text">Don’t use an existing entity</div>
                  </button>
                </div>
              </div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </Popover.Root>
    </div>
  );
};
