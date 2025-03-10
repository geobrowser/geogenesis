import { SystemIds } from '@graphprotocol/grc-20';
import * as Popover from '@radix-ui/react-popover';
import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { useAtom } from 'jotai';
import pluralize from 'pluralize';

import * as React from 'react';
import { startTransition, useState } from 'react';

import { useWriteOps } from '~/core/database/write';
import { useSearch } from '~/core/hooks/use-search';
import { useToast } from '~/core/hooks/use-toast';
import { ID } from '~/core/id';
import { SearchResult } from '~/core/io/dto/search';
import { EntityId } from '~/core/io/schema';
import { getImagePath } from '~/core/utils/utils';

import { EntityCreatedToast } from '~/design-system/autocomplete/entity-created-toast';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { TopRanked } from '~/design-system/icons/top-ranked';
import { Tag } from '~/design-system/tag';
import { Toggle } from '~/design-system/toggle';
import { Tooltip } from '~/design-system/tooltip';

import { ArrowLeft } from './icons/arrow-left';
import { InfoSmall } from './icons/info-small';
import { Search } from './icons/search';
import { ResizableContainer } from './resizable-container';
import { Truncate } from './truncate';
import { showingIdsAtom } from '~/atoms';

type SelectEntityProps = {
  onDone: (result: { id: EntityId; name: string | null; space?: EntityId; verified?: boolean }) => void;
  onCreateEntity?: (result: { id: EntityId; name: string | null; space?: EntityId; verified?: boolean }) => void;
  spaceId: string;
  allowedTypes?: string[];
  placeholder?: string;
  containerClassName?: string;
  inputClassName?: string;
  variant?: 'floating' | 'fixed';
  width?: 'clamped' | 'full';
  withSearchIcon?: boolean;
};

