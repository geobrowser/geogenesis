import { SYSTEM_IDS } from '@geogenesis/sdk';
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
import { Tag } from '~/design-system/tag';
import { Toggle } from '~/design-system/toggle';
import { Tooltip } from '~/design-system/tooltip';

import { ArrowLeft } from './icons/arrow-left';
import { InfoSmall } from './icons/info-small';
import { RightArrowLong } from './icons/right-arrow-long';
import { Search } from './icons/search';
import { ResizableContainer } from './resizable-container';
import { Spacer } from './spacer';
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
  /** When `withSelectSpace` is true, the <SelectEntity> component allows you to optionally pick a `spaceId` and whether or not that space has been verified. When false, the  <SelectEntity> component only selects the `entityId`. */
  withSelectSpace?: boolean;
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
  withSelectSpace = true,
}: SelectEntityProps) => {
  const [isVerified, setIsVerified] = useState<boolean>(false);
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

    // @NOTE The only place we're currently not using `withSelectSpace` for now is for the space
    // creation flow, which doesn't create new entities. So we don't want to upsert a name triple of
    // an unused entity if "Create new" is selected in that flow. This check should probably be
    // moved to a separate prop.
    if (withSelectSpace) {
      // Create new entity with name and types
      upsert(
        {
          entityId: newEntityId,
          attributeId: SYSTEM_IDS.NAME_ATTRIBUTE,
          entityName: query,
          attributeName: 'Name',
          value: {
            type: 'TEXT',
            value: query,
          },
        },
        spaceId
      );
    }

    // This component is used in many different use-cases across the system, so we
    // need to be able to pass in a callback. onCreateEntity is used to enable to
    // caller to add arbitrary data to an entity when it's created.
    //
    // e.g., you're in a collection and create a new entity, we want to add the current
    // filters to the created entity. This enables the caller to hook into the creation.
    if (onCreateEntity) {
      onCreateEntity({ id: newEntityId, name: query });
      if (!withSelectSpace) {
        onQueryChange('');
      }
    }
    onDone({ id: newEntityId, name: query });
    if (withSelectSpace) {
      setToast(<EntityCreatedToast entityId={newEntityId} spaceId={spaceId} />);
    }
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
              className="z-[9999] w-[var(--radix-popper-anchor-width)]"
              forceMount
            >
              <div className={cx(variant === 'fixed' && 'pt-1', width === 'full' && 'w-full')}>
                <div
                  className={cx(
                    '-ml-px overflow-hidden rounded-md border border-divider bg-white',
                    width === 'clamped' ? 'w-[400px]' : '-mr-px',
                    withSearchIcon && 'rounded-t-none'
                  )}
                >
                  {!result ? (
                    <ResizableContainer>
                      <div className="flex max-h-[180px] flex-col overflow-y-auto overflow-x-clip bg-white">
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
                                      if (withSelectSpace) {
                                        setResult(null);
                                        onDone({
                                          id: result.id,
                                          name: result.name,
                                        });
                                        onQueryChange('');
                                      } else {
                                        onDone({
                                          id: result.id,
                                          name: result.name,
                                        });
                                        onQueryChange('');
                                      }
                                    }}
                                    className="relative z-10 flex w-full flex-col rounded-md px-2 py-1 transition-colors duration-150 hover:bg-grey-01 focus:bg-grey-01 focus:outline-none"
                                  >
                                    <div className="max-w-full truncate text-button text-text">{result.name}</div>
                                    {result.types.length > 0 && (
                                      <>
                                        <Spacer height={4} />
                                        <div className="flex items-center gap-1.5">
                                          {result.types.map(type => (
                                            <Tag key={type.id}>{type.name}</Tag>
                                          ))}
                                        </div>
                                        {withSelectSpace && <Spacer height={4} />}
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

                                    {isShowingIds && (
                                      <div className="mb-2 mt-1 text-footnoteMedium text-grey-04">
                                        Entity ID &mdash; {result.id}
                                      </div>
                                    )}

                                    <div className="mt-1 inline-flex items-center gap-1 text-footnoteMedium text-grey-04">
                                      {!withSelectSpace ? (
                                        <>
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
                                          {(result.spaces ?? []).length}{' '}
                                          {pluralize('space', (result.spaces ?? []).length)}
                                        </>
                                      ) : (
                                        <span>Any space</span>
                                      )}
                                    </div>
                                  </button>
                                </div>
                                {withSelectSpace && (
                                  <div className="-mt-2 p-1">
                                    <button
                                      onClick={() => setResult(result)}
                                      className="relative z-0 flex w-full items-center justify-between rounded-md px-2 py-1 transition-colors duration-150 hover:bg-grey-01"
                                    >
                                      <div className="flex items-center gap-1">
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
                                          {(result.spaces ?? []).length}{' '}
                                          {pluralize('space', (result.spaces ?? []).length)}
                                        </div>
                                      </div>
                                      <div className="size-[12px] *:size-[12px]">
                                        <RightArrowLong color="grey-04" />
                                      </div>
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
                        <div className="flex-1">
                          <button onClick={() => setResult(null)} className="p-2">
                            <ArrowLeft color="grey-04" />
                          </button>
                        </div>
                        <div className="inline-flex flex-1 items-center gap-1 p-2 text-button text-text">
                          <span>Select a space</span>
                          <Tooltip
                            trigger={
                              <div className="*:size-[12px]">
                                <InfoSmall color="grey-04" />
                              </div>
                            }
                            label={`Selecting a specific space to link to will mean that any time you access this entity, it’ll take you to that space’s view on this entity.`}
                            position="top"
                            variant="light"
                          />
                        </div>
                        <div className="flex-1" />
                      </div>
                      <div className="flex w-full items-center justify-between bg-grey-01 px-3 py-1.5">
                        <div className="inline-flex items-center gap-1">
                          <div className="inline-flex items-center gap-1.5">
                            <div className="text-footnoteMedium text-grey-04">Set relation as verified</div>
                          </div>
                          <Tooltip
                            trigger={
                              <div className="*:size-[12px]">
                                <InfoSmall color="grey-04" />
                              </div>
                            }
                            label={`Different versions of the same entity can live in one or multiple spaces. You can select which version of that entity you feel is the source of truth for the most legitimate information.`}
                            position="top"
                            variant="light"
                          />
                        </div>
                        <button onClick={() => setIsVerified(!isVerified)}>
                          <Toggle checked={isVerified} />
                        </button>
                      </div>
                      <div className="flex max-h-[180px] flex-col overflow-y-auto overflow-x-clip bg-white">
                        {(result.spaces ?? []).map((space, index) => (
                          <button
                            key={index}
                            onClick={() => {
                              setResult(null);
                              onDone({
                                id: result.id,
                                name: result.name,
                                space: EntityId(space.spaceId),
                                verified: isVerified,
                              });
                              onQueryChange('');
                            }}
                            className="flex w-full items-center justify-between border-t border-divider px-3 py-2 hover:bg-grey-01"
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
