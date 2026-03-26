'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';
import { useState } from 'react';

import { useKey } from '~/core/hooks/use-key';
import { useSearch } from '~/core/hooks/use-search';
import { ID } from '~/core/id';
import { useMutate } from '~/core/sync/use-mutate';
import { SwitchableRenderableType } from '~/core/types';

import { RenderableTypeDropdown } from '~/partials/entity-page/renderable-type-dropdown';
import { NativeGeoImage } from './geo-image';
import { Search } from './icons/search';
import { Tag } from './tag';
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
  onCreateEntity?: (result: {
    id: string;
    name: string | null;
    renderableType?: SwitchableRenderableType;
  }) => void | string;
  selected?: SelectEntityCompactResult[];
  onRemoveSelected?: (id: string) => void;
  relationValueTypes?: { id: string }[];
  placeholder?: string;
  renderableTypeValue?: SwitchableRenderableType;
  onRenderableTypeChange?: (value: SwitchableRenderableType) => void;
};

export function SelectEntityCompact({
  spaceId,
  onDone,
  onCreateEntity,
  selected = [],
  onRemoveSelected,
  relationValueTypes,
  placeholder = 'Search...',
  renderableTypeValue = 'TEXT',
  onRenderableTypeChange,
}: SelectEntityCompactProps) {
  const { storage } = useMutate();
  const filterByTypes = relationValueTypes?.length ? relationValueTypes.map(r => r.id) : undefined;
  const { query, onQueryChange, results, isLoading, isEmpty } = useSearch({
    filterByTypes,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [renderableType, setRenderableType] = useState<SwitchableRenderableType>(renderableTypeValue);
  const hasResults = query.trim() && results.length > 0;
  const canCreate = Boolean(onCreateEntity) && query.trim().length > 0;

  React.useEffect(() => {
    setRenderableType(renderableTypeValue);
  }, [renderableTypeValue]);

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

  const handleCreate = React.useCallback(() => {
    if (!onCreateEntity || query.trim().length === 0) return;
    let newEntityId = ID.createEntityId();
    newEntityId =
      onCreateEntity({
        id: newEntityId,
        name: query,
        renderableType,
      }) ?? newEntityId;
    storage.entities.name.set(newEntityId, spaceId, query);
    onDone({ id: newEntityId, name: query });
    onQueryChange('');
  }, [onCreateEntity, onDone, onQueryChange, query, renderableType, spaceId, storage.entities.name]);

  const handleRenderableTypeChange = React.useCallback(
    (value: SwitchableRenderableType | undefined) => {
      const next = value ?? 'TEXT';
      setRenderableType(next);
      onRenderableTypeChange?.(next);
    },
    [onRenderableTypeChange]
  );

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [query, results.length]);

  useKey('Escape', () => {
    onQueryChange('');
  });

  useKey('Enter', () => {
    if (!hasResults && canCreate) {
      handleCreate();
      return;
    }
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
            <div className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2">
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
              placeholder={placeholder}
              className="w-full rounded-md border border-grey-02 bg-white py-2 pr-3 pl-9 text-body text-text shadow-inner shadow-grey-02 outline-hidden placeholder:text-grey-03 focus:shadow-inner-lg focus:shadow-text"
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
                        <NativeGeoImage value={item.primarySpaceImage} alt="" className="h-full w-full object-cover" />
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
            {isLoading && <div className="px-3 py-2 text-resultTitle text-text">Loading...</div>}
            {!isLoading && isEmpty && <div className="px-3 py-2 text-resultTitle text-grey-04">No results.</div>}
            {!isLoading && !isEmpty && (
              <div className="divide-y divide-divider">
                {results.map((result, index) => (
                  <button
                    key={`${result.id}-${index}`}
                    type="button"
                    onClick={() => handleSelectResult(result)}
                    className={`flex w-full flex-col px-3 py-2 text-left transition-colors hover:bg-grey-01 focus:outline-hidden ${
                      index === selectedIndex ? 'bg-grey-01' : ''
                    }`}
                  >
                    <div className="max-w-full truncate text-resultTitle text-text">{result.name}</div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {(result.spaces ?? []).length > 0 && (
                        <div className="flex shrink-0 items-center gap-1">
                          <span className="inline-flex size-[12px] items-center justify-center overflow-hidden rounded-sm border border-grey-04">
                            <NativeGeoImage
                              value={result.spaces[0].image}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          </span>
                          <span className="text-[0.875rem] text-text">{result.spaces[0].name}</span>
                        </div>
                      )}
                      {(result.types ?? []).length > 0 && (
                        <>
                          {(result.spaces ?? []).length > 0 && (
                            <div className="shrink-0">
                              <svg
                                width="8"
                                height="9"
                                viewBox="0 0 8 9"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path d="M2.25 8L5.75 4.5L2.25 1" stroke="#606060" strokeLinecap="round" />
                              </svg>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            {(result.types ?? []).slice(0, 3).map((type, i) => (
                              <Tag key={`${type.id}-${i}`}>{type.name ?? type.id}</Tag>
                            ))}
                            {(result.types ?? []).length > 3 ? (
                              <Tag>{`+${(result.types ?? []).length - 3}`}</Tag>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {canCreate && (
            <div className="flex items-center justify-between border-t border-grey-02 py-[5px] pr-3 pl-[5px]">
              <RenderableTypeDropdown value={renderableType} onChange={handleRenderableTypeChange} />
              <button type="button" onClick={handleCreate} className="text-resultLink text-ctaHover">
                Create new
              </button>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
