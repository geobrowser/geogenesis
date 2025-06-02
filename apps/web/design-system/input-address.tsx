import { SystemIds } from '@graphprotocol/grc-20';
import { INITIAL_RELATION_INDEX_VALUE } from '@graphprotocol/grc-20/constants';
import * as Popover from '@radix-ui/react-popover';
import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { useAtom } from 'jotai';
import pluralize from 'pluralize';

import * as React from 'react';
import { startTransition, useState } from 'react';

import { StoreRelation } from '~/core/database/types';
import { DB } from '~/core/database/write';
import { Feature } from '~/core/hooks/use-place-search';
import { usePlaceSearch } from '~/core/hooks/use-place-search';
import { ID } from '~/core/id';
import { EntityId } from '~/core/io/schema';
import type { RelationValueType } from '~/core/types';
import { getImagePath } from '~/core/utils/utils';
import { GeoPoint } from '~/core/utils/utils';

import { Tag } from '~/design-system/tag';
import { Toggle } from '~/design-system/toggle';
import { Tooltip } from '~/design-system/tooltip';

import { ArrowLeft } from './icons/arrow-left';
import { InfoSmall } from './icons/info-small';
import { Search } from './icons/search';
import { TopRanked } from './icons/top-ranked';
import { ResizableContainer } from './resizable-container';
import { Truncate } from './truncate';
import { showingIdsAtom } from '~/atoms';
import { ADDRESS_PROPERTY, MAPBOX_PROPERTY, PLACE_TYPE, SOURCE_DATABASE_IDENTIFIER_PROPERTY, SOURCES_TYPE } from '~/core/system-ids';

type SearchPlaceEntityProps = {
  spaceId: string;
  relationValueTypes?: RelationValueType[];
  placeholder?: string;
  containerClassName?: string;
  inputClassName?: string;
  variant?: 'floating' | 'fixed';
  width?: 'clamped' | 'full';
  withSearchIcon?: boolean;
  onCreateEntity?: (result: { id: EntityId; name: string | null; space?: EntityId; verified?: boolean }) => void;
  onDone?: (
    result: { id: EntityId; name: string | null; space?: EntityId; verified?: boolean },
    fromCreateFn?: boolean
  ) => void;
};

