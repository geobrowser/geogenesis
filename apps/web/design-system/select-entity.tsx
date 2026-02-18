'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';
import * as Popover from '@radix-ui/react-popover';
import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { useAtom } from 'jotai';
import pluralize from 'pluralize';

import * as React from 'react';
import { startTransition, useEffect, useRef, useState } from 'react';

import { useKey } from '~/core/hooks/use-key';
import { useOnClickOutside } from '~/core/hooks/use-on-click-outside';
import { useSearch } from '~/core/hooks/use-search';
import { useSpacesQuery } from '~/core/hooks/use-spaces-query';
import { useToast } from '~/core/hooks/use-toast';
import { ID } from '~/core/id';
import { useMutate } from '~/core/sync/use-mutate';
import { detectWeb2URLs } from '~/core/utils/url-detection';
import { Property, SearchResult, SwitchableRenderableType } from '~/core/types';

import { EntityCreatedToast } from '~/design-system/autocomplete/entity-created-toast';
import { ResultItem, ResultsList } from '~/design-system/autocomplete/results-list';
import { Breadcrumb } from '~/design-system/breadcrumb';
import { IconButton } from '~/design-system/button';
import { NativeGeoImage } from '~/design-system/geo-image';
import { CheckCloseSmall } from '~/design-system/icons/check-close-small';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Input } from '~/design-system/input';
import { Select } from '~/design-system/select';
import { Tag } from '~/design-system/tag';
import { Text } from '~/design-system/text';
import { Toggle } from '~/design-system/toggle';
import { Tooltip } from '~/design-system/tooltip';

import { RenderableTypeDropdown } from '~/partials/entity-page/renderable-type-dropdown';

import { ArrowLeft } from './icons/arrow-left';
import { InfoSmall } from './icons/info-small';
import { Search } from './icons/search';
import { ResizableContainer } from './resizable-container';
import { Spacer } from './spacer';
import { Truncate } from './truncate';
import { showingIdsAtom } from '~/atoms';

type SelectEntityProps = {
  onDone?: (
    result: { id: string; name: string | null; space?: string; primarySpace?: string; verified?: boolean },
    // This is used to determine if the onDone is called from within the create function
    // internal to SelectEntity. Some consumers in the codebase want to either listen to
    // the onDone OR onCreateEntity callback but not both. This lets them bail out of
    // onCreate if they need to.
    //
    // Not the best way to do this but the simplest for now to avoid breaking changes.
    fromCreateFn?: boolean
  ) => void;
  onCreateEntity?: (result: {
    id: string;
    name: string | null;
    space?: string;
    verified?: boolean;
    renderableType?: SwitchableRenderableType;
  }) => void | string;
  spaceId: string;
  relationValueTypes?: Property['relationValueTypes'];
  placeholder?: string;
  containerClassName?: string;
  inputClassName?: string;
  variant?: 'floating' | 'fixed' | 'tableCell';
  width?: 'clamped' | 'full';
  withSelectSpace?: boolean;
  withSearchIcon?: boolean;
  advanced?: boolean;
  autoFocus?: boolean;
  showUrlWarning?: boolean;
  showIDs?: boolean;
};

type SpaceFilter = { spaceId: string; spaceName: string | null };

type TypeFilter = { typeId: string; typeName: string | null };

