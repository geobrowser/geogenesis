import { SYSTEM_IDS } from '@geogenesis/sdk';
import * as Popover from '@radix-ui/react-popover';
import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { useAtom } from 'jotai';
import pluralize from 'pluralize';

import * as React from 'react';
import { useState } from 'react';

import { useWriteOps } from '~/core/database/write';
import { useSearch } from '~/core/hooks/use-search';
import { useToast } from '~/core/hooks/use-toast';
import { ID } from '~/core/id';
import { SearchResult } from '~/core/io/dto/search';
import { EntityId, SpaceId } from '~/core/io/schema';
import type { RelationValueType } from '~/core/types';
import { getImagePath } from '~/core/utils/utils';

import { EntityCreatedToast } from '~/design-system/autocomplete/entity-created-toast';
import { Tag } from '~/design-system/tag';
import { Toggle } from '~/design-system/toggle';

import { ArrowLeft } from './icons/arrow-left';
import { Search } from './icons/search';
import { showingIdsAtom } from '~/atoms';

type SelectEntityProps = {
  onDone: (result: { id: EntityId; name: string | null; space?: EntityId }) => void;
  spaceId: string;
  allowedTypes?: RelationValueType[];
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

const containerStyles = cva('', {
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
    filterByTypes: allowedTypes?.map(type => type.typeId),
  });

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
        attributeId: SYSTEM_IDS.NAME,
        entityName: query,
        attributeName: 'Name',
        value: {
          type: 'TEXT',
          value: query,
        },
      },
      spaceId
    );

    if (allowedTypes) {
      allowedTypes.forEach(type => {
        upsert(
          {
            entityId: newEntityId,
            attributeId: SYSTEM_IDS.TYPES,
            entityName: query,
            attributeName: 'Types',
            value: {
              type: 'ENTITY',
              value: type.typeId,
              name: type.typeName,
            },
          },
          spaceId
        );
      });
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
          />
        </Popover.Anchor>
        {query && (
          <Popover.Portal forceMount>
            <Popover.Content
              onOpenAutoFocus={event => {
                event.preventDefault();
                event.stopPropagation();
              }}
              forceMount
              asChild
            >
              <div className={cx(variant === 'fixed' && 'pt-1')}>
                <div
                  className={cx(
                    '-ml-px overflow-hidden rounded-md border border-divider bg-white',
                    width === 'clamped' ? 'w-[400px]' : '-mr-px',
                    withSearchIcon && 'rounded-t-none'
                  )}
                >
                  {!result ? (
                    <div className="flex max-h-[180px] flex-col overflow-y-auto bg-white">
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
                            <button
                              key={index}
                              onClick={() => setResult(result)}
                              className="w-full px-3 py-2 hover:bg-grey-01"
                            >
                              <div className="truncate text-button text-text">{result.name}</div>
                              {isShowingIds && (
                                <div className="mb-2 mt-1 text-footnoteMedium text-grey-04">{result.id}</div>
                              )}
                              <div className="mt-1 flex items-center gap-1">
                                <div className="inline-flex gap-0">
                                  {(result.spaces ?? []).slice(0, 3).map(space => (
                                    <div
                                      key={space.spaceId}
                                      className="-ml-[4px] h-[14px] w-[14px] overflow-clip rounded-sm border border-white first:ml-0"
                                    >
                                      <img
                                        src={getImagePath(space.image)}
                                        alt=""
                                        className="h-full w-full object-cover"
                                      />
                                    </div>
                                  ))}
                                </div>
                                <div className="text-[0.75rem] font-medium text-grey-04">
                                  {(result.spaces ?? []).length} {pluralize('space', (result.spaces ?? []).length)}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between border-b border-divider bg-white">
                        <div className="flex-1">
                          <button onClick={() => setResult(null)} className="p-2">
                            <ArrowLeft color="grey-04" />
                          </button>
                        </div>
                        <span className="p-2 text-smallButton text-grey-04">Select space version</span>
                        {/* <div className="flex flex-1 justify-end">
                     @TODO add settings
                    <button className="p-2 text-smallButton text-grey-04">Settings</button>
                  </div> */}
                      </div>
                      <div className="flex max-h-[180px] flex-col overflow-y-auto bg-white">
                        <button
                          onClick={() => {
                            setResult(null);
                            onDone({
                              id: result.id,
                              name: result.name,
                            });
                            onQueryChange('');
                          }}
                          className="flex min-h-[60px] w-full items-center justify-between border-b border-divider px-3 py-2 hover:bg-grey-01"
                        >
                          <div>
                            <div className="truncate text-button text-text">Any space</div>
                            <div className="mt-0.5 text-footnote text-grey-04">
                              Geo will select a space based on its own ranking
                            </div>
                          </div>
                          <div className="flex items-center">
                            {(result.spaces ?? []).slice(0, 3).map(space => (
                              <div
                                key={space.spaceId}
                                className="-ml-[4px] h-[14px] w-[14px] overflow-clip rounded-sm border border-white first:ml-0"
                              >
                                <img src={getImagePath(space.image)} alt="" className="h-full w-full object-cover" />
                              </div>
                            ))}
                          </div>
                        </button>
                        {(result.spaces ?? []).map((space, index) => (
                          <button
                            key={index}
                            onClick={() => {
                              setResult(null);
                              onDone({
                                id: result.id,
                                name: result.name,
                                space: SpaceId(space.spaceId),
                              });
                              onQueryChange('');
                            }}
                            className="flex w-full items-center justify-between border-b border-divider px-3 py-2 hover:bg-grey-01"
                          >
                            <div>
                              <div className="truncate text-button text-text">{space.name}</div>
                              <div>
                                <Tag>Space</Tag>
                              </div>
                            </div>
                            <div>
                              <div className="h-[32px] w-[32px] overflow-clip rounded-md">
                                <img src={getImagePath(space.image)} alt="" className="h-full w-full object-cover" />
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {!result && (
                    <div className="flex w-full items-center justify-between px-3 py-1.5">
                      <button onClick={handleShowIds} className="inline-flex items-center gap-1.5">
                        <Toggle checked={isShowingIds} />
                        <div className="text-footnoteMedium text-grey-04">Show IDs</div>
                      </button>
                      <button onClick={onCreateNewEntity} className="text-smallButton text-grey-04">
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
