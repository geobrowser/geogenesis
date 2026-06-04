'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';
import pluralize from 'pluralize';

import { useFetchNextPageOnScroll } from '~/core/hooks/use-fetch-next-page-on-scroll';
import { useKey } from '~/core/hooks/use-key';
import { searchResultMatchesAllowedTypes, useSearch } from '~/core/hooks/use-search';
import { ID } from '~/core/id';
import type { Property, SearchResult, SpaceEntity } from '~/core/types';

import { NativeGeoImage } from '~/design-system/geo-image';
import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { Check } from '~/design-system/icons/check';
import { InfoSmall } from '~/design-system/icons/info-small';
import { Search } from '~/design-system/icons/search';
import { ResizableContainer } from '~/design-system/resizable-container';
import { Tag } from '~/design-system/tag';
import { TextButton } from '~/design-system/text-button';
import { Tooltip } from '~/design-system/tooltip';
import { trapWheelToElement } from '~/design-system/trap-wheel-scroll';
import { Truncate } from '~/design-system/truncate';
import { useAdaptiveDropdownPlacement } from '~/design-system/use-adaptive-dropdown-placement';

export type QuerySetupTypePick = {
  id: string;
  name: string | null;
  spaceId?: string;
  spaceName?: string | null;
};

function spaceLabelForResult(result: SearchResult, space: SpaceEntity): string | null {
  if (space.spaceId != null && result.namesBySpace?.[space.spaceId] != null) {
    return result.namesBySpace[space.spaceId];
  }
  return space.name ?? null;
}

function primarySpaceFields(result: SearchResult): Pick<QuerySetupTypePick, 'spaceId' | 'spaceName'> {
  const top = result.spaces?.[0];
  if (!top?.spaceId) return {};
  return { spaceId: top.spaceId, spaceName: spaceLabelForResult(result, top) };
}

const floatingShellClass =
  'relative w-[400px] max-w-[min(400px,calc(100vw-24px))] rounded-md border border-grey-02 bg-white shadow-lg';

const floatingInputClass =
  'm-0 block w-full resize-none bg-transparent p-2 pl-9 text-body placeholder:text-grey-03 focus:outline-hidden focus:placeholder:text-grey-03';

type QuerySetupTypesSelectEntityPopoverProps = {
  trigger: React.ReactNode;
  spaceId: string;
  selectedTypes: QuerySetupTypePick[];
  onChangeSelectedTypes: (next: QuerySetupTypePick[]) => void;
  allowedTargetTypes: Property['relationValueTypes'] | undefined;
  disabled?: boolean;
};