export const SelectEntity = ({
  onDone,
  onCreateEntity,
  spaceId,
  relationValueTypes,
  placeholder = 'Find or create...',
  width = 'clamped',
  variant = 'fixed',
  containerClassName = '',
  inputClassName = '',
  withSelectSpace = true,
  withSearchIcon = false,
  autoFocus = false,
  advanced = true,
  showUrlWarning = false,
  showIDs = true,
}: SelectEntityProps) => {
  const [isShowingIds, setIsShowingIds] = useAtom(showingIdsAtom);
  const { storage } = useMutate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [result, setResult] = useState<SearchResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  const [removedTypeIds, setRemovedTypeIds] = useState<Set<string>>(new Set());

  const allowedTypes = React.useMemo(() => {
    const base = relationValueTypes ?? [];
    if (removedTypeIds.size === 0) return base;
    return base.filter(t => !removedTypeIds.has(t.id));
  }, [relationValueTypes, removedTypeIds]);

  const [isShowingAdvanced, setIsShowingAdvanced] = useState<boolean>(false);
  const [isAddingFilter, setIsAddingFilter] = useState<boolean>(false);
  const [addFilterValue, setAddFilterValue] = useState<'space' | 'type'>('space');

  const [spaceFilter, setSpaceFilter] = useState<SpaceFilter | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter | null>(null);
  const [renderableType, setRenderableType] = useState<SwitchableRenderableType | undefined>('TEXT');

  const filterBySpace = spaceFilter?.spaceId ?? undefined;

  const filterByTypes = typeFilter
    ? [typeFilter.typeId, ...(allowedTypes.length > 0 ? allowedTypes.map(r => r.id) : [])]
    : allowedTypes.length > 0
      ? allowedTypes.map(r => r.id)
      : undefined;

  const { query, onQueryChange, isLoading, isEmpty, results } = useSearch({
    filterByTypes,
    filterBySpace,
  });

  // Check if URL is detected
  const isUrlDetected = showUrlWarning && query.trim() !== '' && detectWeb2URLs(query).length > 0;

  // Auto focus input when component mounts
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      // Add small delay to ensure the component is fully rendered and visible
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  if (query === '' && result !== null) {
    startTransition(() => {
      setResult(null);
    });
  }

  const handleShowIds = () => {
    setIsShowingIds(!isShowingIds);
  };

  const handleShowAdvanced = () => {
    setIsShowingAdvanced(!isShowingAdvanced);
  };

  const [, setToast] = useToast();

  // Check if we're creating a property entity
  const isCreatingProperty = relationValueTypes?.some(type => type.id === SystemIds.PROPERTY);

  const onCreateNewEntity = () => {
    let newEntityId = ID.createEntityId();

    // This component is used in many different use-cases across the system, so we
    // need to be able to pass in a callback. onCreateEntity is used to enable to
    // caller to add arbitrary data to an entity when it's created.
    //
    // e.g., you're in a collection and create a new entity, we want to add the current
    // filters to the created entity. This enables the caller to hook into the creation.
    if (onCreateEntity) {
      newEntityId =
        onCreateEntity({
          id: newEntityId,
          name: query,
          space: spaceId,
          renderableType: isCreatingProperty ? renderableType : undefined,
        }) ?? newEntityId;
    }

    // Create new entity with name and types using internal id
    storage.entities.name.set(newEntityId, spaceId, query);

    onDone?.({ id: newEntityId, name: query, space: spaceId }, true);
    onQueryChange('');
    setSelectedIndex(0);
    setToast(<EntityCreatedToast entityId={newEntityId} spaceId={spaceId} />);
  };

  const hasNoFilters = !typeFilter && !spaceFilter && allowedTypes.length === 0;

  const hasResults = query && results.length > 0;

  useKey('Enter', () => {
    if (!hasResults) return;

    const result = results[selectedIndex];

    if (result) {
      setResult(null);
      onDone?.({
        id: result.id,
        name: result.name,
        primarySpace: result.spaces?.[0]?.spaceId ? result.spaces[0].spaceId : undefined,
      });
      onQueryChange('');
    }
  });

  useKey('ArrowUp', event => {
    if (!hasResults) return;

    event.preventDefault();
    setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
  });

  useKey('ArrowDown', event => {
    if (!hasResults) return;

    event.preventDefault();
    setSelectedIndex(prev => (prev + 1) % results.length);
  });

  useEffect(() => {
    if (!hasResults) return;

    const element = document.querySelector(`#select-entity-result-${selectedIndex}`);

    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [hasResults, selectedIndex]);

  const containerRef = useRef(null!);

  useOnClickOutside(() => {
    onQueryChange('');
    setSelectedIndex(0);
  }, containerRef);

  const popoverRef = useRef(null!);

  useOnClickOutside(() => {
    setResult(null);
  }, popoverRef);

  return (
    <div
      ref={containerRef}
      className={containerStyles({
        width,
        floating: variant === 'floating',
        isQueried: query.length > 0,
        className: containerClassName,
      })}
    >
      {withSearchIcon && (
        <div className="absolute bottom-0 left-3 top-0 z-10 flex items-center">
          <Search />
        </div>
      )}
      <Popover.Root open={!!query}>
        <Popover.Anchor asChild>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={({ currentTarget: { value } }) => {
              onQueryChange(value);
              setSelectedIndex(0);
            }}
            placeholder={placeholder}
            className={inputStyles({ [variant]: true, withSearchIcon, className: inputClassName })}
            spellCheck={false}
            autoFocus={autoFocus}
          />
        </Popover.Anchor>
        {query && (
          <Popover.Content
            ref={popoverRef}
            onOpenAutoFocus={event => {
              event.preventDefault();
              event.stopPropagation();
            }}
            className="z-[9999] w-[var(--radix-popper-anchor-width)] leading-none"
            forceMount
          >
            <div className={cx(variant === 'fixed' && 'pt-1', width === 'full' && 'w-full')}>
              <div
                className={cx(
                  '-ml-px overflow-hidden rounded-md border border-grey-02 bg-white shadow-lg',
                  width === 'clamped' ? 'w-[400px]' : '-mr-px',
                  withSearchIcon && 'rounded-t-none'
                )}
              >
                {advanced && (
                  <div className="w-full">
                    <button
                      onClick={handleShowAdvanced}
                      className="flex w-full justify-end border-b border-grey-02 px-2 py-1"
                    >
                      <div className="inline-flex items-center gap-1">
                        <span className="text-[0.6875rem] text-grey-04">Advanced</span>
                        <span
                          className={cx('transition duration-300 ease-in-out', isShowingAdvanced && 'scale-y-[-1]')}
                        >
                          <ChevronDownSmall color="grey-04" />
                        </span>
                      </div>
                    </button>
                    <ResizableContainer>
                      {isShowingAdvanced && (
                        <div className="border-b border-grey-02 px-4 py-2">
                          {!isAddingFilter ? (
                            <>
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="text-[0.875rem] text-grey-04">Applied</span>
                                </div>
                                <div>
                                  <button
                                    onClick={() => setIsAddingFilter(true)}
                                    className="text-[0.875rem] text-ctaHover"
                                  >
                                    + Add filter
                                  </button>
                                </div>
                              </div>
                              <div className="mt-1 flex w-full flex-wrap gap-1 text-black">
                                {hasNoFilters ? (
                                  <div>No filters applied</div>
                                ) : (
                                  <>
                                    {allowedTypes.map(allowedType => {
                                      return (
                                        <FilterPill
                                          key={allowedType.id}
                                          filterType="Type"
                                          name={allowedType.name ?? ''}
                                          onDelete={() =>
                                            setRemovedTypeIds(prev => new Set([...prev, allowedType.id]))
                                          }
                                        />
                                      );
                                    })}
                                    {spaceFilter && (
                                      <FilterPill
                                        key={spaceFilter.spaceId}
                                        filterType="Space"
                                        name={spaceFilter.spaceName ?? ''}
                                        onDelete={() => setSpaceFilter(null)}
                                      />
                                    )}
                                    {typeFilter && (
                                      <FilterPill
                                        key={typeFilter.typeId}
                                        filterType="Type"
                                        name={typeFilter.typeName ?? ''}
                                        onDelete={() => setTypeFilter(null)}
                                      />
                                    )}
                                  </>
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                              <div>
                                <button
                                  onClick={() => {
                                    setIsAddingFilter(false);
                                  }}
                                  className="text-[0.875rem] text-grey-04"
                                >
                                  Back
                                </button>
                              </div>
                              <div className="relative z-100 mt-1 flex w-full items-center gap-2 text-black">
                                <div className="flex flex-1">
                                  <Select
                                    options={[
                                      { value: 'space', label: 'Space' },
                                      { value: 'type', label: 'Type' },
                                    ]}
                                    value={addFilterValue}
                                    onChange={value => setAddFilterValue(value as 'space' | 'type')}
                                  />
                                </div>
                                <span className="text-button text-grey-04">is</span>
                                <div className="flex flex-[2]">
                                  {addFilterValue === 'space' && (
                                    <SpaceFilterInput
                                      onSelect={result => {
                                        setSpaceFilter({
                                          spaceId: result.id,
                                          spaceName: result.name,
                                        });
                                        setIsAddingFilter(false);
                                      }}
                                    />
                                  )}
                                  {addFilterValue === 'type' && (
                                    <TypeFilterInput
                                      onSelect={result => {
                                        setTypeFilter({
                                          typeId: result.id,
                                          typeName: result.name,
                                        });
                                        setIsAddingFilter(false);
                                      }}
                                    />
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </ResizableContainer>
                  </div>
                )}
                {!result ? (
                  <ResizableContainer>
                    <div className="no-scrollbar flex max-h-[219px] flex-col overflow-y-auto overflow-x-clip bg-white">
                      {!results?.length && isLoading && (
                        <div className="w-full bg-white px-3 py-2">
                          <div className="truncate text-resultTitle text-text">Loading...</div>
                        </div>
                      )}
                      {isEmpty ? (
                        <div className="w-full bg-white px-3 py-2">
                          <div className="truncate text-resultTitle text-text">No results.</div>
                        </div>
                      ) : (
                        <div className="divide-y divide-divider bg-white">
                          {results.map((result, index) => (
                            <div key={index} className="w-full">
                              <div className="p-1">
                                <button
                                  onClick={() => {
                                    setResult(null);
                                    onDone?.({
                                      id: result.id,
                                      name: result.name,
                                      primarySpace: result.spaces?.[0]?.spaceId ? result.spaces[0].spaceId : undefined,
                                    });
                                    onQueryChange('');
                                    setSelectedIndex(0);
                                  }}
                                  id={`select-entity-result-${index}`}
                                  className={cx(
                                    'relative z-10 flex w-full flex-col rounded-md px-3 py-2 transition-colors duration-150 hover:bg-grey-01 focus:bg-grey-01 focus:outline-none',
                                    index === selectedIndex && 'bg-grey-01'
                                  )}
                                >
                                  {isShowingIds && (
                                    <div className="mb-2 text-[0.6875rem] text-grey-04">ID · {result.id}</div>
                                  )}
                                  <div className="max-w-full truncate text-resultTitle text-text">{result.name}</div>
                                  <div className="mt-1.5 flex items-center gap-1.5">
                                    {withSelectSpace && (result.spaces ?? []).length > 0 && (
                                      <div className="flex shrink-0 items-center gap-1">
                                        <span className="inline-flex size-[12px] items-center justify-center rounded-sm border border-grey-04">
                                          <NativeGeoImage
                                            value={result.spaces[0].image}
                                            alt=""
                                            className="h-full w-full object-cover"
                                          />
                                        </span>
                                        <span className="text-[0.875rem] text-text">{result.spaces[0].name}</span>
                                      </div>
                                    )}
                                    {result.types.length > 0 && (
                                      <>
                                        {withSelectSpace && (
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
                                        <div className="flex items-center gap-1.5">
                                          {result.types.slice(0, 3).map((type, index) => (
                                            <Tag key={`${type.id}-${index}`}>{type.name}</Tag>
                                          ))}
                                          {result.types.length > 3 ? <Tag>{`+${result.types.length - 3}`}</Tag> : null}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                  {result.description && (
                                    <>
                                      <Truncate maxLines={3} shouldTruncate variant="footnote" className="mt-2">
                                        <p className="!text-[0.75rem] leading-[1.2] text-grey-04">
                                          {result.description}
                                        </p>
                                      </Truncate>
                                    </>
                                  )}
                                </button>
                              </div>
                              {withSelectSpace && (
                                <div className="-mt-2 p-1">
                                  <button
                                    onClick={() => setResult(result)}
                                    className="relative z-0 flex w-full items-center justify-between rounded-md px-3 py-1.5 transition-colors duration-150 hover:bg-grey-01"
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
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </ResizableContainer>
                ) : (
                  <>
                    <div className="flex items-center justify-between border-b border-divider bg-white">
                      <div className="w-1/3">
                        <button onClick={() => setResult(null)} className="p-2">
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
                          label={`Selecting a specific space will mean that any time anyone clicks this link, it’ll take them to that space’s view of this entity.`}
                          position="top"
                          variant="light"
                        />
                      </div>
                    </div>
                    <div className="flex max-h-[50vh] flex-col divide-y divide-divider overflow-y-auto overflow-x-clip bg-white">
                      {(result.spaces ?? []).map((space, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            setResult(null);
                            onDone?.({
                              id: result.id,
                              name: result.name,
                              space: space.spaceId,
                            });
                            onQueryChange('');
                            setSelectedIndex(0);
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2 hover:bg-grey-01"
                        >
                          <div>
                            <div className="h-[24px] w-[24px] overflow-clip rounded-md">
                              <NativeGeoImage value={space.image} alt="" className="h-full w-full object-cover" />
                            </div>
                          </div>
                          <div>
                            <div className="truncate text-resultTitle text-text">{space.name}</div>
                            <div className="mt-1.5">
                              <Tag>Space</Tag>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {!result && (
                  <div className="flex w-full items-center justify-between border-t border-grey-02 pl-[5px] pr-3 py-[5px]">
                    <div className="flex items-center gap-3">
                      {showIDs && (
                        <button onClick={handleShowIds} className="inline-flex items-center gap-1.5">
                          <Toggle checked={isShowingIds} />
                          <div className="text-[0.875rem] text-grey-04">IDs</div>
                        </button>
                      )}
                      {isCreatingProperty && (
                        <RenderableTypeDropdown value={renderableType} onChange={setRenderableType} />
                      )}
                    </div>
                    <button
                      disabled={isCreatingProperty && !renderableType}
                      onClick={onCreateNewEntity}
                      className="text-resultLink text-ctaHover disabled:text-grey-03"
                    >
                      Create new
                    </button>
                  </div>
                )}
              </div>
            </div>
          </Popover.Content>
        )}
      </Popover.Root>
    </div>
  );
};

const inputStyles = cva('', {
  variants: {
    fixed: {
      true: 'm-0 block w-full resize-none bg-transparent p-0 text-body placeholder:text-grey-03 focus:outline-none focus:placeholder:text-grey-03',
    },
    floating: {
      true: 'm-0 block w-full resize-none bg-transparent p-2 text-body placeholder:text-grey-03 focus:outline-none focus:placeholder:text-grey-03',
    },
    tableCell: {
      true: 'm-0 block w-full resize-none bg-transparent p-0 text-tableCell placeholder:text-grey-03 focus:outline-none focus:placeholder:text-grey-03',
    },
    withSearchIcon: {
      true: 'pl-9',
    },
  },
  defaultVariants: {
    fixed: true,
    floating: false,
    tableCell: false,
    withSearchIcon: false,
  },
});

const containerStyles = cva('relative', {
  variants: {
    width: {
      clamped: 'w-[400px]',
      full: 'w-full',
    },
    floating: {
      true: 'rounded-md border border-divider bg-white shadow-lg',
    },
    isQueried: {
      true: 'rounded-b-none',
    },
  },
  defaultVariants: {
    width: 'clamped',
    floating: false,
    isQueried: false,
  },
});

const FilterPill = ({
  filterType,
  name,
  onDelete,
}: {
  filterType: 'Relation value type' | 'Type' | 'Space';
  name: string;
  onDelete: () => void;
}) => {
  return (
    <div className="flex h-6 items-center gap-2 rounded bg-divider py-1 pl-2 pr-1 text-metadata">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M2.73511 0.5H9.26489C10.0543 0.5 10.5325 1.37186 10.1081 2.03755L7.76692 5.71008C7.51097 6.11158 7.375 6.57782 7.375 7.05396V10.125C7.375 10.8844 6.75939 11.5 6 11.5C5.24061 11.5 4.625 10.8844 4.625 10.125V7.05396C4.625 6.57782 4.48903 6.11158 4.23308 5.71008L1.89187 2.03755C1.46751 1.37186 1.94565 0.5 2.73511 0.5Z"
          fill="#606060"
          stroke="#606060"
          strokeLinecap="round"
        />
      </svg>
      <div className="flex items-center gap-1">
        <span>{filterType} is</span>
        <span>·</span>
        <span>{name}</span>
      </div>
      <IconButton icon={<CheckCloseSmall />} color="grey-04" onClick={onDelete} />
    </div>
  );
};

type SpaceFilterInputProps = {
  onSelect: (result: { id: string; name: string | null }) => void;
};

const SpaceFilterInput = ({ onSelect }: SpaceFilterInputProps) => {
  const { query, setQuery, spaces: results } = useSpacesQuery();

  const onSelectSpace = (space: (typeof results)[number]) => {
    setQuery('');

    onSelect({
      id: space.id,
      name: space.name,
    });
  };

  return (
    <div className="relative z-100 w-full">
      <Popover.Root open={!!query} onOpenChange={() => setQuery('')}>
        <Popover.Anchor asChild>
          <Input value={query} onChange={e => setQuery(e.target.value)} />
        </Popover.Anchor>
        {query && (
          <Popover.Content
            onOpenAutoFocus={event => {
              event.preventDefault();
              event.stopPropagation();
            }}
            className="z-[9999] w-[var(--radix-popper-anchor-width)] leading-none"
            forceMount
          >
            <div className="pt-1">
              <div className="flex max-h-[50vh] w-full flex-col overflow-hidden rounded border border-grey-02 bg-white">
                <ResizableContainer>
                  <ResultsList>
                    {results.map(result => (
                      <ResultItem key={result.id} onClick={() => onSelectSpace(result)}>
                        <div className="flex w-full items-center justify-between leading-[1rem]">
                          <Text as="li" variant="metadataMedium" ellipsize className="leading-[1.125rem]">
                            {result.name ?? result.id}
                          </Text>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 overflow-hidden">
                          {(result.name ?? result.id) && (
                            <Breadcrumb img={result.image}>{result.name ?? result.id}</Breadcrumb>
                          )}
                          <span style={{ rotate: '270deg' }}>
                            <ChevronDownSmall color="grey-04" />
                          </span>
                          <div className="flex items-center gap-1.5">
                            <Tag>Space</Tag>
                          </div>
                        </div>
                      </ResultItem>
                    ))}
                  </ResultsList>
                </ResizableContainer>
              </div>
            </div>
          </Popover.Content>
        )}
      </Popover.Root>
    </div>
  );
};

type TypeFilterInputProps = {
  onSelect: (result: { id: string; name: string | null }) => void;
};

const TypeFilterInput = ({ onSelect }: TypeFilterInputProps) => {
  const { query, onQueryChange, isLoading, isEmpty, results } = useSearch({
    filterByTypes: [SystemIds.SCHEMA_TYPE],
  });

  return (
    <div className="relative z-100 w-full">
      <Popover.Root open={!!query} onOpenChange={() => onQueryChange('')}>
        <Popover.Anchor asChild>
          <Input value={query} onChange={e => onQueryChange(e.target.value)} />
        </Popover.Anchor>
        {query && (
          <Popover.Content
            onOpenAutoFocus={event => {
              event.preventDefault();
              event.stopPropagation();
            }}
            className="z-[9999] w-[var(--radix-popper-anchor-width)] leading-none"
            forceMount
          >
            <div className="pt-1">
              <div className="flex max-h-[50vh] w-full flex-col overflow-hidden rounded border border-grey-02 bg-white">
                <ResizableContainer>
                  <ResultsList>
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
                      <>
                        {results.map((result, index) => (
                          <ResultItem key={index}>
                            <button
                              onClick={() => {
                                onSelect({
                                  id: result.id,
                                  name: result.name,
                                });
                                onQueryChange('');
                              }}
                              className="relative z-10 flex w-full flex-col transition-colors duration-150 hover:bg-grey-01 focus:bg-grey-01 focus:outline-none"
                            >
                              <div className="relative w-full">
                                <div className="relative z-0 max-w-full truncate text-button text-text">
                                  {result.name}
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
                          </ResultItem>
                        ))}
                      </>
                    )}
                  </ResultsList>
                </ResizableContainer>
              </div>
            </div>
          </Popover.Content>
        )}
      </Popover.Root>
    </div>
  );
};