const inputStyles = cva('', {
  variants: {
    fixed: {
      true: 'm-0 block w-full resize-none bg-transparent p-0 text-body placeholder:text-grey-03 focus:outline-none focus:placeholder:text-grey-03',
    },
    floating: {
      true: 'm-0 block w-full resize-none bg-transparent p-2 text-body placeholder:text-grey-03 focus:outline-none focus:placeholder:text-grey-03',
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

export const InputPlace = ({
  relationValueTypes = [],
  placeholder = 'Find or create...',
  width = 'clamped',
  variant = 'fixed',
  containerClassName = '',
  inputClassName = '',
  withSearchIcon = false,
  onDone,
  spaceId,
}: SearchPlaceEntityProps) => {
  const [isShowingIds, setIsShowingIds] = useAtom(showingIdsAtom);
  const [result, setResult] = useState<Feature[] | null>(null);

  const filterByTypes = relationValueTypes.length > 0 ? relationValueTypes.map(r => r.typeId) : undefined;

  const { results, onQueryChange, query, isEmpty, isLoading, resultEntities, isEntitiesLoading } = usePlaceSearch({
    filterByTypes,
  });

  if (query === '' && result !== null) {
    startTransition(() => {
      setResult(null);
    });
  }

  const handleShowIds = () => {
    setIsShowingIds(!isShowingIds);
  };

  //Create relation helper
  const createRelation = (
    toEntityId: string,
    toEntityName: string,
    fromEntityId: string,
    fromEntityName: string,
    attributeId: string,
    attributeName: string
  ) => {
    const newRelationId = ID.createEntityId();

    const newRelation: StoreRelation = {
      id: newRelationId,
      space: spaceId,
      index: INITIAL_RELATION_INDEX_VALUE,
      typeOf: {
        id: EntityId(attributeId),
        name: attributeName,
      },
      fromEntity: {
        id: EntityId(fromEntityId),
        name: fromEntityName,
      },
      toEntity: {
        id: EntityId(toEntityId),
        name: toEntityName,
        renderableType: 'RELATION',
        value: EntityId(toEntityId),
      },
    };

    DB.upsertRelation({
      relation: newRelation,
      spaceId,
    });

    return newRelationId;
  };

  //Create/import logic
  const createPlaceWithAddress = async (result: Feature) => {
    const addressEntityId = ID.createEntityId();
    const placeEntityId = ID.createEntityId();

    //Get coordinates from mapbox
    const coordinates = await GeoPoint.fetchCoordinatesFromMapbox(result.mapbox_id);

    // Create Address entity
    DB.upsertMany(
      coordinates
        ? [
            {
              entityId: addressEntityId,
              attributeId: SystemIds.NAME_ATTRIBUTE,
              attributeName: 'Name',
              entityName: result.text,
              value: {
                type: 'TEXT',
                value: result.text,
              },
            },
            {
              entityId: addressEntityId,
              attributeId: SystemIds.GEO_LOCATION_PROPERTY,
              attributeName: 'Geo Location',
              entityName: result.text,
              value: {
                type: 'POINT',
                value: GeoPoint.formatCoordinates(coordinates.latitude, coordinates.longitude),
              },
            },
          ]
        : [
            {
              entityId: addressEntityId,
              attributeId: SystemIds.NAME_ATTRIBUTE,
              attributeName: 'Name',
              entityName: result.text,
              value: {
                type: 'TEXT',
                value: result.text,
              },
            },
          ],
      spaceId
    );

    //Add type to Address entity
    createRelation(
      ADDRESS_PROPERTY, // TODO use system ID
      'Address',
      addressEntityId,
      result.text,
      SystemIds.TYPES_ATTRIBUTE,
      'Types'
    );

    //Add source to Address entity
    const newRelationSourceId = createRelation(
      MAPBOX_PROPERTY, // TODO use system ID
      'Mapbox',
      addressEntityId,
      result.text,
      SOURCES_TYPE, // TODO use system ID
      'Sources'
    );

    //Add source db identifier to address
    DB.upsert(
      {
        entityId: newRelationSourceId,
        attributeId: SOURCE_DATABASE_IDENTIFIER_PROPERTY, // TODO use system ID
        attributeName: 'Source database identifier',
        entityName: '',
        value: {
          type: 'TEXT',
          value: result.mapbox_id,
        },
      },
      spaceId
    );

    //Add relations to properties sources (name/geo location)
    createRelation(
      SystemIds.NAME_ATTRIBUTE,
      'Name',
      newRelationSourceId,
      '',
      '49frzgU1girWK2NNzXHJWn',
      'Properties Sourced'
    );
    createRelation(
      SystemIds.GEO_LOCATION_PROPERTY,
      'Geo Location',
      newRelationSourceId,
      '',
      '49frzgU1girWK2NNzXHJWn',
      'Properties Sourced'
    );

    //Create place entity
    DB.upsert(
      {
        entityId: placeEntityId,
        attributeId: SystemIds.NAME_ATTRIBUTE,
        attributeName: 'Name',
        entityName: result.place_name,
        value: {
          type: 'TEXT',
          value: result.place_name,
        },
      },
      spaceId
    );

    //Add source to Place entity
    const newRelationPlaceSourceId = createRelation(
      MAPBOX_PROPERTY, // TODO use system ID
      'Mapbox',
      placeEntityId,
      result.place_name,
      SOURCES_TYPE, // TODO use system ID
      'Sources'
    );

    //Add source db identifier to place
    DB.upsert(
      {
        entityId: newRelationPlaceSourceId,
        attributeId: SOURCE_DATABASE_IDENTIFIER_PROPERTY, // TODO use system ID
        attributeName: 'Source database identifier',
        entityName: '',
        value: {
          type: 'TEXT',
          value: result.mapbox_id,
        },
      },
      spaceId
    );

    //Add relations to properties sources (name/address)
    createRelation(
      SystemIds.NAME_ATTRIBUTE,
      'Name',
      newRelationPlaceSourceId,
      '',
      '49frzgU1girWK2NNzXHJWn',
      'Properties Sourced'
    );
    createRelation(
      ADDRESS_PROPERTY, // TODO use system ID
      'Address',
      newRelationPlaceSourceId,
      '',
      '49frzgU1girWK2NNzXHJWn',
      'Properties Sourced'
    );

    // TODO use system ID
    createRelation(PLACE_TYPE, 'Place', placeEntityId, result.place_name, SystemIds.TYPES_ATTRIBUTE, 'Types');

    //Create relation in place entity with address entity
    createRelation(
      addressEntityId,
      result.text,
      placeEntityId,
      result.place_name,
      ADDRESS_PROPERTY, // TODO use system ID
      'Address'
    );

    //Create relation between place entity and current working entity
    onDone?.({ id: placeEntityId, name: result.place_name }, true);
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
                        {isEntitiesLoading && (
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
                            {resultEntities?.map((resultEn, index) => (
                              <div key={`${index}-entities`} className="w-full">
                                <div className="p-1">
                                  <button
                                    onClick={() => {
                                      onDone?.({ id: resultEn.id, name: resultEn.name }, true);
                                    }}
                                    className="relative z-10 flex w-full flex-col rounded-md px-3 py-2 transition-colors duration-150 hover:bg-grey-01 focus:bg-grey-01 focus:outline-none"
                                  >
                                    {isShowingIds && (
                                      <div className="mb-2 text-[0.6875rem] text-grey-04">ID · {resultEn.id}</div>
                                    )}
                                    <div className="max-w-full truncate text-resultTitle text-text">
                                      {resultEn.name}
                                    </div>
                                    <div className="mt-1.5 flex items-center gap-1.5">
                                      <div className="flex shrink-0 items-center gap-1">
                                        <span className="inline-flex size-[12px] items-center justify-center rounded-sm border border-grey-04">
                                          <TopRanked color="grey-04" />
                                        </span>
                                        <span className="text-[0.875rem] text-text">Top-ranked</span>
                                      </div>
                                      {resultEn.types.length > 0 && (
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
                                            {resultEn.types.slice(0, 3).map(type => (
                                              <Tag key={type.id}>{type.name}</Tag>
                                            ))}
                                            {resultEn.types.length > 3 ? (
                                              <Tag>{`+${resultEn.types.length - 3}`}</Tag>
                                            ) : null}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                    {resultEn.description && (
                                      <>
                                        <Truncate maxLines={3} shouldTruncate variant="footnote" className="mt-2">
                                          <p className="!text-[0.75rem] leading-[1.2] text-grey-04">
                                            {resultEn.description}
                                          </p>
                                        </Truncate>
                                      </>
                                    )}
                                  </button>
                                </div>
                                <div className="-mt-2 p-1">
                                  <button className="relative z-0 flex w-full items-center justify-between rounded-md px-3 py-1.5 transition-colors duration-150 hover:bg-grey-01">
                                    <div className="flex items-center gap-1">
                                      <div className="inline-flex gap-0">
                                        {(resultEn.spaces ?? []).slice(0, 3).map(space => (
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
                                        {(resultEn.spaces ?? []).length}{' '}
                                        {pluralize('space', (resultEn.spaces ?? []).length)}
                                      </div>
                                    </div>
                                    <div className="text-[0.875rem] text-grey-04">Select space</div>
                                  </button>
                                </div>
                              </div>
                            ))}
                            {/* Results from mapbox API */}
                            {results.map((result, index) => (
                              <div key={index} className="w-full">
                                <div className="p-1">
                                  <button
                                    onClick={() => {
                                      setResult(null);
                                      createPlaceWithAddress(result);
                                      onQueryChange('');
                                    }}
                                    className="relative z-10 flex w-full flex-col rounded-md px-3 py-2 transition-colors duration-150 hover:bg-grey-01 focus:bg-grey-01 focus:outline-none"
                                  >
                                    <div className="flex w-full justify-between">
                                      <div className="max-w-full truncate text-resultTitle text-text">
                                        {result.place_name}
                                      </div>
                                      <button className="text-[0.875rem] font-normal text-grey-04">Import</button>
                                    </div>

                                    {result.text && (
                                      <>
                                        <Truncate maxLines={3} shouldTruncate variant="footnote" className="mt-1">
                                          <p className="!text-[0.875rem] leading-[1.2] text-text">{result.text}</p>
                                        </Truncate>
                                      </>
                                    )}
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
                    </>
                  )}
                  {!result && (
                    <div className="flex w-full items-center justify-between border-t border-grey-02 px-4 py-2">
                      <button onClick={handleShowIds} className="inline-flex items-center gap-1.5">
                        <Toggle checked={isShowingIds} />
                        <div className="text-[0.875rem] text-grey-04">IDs</div>
                      </button>
                      <button className="text-resultLink text-ctaHover">Create new</button>
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