export function QuerySetupTypesSelectEntityPopover({
  trigger,
  spaceId,
  selectedTypes,
  onChangeSelectedTypes,
  allowedTargetTypes,
  disabled,
}: QuerySetupTypesSelectEntityPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<QuerySetupTypePick[]>([]);
  const [baseline, setBaseline] = React.useState<QuerySetupTypePick[]>([]);
  const [pendingSpacePick, setPendingSpacePick] = React.useState<SearchResult | null>(null);

  const draftRef = React.useRef(draft);
  draftRef.current = draft;

  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const { query, onQueryChange, isLoading, results, hasNextPage, fetchNextPage, isFetching, isFetchingNextPage } =
    useSearch({
      filterByTypes: [SystemIds.SCHEMA_TYPE],
      filterBySpace: spaceId,
      enabled: open,
    });

  const resultsScrollRef = React.useRef<HTMLDivElement | null>(null);
  const handleResultsScroll = useFetchNextPageOnScroll<HTMLDivElement>({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    scrollRef: resultsScrollRef,
  });

  const allowedTypeIds = React.useMemo(() => allowedTargetTypes?.map(t => t.id), [allowedTargetTypes]);

  const isResultPickable = React.useCallback(
    (result: SearchResult) => {
      if (!allowedTargetTypes?.length) return false;
      if (allowedTargetTypes.some(t => ID.equals(t.id, result.id))) return true;
      if (allowedTypeIds?.length && searchResultMatchesAllowedTypes(result, allowedTypeIds)) return true;
      return searchResultMatchesAllowedTypes(result, [SystemIds.SCHEMA_TYPE]);
    },
    [allowedTargetTypes, allowedTypeIds]
  );

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (next) {
        const seed = [...selectedTypes];
        setDraft(seed);
        setBaseline(seed);
        setPendingSpacePick(null);
      } else {
        onQueryChange('');
        setPendingSpacePick(null);
      }
      setOpen(next);
    },
    [onQueryChange, selectedTypes]
  );

  const handleEscape = React.useCallback(() => {
    if (!open) return;
    if (pendingSpacePick) {
      setPendingSpacePick(null);
      return;
    }
    handleOpenChange(false);
  }, [open, pendingSpacePick, handleOpenChange]);

  useKey('Escape', handleEscape);

  const toggleDraftType = React.useCallback(
    (result: SearchResult) => {
      if (!isResultPickable(result)) return;
      const id = result.id;
      const name = result.name;
      const prev = draftRef.current;
      const exists = prev.some(p => ID.equals(p.id, id));
      if (exists) {
        setDraft(prev => prev.filter(p => !ID.equals(p.id, id)));
        return;
      }
      setDraft(prev => [...prev, { id, name, ...primarySpaceFields(result) }]);
    },
    [isResultPickable]
  );

  const commitDraftWithSpace = React.useCallback(
    (result: SearchResult, space: SpaceEntity) => {
      if (!isResultPickable(result)) return;
      const id = result.id;
      const name = result.name;
      const spaceName = spaceLabelForResult(result, space);
      const spaceId = space.spaceId ?? space.id;
      setDraft(prev => {
        const without = prev.filter(p => !ID.equals(p.id, id));
        return [...without, { id, name, spaceId, spaceName }];
      });
      setPendingSpacePick(null);
    },
    [isResultPickable]
  );

  const clearDraft = React.useCallback(() => setDraft([]), []);

  const doneDisabled = draft.length === 0 && baseline.length === 0;

  const commit = React.useCallback(() => {
    if (doneDisabled) return;
    onChangeSelectedTypes(draft);
    onQueryChange('');
    setOpen(false);
  }, [doneDisabled, draft, onChangeSelectedTypes, onQueryChange]);

  const showClearAll = draft.length > 0;

  const showPopoverHeader = draft.length > 0 || baseline.length > 0 || pendingSpacePick != null;

  const { align: popoverAlign, side: popoverSide } = useAdaptiveDropdownPlacement(inputRef, {
    isOpen: open,
    preferredHeight: 300,
    gap: 12,
    recomputeDeps: [showPopoverHeader, draft.length, baseline.length, pendingSpacePick],
  });

  const headerAtBottomOfShell = showPopoverHeader && popoverSide === 'top';

  const headerRow = (edge: 'card-top' | 'card-bottom') => (
    <div
      className={cx(
        'flex items-center justify-between gap-2 px-3 py-2',
        edge === 'card-top' ? 'border-b border-grey-02' : 'border-t border-grey-02'
      )}
    >
      <span className="text-resultTitle text-text">Select types</span>
      <div className="flex shrink-0 items-center gap-2">
        {showClearAll ? (
          <TextButton type="button" color="grey-04" onClick={clearDraft}>
            Clear all
          </TextButton>
        ) : null}
        <TextButton type="button" color="ctaPrimary" disabled={doneDisabled} onClick={commit}>
          Done
        </TextButton>
      </div>
    </div>
  );

  React.useLayoutEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  return (
    <Popover.Root modal={false} open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild disabled={disabled}>
        {trigger}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          sideOffset={4}
          align="start"
          className="z-1001"
          collisionPadding={10}
          avoidCollisions
          onOpenAutoFocus={event => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onCloseAutoFocus={event => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <div
            ref={containerRef}
            className={floatingShellClass}
            onMouseDown={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
          >
            {showPopoverHeader && !headerAtBottomOfShell ? headerRow('card-top') : null}

            <Popover.Root modal={false} open={open}>
              <div className="relative">
                <div className="pointer-events-none absolute top-0 bottom-0 left-3 z-10 flex items-center">
                  <Search />
                </div>
                <Popover.Anchor asChild>
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={({ currentTarget: { value } }) => onQueryChange(value)}
                    onFocus={() => setOpen(true)}
                    placeholder="Find type…"
                    className={cx(
                      floatingInputClass,
                      popoverSide === 'top' || showPopoverHeader ? 'rounded-t-none' : 'rounded-t-md',
                      'rounded-b-none border-0 border-b border-grey-02'
                    )}
                    spellCheck={false}
                  />
                </Popover.Anchor>
              </div>

              {open ? (
                <Popover.Portal>
                  <Popover.Content
                    side={popoverSide}
                    align={popoverAlign}
                    sideOffset={0}
                    avoidCollisions={false}
                    onOpenAutoFocus={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      inputRef.current?.focus();
                    }}
                    onInteractOutside={event => {
                      const target = event.target as Node | null;
                      if (target && containerRef.current?.contains(target)) {
                        event.preventDefault();
                        return;
                      }
                    }}
                    className="z-9999 w-(--radix-popper-anchor-width) max-w-[min(400px,calc(100vw-24px))] leading-none"
                    collisionPadding={{ top: 16, right: 16, bottom: 96, left: 16 }}
                    forceMount
                  >
                    <div>
                      <div
                        className={cx(
                          'w-full max-w-full overflow-hidden border border-grey-02 bg-white shadow-lg',
                          popoverSide === 'top' ? 'rounded-t-md rounded-b-none border-b-0' : 'rounded-b-md border-t-0'
                        )}
                      >
                        <ResizableContainer>
                          <div
                            ref={resultsScrollRef}
                            className="no-scrollbar flex flex-col overflow-x-clip overflow-y-auto overscroll-contain bg-white"
                            style={{
                              maxHeight: 'min(50vh, calc(var(--radix-popper-available-height, 50vh) - 80px))',
                              minHeight: pendingSpacePick || results.length > 0 ? '100px' : '2.5rem',
                            }}
                            onScroll={handleResultsScroll}
                            onWheel={e => trapWheelToElement(e.currentTarget, e)}
                          >
                            {pendingSpacePick ? (
                              <>
                                <div className="flex items-center justify-between border-b border-grey-02 bg-white">
                                  <div className="w-1/3">
                                    <button
                                      type="button"
                                      onClick={() => setPendingSpacePick(null)}
                                      className="p-2"
                                      aria-label="Back to type results"
                                    >
                                      <ArrowLeft color="grey-04" />
                                    </button>
                                  </div>
                                  <div className="flex w-1/3 items-center justify-center p-2 text-center text-resultTitle text-text">
                                    <span>Select space</span>
                                  </div>
                                  <div className="flex w-1/3 justify-end px-2">
                                    <Tooltip
                                      trigger={
                                        <div className="*:size-[12px]">
                                          <InfoSmall color="grey-04" />
                                        </div>
                                      }
                                      label="This type exists in more than one space. Choose which space to associate with this filter."
                                      position="top"
                                      variant="light"
                                    />
                                  </div>
                                </div>
                                <div className="flex flex-col divide-y divide-divider bg-white">
                                  {(pendingSpacePick.spaces ?? []).map(space => {
                                    const isSpaceRowSelected = draft.some(
                                      p =>
                                        ID.equals(p.id, pendingSpacePick.id) &&
                                        p.spaceId != null &&
                                        ID.equals(p.spaceId, space.spaceId ?? space.id)
                                    );
                                    return (
                                      <button
                                        key={space.spaceId}
                                        type="button"
                                        onClick={() => commitDraftWithSpace(pendingSpacePick, space)}
                                        className={cx(
                                          'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-150',
                                          isSpaceRowSelected ? 'bg-grey-01 hover:bg-grey-01' : 'hover:bg-grey-01'
                                        )}
                                      >
                                        <div>
                                          <div className="h-[24px] w-[24px] overflow-clip rounded-md">
                                            <NativeGeoImage
                                              value={space.image}
                                              alt=""
                                              className="h-full w-full object-cover"
                                            />
                                          </div>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="truncate text-resultTitle text-text">
                                            {spaceLabelForResult(pendingSpacePick, space) ??
                                              space.name ??
                                              space.spaceId.slice(0, 8)}
                                          </div>
                                          <div className="mt-1.5">
                                            <Tag>Space</Tag>
                                          </div>
                                        </div>
                                        {isSpaceRowSelected ? (
                                          <span className="shrink-0 self-start pt-0.5">
                                            <Check />
                                          </span>
                                        ) : null}
                                      </button>
                                    );
                                  })}
                                </div>
                              </>
                            ) : (
                              <>
                                {results.length > 0 ? (
                                  <div className="divide-y divide-divider bg-white">
                                    {results.map((result, index) => {
                                      const pickable = isResultPickable(result);
                                      const isDraftSelected = draft.some(p => ID.equals(p.id, result.id));
                                      const topSpace = result.spaces?.[0];
                                      const topSpaceLabel =
                                        topSpace?.spaceId != null
                                          ? (result.namesBySpace?.[topSpace.spaceId] ?? topSpace.name)
                                          : undefined;
                                      const multiSpace = (result.spaces ?? []).length > 1;
                                      return (
                                        <div key={result.id} className="w-full">
                                          <div className="p-1">
                                            <button
                                              type="button"
                                              disabled={!pickable}
                                              onClick={() => toggleDraftType(result)}
                                              id={`query-setup-type-result-${index}`}
                                              className={cx(
                                                'relative z-10 flex w-full flex-row items-start gap-2 rounded-md px-3 py-2 text-left transition-colors duration-150 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-45',
                                                isDraftSelected
                                                  ? 'bg-grey-01 hover:bg-grey-01 focus:bg-grey-01'
                                                  : 'hover:bg-grey-01 focus:bg-grey-01'
                                              )}
                                            >
                                              <div className="min-w-0 flex-1 flex-col">
                                                <div className="flex max-w-full items-center gap-1.5">
                                                  <span className="truncate text-resultTitle text-text">
                                                    {result.name}
                                                  </span>
                                                </div>
                                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                                  {topSpace && (
                                                    <div className="flex shrink-0 items-center gap-1">
                                                      <span className="inline-flex size-[12px] items-center justify-center overflow-hidden rounded-sm">
                                                        <NativeGeoImage
                                                          value={topSpace.image}
                                                          alt=""
                                                          className="h-full w-full object-cover"
                                                        />
                                                      </span>
                                                      <span className="max-w-[160px] truncate text-[0.875rem] text-text">
                                                        {topSpaceLabel ?? topSpace.spaceId?.slice(0, 8)}
                                                      </span>
                                                    </div>
                                                  )}
                                                  {result.types.length > 0 && (
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
                                                            <path
                                                              d="M2.25 8L5.75 4.5L2.25 1"
                                                              stroke="#606060"
                                                              strokeLinecap="round"
                                                            />
                                                          </svg>
                                                        </div>
                                                      )}
                                                      <div className="flex flex-wrap items-center gap-1.5">
                                                        {result.types.slice(0, 3).map((type, i) => (
                                                          <Tag key={`${type.id}-${i}`}>{type.name}</Tag>
                                                        ))}
                                                        {result.types.length > 3 ? (
                                                          <Tag>{`+${result.types.length - 3}`}</Tag>
                                                        ) : null}
                                                      </div>
                                                    </>
                                                  )}
                                                </div>
                                                {result.description && (
                                                  <Truncate
                                                    maxLines={3}
                                                    shouldTruncate
                                                    variant="footnote"
                                                    className="mt-2"
                                                  >
                                                    <p className="text-[0.75rem]! leading-[1.2] text-grey-04">
                                                      {result.description}
                                                    </p>
                                                  </Truncate>
                                                )}
                                              </div>
                                              {isDraftSelected ? (
                                                <span className="shrink-0 self-start pt-0.5">
                                                  <Check />
                                                </span>
                                              ) : null}
                                            </button>
                                          </div>
                                          {pickable && multiSpace ? (
                                            <div className="-mt-2 p-1">
                                              <button
                                                type="button"
                                                onClick={() => setPendingSpacePick(result)}
                                                className={cx(
                                                  'relative z-0 flex w-full items-center justify-between rounded-md px-3 py-1.5 transition-colors duration-150',
                                                  isDraftSelected ? 'bg-grey-01 hover:bg-grey-01' : 'hover:bg-grey-01'
                                                )}
                                              >
                                                <div className="flex items-center gap-1">
                                                  <div className="inline-flex gap-0">
                                                    {(result.spaces ?? []).slice(0, 3).map(space => (
                                                      <div
                                                        key={space.spaceId}
                                                        className="-ml-[4px] h-3 w-3 overflow-clip rounded-sm border border-white first:ml-0"
                                                      >
                                                        <NativeGeoImage
                                                          value={space.image}
                                                          alt=""
                                                          className="h-full w-full object-cover"
                                                        />
                                                      </div>
                                                    ))}
                                                  </div>
                                                  <div className="text-[0.875rem] text-text">
                                                    {(result.spaces ?? []).length}{' '}
                                                    {pluralize('space', (result.spaces ?? []).length)}
                                                  </div>
                                                </div>
                                                <div className="text-[0.875rem] text-grey-04">Select space</div>
                                              </button>
                                            </div>
                                          ) : null}
                                        </div>
                                      );
                                    })}
                                    {isFetchingNextPage ? (
                                      <div className="w-full bg-white px-3 py-2">
                                        <div className="truncate text-resultTitle text-text">Loading more...</div>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : results.length === 0 && (isLoading || isFetching) ? (
                                  <div className="w-full bg-white px-3 py-2">
                                    <div className="truncate text-resultTitle text-text">Loading...</div>
                                  </div>
                                ) : (
                                  <div className="w-full bg-white px-3 py-2">
                                    <div className="truncate text-resultTitle text-text">No results.</div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </ResizableContainer>
                      </div>
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              ) : null}
            </Popover.Root>

            {headerAtBottomOfShell ? headerRow('card-bottom') : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
