import { useQuery } from '@tanstack/react-query';
import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { Effect } from 'effect';

import * as React from 'react';

import { useEffectOnce } from '~/core/hooks/use-effect-once';
import { useSearch } from '~/core/hooks/use-search';
import { EntityId } from '~/core/io/schema';
import { getEntity } from '~/core/io/v2/queries';

import { Checkbox } from '~/design-system/checkbox';
import { NativeGeoImage } from '~/design-system/geo-image';
import { TopRanked } from '~/design-system/icons/top-ranked';
import { Tag } from '~/design-system/tag';
import { Tooltip } from '~/design-system/tooltip';

import { InfoSmall } from './icons/info-small';
import { ResizableContainer } from './resizable-container';
import { Truncate } from './truncate';

type SelectSpaceProps = {
  onDone: (result: { id: string; name: string | null; space?: EntityId; verified?: boolean }) => void;
  entityId: string;
  spaceId?: string;
  verified?: boolean;
  containerClassName?: string;
  variant?: 'floating' | 'fixed';
  width?: 'clamped' | 'full';
};

const containerStyles = cva('relative z-[9999]', {
  variants: {
    width: {
      clamped: 'w-[400px]',
      full: 'w-full',
    },
  },
  defaultVariants: {
    width: 'clamped',
  },
});

export const SelectSpace = ({
  onDone,
  entityId,
  spaceId,
  verified,
  width = 'clamped',
  variant = 'floating',
  containerClassName = '',
}: SelectSpaceProps) => {
  const { isLoading: isResultLoading, query, onQueryChange, results } = useSearch();

  useEffectOnce(() => {
    onQueryChange(EntityId(entityId));
  });

  const result = results?.[0];

  const { data: spaceVersions, isLoading: isSpaceVersionsLoading } = useQuery({
    enabled: !!query && !!result?.spaces && result.spaces.length > 0,
    queryKey: ['space-versions', query, result?.spaces],
    queryFn: async () => {
      return await Promise.all(
        (result?.spaces ?? []).map(async space => {
          const entity = await Effect.runPromise(getEntity(entityId, space.id));
          return { space, entity };
        })
      );
    },
  });

  const isLoading = isResultLoading || isSpaceVersionsLoading;

  return (
    <div
      className={containerStyles({
        width,
        className: containerClassName,
      })}
    >
      <div className={cx(variant === 'fixed' && 'pt-1', width === 'full' && 'w-full')}>
        <div
          className={cx(
            '-ml-px overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg',
            width === 'clamped' ? 'w-[400px]' : '-mr-px'
          )}
        >
          <ResizableContainer>
            <div className="no-scrollbar flex max-h-[270px] flex-col overflow-y-auto overflow-x-clip bg-white">
              {isLoading && (
                <div className="w-full bg-white px-3 py-2">
                  <div className="truncate text-resultTitle text-text">Loading...</div>
                </div>
              )}
              {!isLoading && result && (
                <div className="divide-y divide-divider bg-white">
                  <div className="w-full">
                    <div className="p-1">
                      <button
                        onClick={() => {
                          onDone({
                            id: result.id,
                            name: result.name,
                            space: undefined,
                            verified: false,
                          });
                        }}
                        className={cx(
                          'relative z-10 flex w-full flex-col rounded-md px-3 py-2 transition-colors duration-150 focus:outline-none',
                          !spaceId ? 'bg-divider' : 'hover:bg-grey-01 focus:bg-grey-01'
                        )}
                      >
                        <div className="max-w-full truncate text-resultTitle text-text">{result.name}</div>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <div className="flex shrink-0 items-center gap-1">
                            <span className="inline-flex size-[12px] items-center justify-center rounded-sm border border-grey-04">
                              <TopRanked color="grey-04" />
                            </span>
                            <span className="text-[0.875rem] text-text">Top-ranked</span>
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                  {spaceVersions?.map((spaceVersion, index) => {
                    const { space, entity } = spaceVersion;

                    if (!space) return null;

                    const isSelected = spaceId === space.spaceId;

                    return (
                      <div key={index} className="w-full">
                        <div className="p-1">
                          <button
                            onClick={() => {
                              if (isSelected) return;

                              onDone({
                                id: result.id,
                                name: result.name,
                                space: EntityId(space.spaceId),
                                verified: false,
                              });
                            }}
                            className={cx(
                              'relative z-10 flex w-full flex-col rounded-md px-3 py-2 transition-colors duration-150 focus:outline-none',
                              !isSelected ? 'hover:bg-grey-01 focus:bg-grey-01' : 'cursor-default bg-divider'
                            )}
                          >
                            <div className="max-w-full truncate text-resultTitle text-text">{result.name}</div>
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <div className="flex shrink-0 items-center gap-1">
                                <div
                                  key={space.spaceId}
                                  className="-ml-[4px] h-3 w-3 overflow-clip rounded-sm border border-white first:ml-0"
                                >
                                  <NativeGeoImage value={space.image} alt="" className="h-full w-full object-cover" />
                                </div>
                                <span className="text-[0.875rem] text-text">{space.name}</span>
                              </div>
                              {entity && entity.types.length > 0 && (
                                <>
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
                                  <div className="flex items-center gap-1.5">
                                    {entity.types.slice(0, 3).map(type => (
                                      <Tag key={type.id}>{type.name}</Tag>
                                    ))}
                                    {entity.types.length > 3 ? <Tag>{`+${entity.types.length - 3}`}</Tag> : null}
                                  </div>
                                </>
                              )}
                            </div>
                            {result.description && (
                              <>
                                <Truncate maxLines={3} shouldTruncate variant="footnote" className="mt-2">
                                  <p className="!text-[0.75rem] leading-[1.2] text-grey-04">
                                    {entity?.description ?? result.description}
                                  </p>
                                </Truncate>
                              </>
                            )}
                            {isSelected && (
                              <div className="relative z-50 mt-2 flex items-center gap-1.5">
                                <Checkbox
                                  checked={verified ? true : false}
                                  onChange={event => {
                                    event.preventDefault();
                                    event.stopPropagation();

                                    onDone({
                                      id: result.id,
                                      name: result.name,
                                      space: EntityId(space.spaceId),
                                      verified: !verified,
                                    });
                                  }}
                                />
                                <span className="text-resultLink text-grey-04">Verified</span>
                                <Tooltip
                                  trigger={
                                    <div className="*:size-[12px]">
                                      <InfoSmall color="grey-04" />
                                    </div>
                                  }
                                  label={`Setting this space as verified means that you believe this space represents the most legitimate source of truth for this entity.`}
                                  position="top"
                                  variant="light"
                                />
                              </div>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </ResizableContainer>
        </div>
      </div>
    </div>
  );
};