const inputStyles = cva('', {
  variants: {
    fixed: {
      true: 'm-0 block w-full resize-none bg-transparent p-0 text-body placeholder:text-grey-02 focus:outline-none',
    },
    floating: {
      true: 'm-0 block w-full resize-none bg-transparent p-2 text-body placeholder:text-grey-02 focus:outline-none',
    },
    withSearchIcon: {
      true: 'pl-9',
    },
  },
  defaultVariants: {
    fixed: true,
    floating: false,
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
      true: 'rounded-md border border-divider bg-white',
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

export const SelectEntity = ({
  onDone,
  onCreateEntity,
  spaceId,
  allowedTypes,
  placeholder = 'Find or create...',
  width = 'clamped',
  variant = 'fixed',
  containerClassName = '',
  inputClassName = '',
  withSearchIcon = false,
}: SelectEntityProps) => {
  const [isShowingIds, setIsShowingIds] = useAtom(showingIdsAtom);

  const [result, setResult] = useState<SearchResult | null>(null);

  const { query, onQueryChange, isLoading, isEmpty, results } = useSearch({
    filterByTypes: allowedTypes,
  });

  if (query === '' && result !== null) {
    startTransition(() => {
      setResult(null);
    });
  }

  const handleShowIds = () => {
    setIsShowingIds(!isShowingIds);
  };

  const [, setToast] = useToast();
  const { upsert } = useWriteOps();

  const onCreateNewEntity = () => {
    const newEntityId = ID.createEntityId();

    // Create new entity with name and types
    upsert(
      {
        entityId: newEntityId,
        attributeId: SystemIds.NAME_ATTRIBUTE,
        entityName: query,
        attributeName: 'Name',
        value: {
          type: 'TEXT',
          value: query,
        },
      },
      spaceId
    );

    // This component is used in many different use-cases across the system, so we
    // need to be able to pass in a callback. onCreateEntity is used to enable to
    // caller to add arbitrary data to an entity when it's created.
    //
    // e.g., you're in a collection and create a new entity, we want to add the current
    // filters to the created entity. This enables the caller to hook into the creation.
    if (onCreateEntity) {
      onCreateEntity({ id: newEntityId, name: query });
    }
    onDone({ id: newEntityId, name: query });
    setToast(<EntityCreatedToast entityId={newEntityId} spaceId={spaceId} />);
  };

  return (
    <div
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
      <Popover.Root open={!!query} onOpenChange={() => onQueryChange('')}>
        <Popover.Anchor asChild>
          <input
            type="text"
            value={query}
            onChange={({ currentTarget: { value } }) => onQueryChange(value)}
            placeholder={placeholder}
            className={inputStyles({ [variant]: true, withSearchIcon, className: inputClassName })}
            spellCheck={false}
          />
        </Popover.Anchor>
        {query && (
          <Popover.Portal forceMount>
            <Popover.Content
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
                    '-ml-px overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg',
                    width === 'clamped' ? 'w-[400px]' : '-mr-px',
                    withSearchIcon && 'rounded-t-none'
                  )}
                >
                  {!result ? (
                    <ResizableContainer>
                      <div className="no-scrollbar flex max-h-[219px] flex-col overflow-y-auto overflow-x-clip bg-white">
                        {!results?.length && isLoading && (
                          <div className="w-full bg-white px-3 py-2">
                            <div className="text-resultTitle truncate text-text">Loading...</div>
                          </div>
                        )}
                        {isEmpty ? (
                          <div className="w-full bg-white px-3 py-2">
                            <div className="text-resultTitle truncate text-text">No results.</div>
                          </div>
                        ) : (
                          <div className="divide-y divide-divider bg-white">
                            {results.map((result, index) => (
                              <div key={index} className="w-full">
                                <div className="p-1">
                                  <button
                                    onClick={() => {
                                      setResult(null);
                                      onDone({
                                        id: result.id,
                                        name: result.name,
                                      });
                                      onQueryChange('');
                                    }}
                                    className="relative z-10 flex w-full flex-col rounded-md px-3 py-2 transition-colors duration-150 hover:bg-grey-01 focus:bg-grey-01 focus:outline-none"
                                  >
                                    {isShowingIds && (
                                      <div className="mb-2 text-[0.6875rem] text-grey-04">ID · {result.id}</div>
                                    )}
                                    <div className="text-resultTitle max-w-full truncate text-text">{result.name}</div>
                                    <div className="mt-1.5 flex items-center gap-1.5">
                                      <div className="flex shrink-0 items-center gap-1">
                                        <span className="inline-flex size-[12px] items-center justify-center rounded-sm border border-grey-04">
                                          <TopRanked color="grey-04" />
                                        </span>
                                        <span className="text-[0.875rem] text-text">Top-ranked</span>
                                      </div>
                                      {result.types.length > 0 && (
                                        <>
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
                                          <div className="flex items-center gap-1.5">
                                            {result.types.slice(0, 3).map(type => (
                                              <Tag key={type.id}>{type.name}</Tag>
                                            ))}
                                            {result.types.length > 3 ? (
                                              <Tag>{`+${result.types.length - 3}`}</Tag>
                                            ) : null}
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
                                            <img
                                              src={getImagePath(space.image)}
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
                        <div className="text-resultTitle flex w-1/3 items-center justify-center p-2 text-center text-text">
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
                      <div className="flex max-h-[219px] flex-col divide-y divide-divider overflow-y-auto overflow-x-clip bg-white">
                        {(result.spaces ?? []).map((space, index) => (
                          <button
                            key={index}
                            onClick={() => {
                              setResult(null);
                              onDone({
                                id: result.id,
                                name: result.name,
                                space: EntityId(space.spaceId),
                              });
                              onQueryChange('');
                            }}
                            className="flex w-full items-center gap-3 px-3 py-2 hover:bg-grey-01"
                          >
                            <div>
                              <div className="h-[24px] w-[24px] overflow-clip rounded-md">
                                <img src={getImagePath(space.image)} alt="" className="h-full w-full object-cover" />
                              </div>
                            </div>
                            <div>
                              <div className="text-resultTitle truncate text-text">{space.name}</div>
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
                    <div className="flex w-full items-center justify-between border-t border-grey-02 px-4 py-2">
                      <button onClick={handleShowIds} className="inline-flex items-center gap-1.5">
                        <Toggle checked={isShowingIds} />
                        <div className="text-[0.875rem] text-grey-04">IDs</div>
                      </button>
                      <button onClick={onCreateNewEntity} className="text-resultLink text-ctaHover">
                        Create new
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </Popover.Root>
    </div>
  );
};
