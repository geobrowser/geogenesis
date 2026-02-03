'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';
import * as Popover from '@radix-ui/react-popover';
import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { useAtom } from 'jotai';
import pluralize from 'pluralize';

import * as React from 'react';
import { startTransition, useState } from 'react';

import { Feature } from '~/core/hooks/use-place-search';
import { usePlaceSearch } from '~/core/hooks/use-place-search';
import { ID } from '~/core/id';
import { EntityId } from '~/core/io/substream-schema';
import { useMutate } from '~/core/sync/use-mutate';
import {
  ADDRESS_PROPERTY,
  ADDRESS_TYPE,
  MAPBOX_PROPERTY,
  PLACE_TYPE,
  PROPERTIES_SOURCED,
  RELATIONS_SOURCED,
  SOURCES_TYPE,
  SOURCE_DATABASE_IDENTIFIER_PROPERTY,
} from '~/core/system-ids';
import { Relation } from '~/core/types';
import { GeoPoint } from '~/core/utils/utils';

import { NativeGeoImage } from '~/design-system/geo-image';
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

type SearchPlaceEntityProps = {
  spaceId: string;
  relationValueTypes?: { id: string; name: string | null }[];
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
  const { storage } = useMutate();

  const { results, onQueryChange, query, isEmpty, resultEntities, isEntitiesLoading } = usePlaceSearch();

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

    const newRelation: Relation = {
      id: newRelationId,
      entityId: newRelationId,
      spaceId,
      type: {
        id: attributeId,
        name: attributeName,
      },
      fromEntity: {
        id: fromEntityId,
        name: fromEntityName,
      },
      toEntity: {
        id: toEntityId,
        name: toEntityName,
        value: toEntityId,
      },
      renderableType: 'RELATION',
    };

    storage.relations.set(newRelation);

    return newRelationId;
  };

  // Create/import logic
  const createPlaceWithAddress = async (result: Feature) => {
    const addressEntityId = ID.createEntityId();
    const placeEntityId = ID.createEntityId();

    // Get coordinates from mapbox
    const coordinates = await GeoPoint.fetchCoordinatesFromMapbox(result.mapbox_id);

    // Create Address entity - Set name
    storage.entities.name.set(addressEntityId, spaceId, result.text);

    // Set geo location if coordinates available
    if (coordinates) {
      storage.values.set({
        id: ID.createValueId({
          entityId: addressEntityId,
          propertyId: SystemIds.GEO_LOCATION_PROPERTY,
          spaceId,
        }),
        entity: {
          id: addressEntityId,
          name: result.text,
        },
        property: {
          id: SystemIds.GEO_LOCATION_PROPERTY,
          name: 'Geo Location',
          dataType: 'POINT',
        },
        spaceId,
        value: GeoPoint.formatCoordinates(coordinates.latitude, coordinates.longitude),
        options: null,
      });
    }

    // Add type to Address entity
    createRelation(ADDRESS_TYPE, 'Address', addressEntityId, result.text, SystemIds.TYPES_PROPERTY, 'Types');

    // Add source to Address entity
    const newRelationSourceId = createRelation(
      MAPBOX_PROPERTY, // TODO use system ID
      'Mapbox',
      addressEntityId,
      result.text,
      SOURCES_TYPE, // TODO use system ID
      'Sources'
    );

    // TODO: Add source db identifier to address (simplified for v2 migration)
    storage.values.set({
      id: ID.createValueId({
        entityId: newRelationSourceId,
        propertyId: SOURCE_DATABASE_IDENTIFIER_PROPERTY,
        spaceId,
      }),
      entity: {
        id: newRelationSourceId,
        name: '',
      },
      property: {
        id: SOURCE_DATABASE_IDENTIFIER_PROPERTY,
        name: 'Source database identifier',
        dataType: 'TEXT',
      },
      spaceId,
      value: result.mapbox_id,
      options: null,
    });

    // Add relations to properties sources (name/geo location)
    createRelation(SystemIds.NAME_PROPERTY, 'Name', newRelationSourceId, '', PROPERTIES_SOURCED, 'Properties Sourced');
    createRelation(
      SystemIds.GEO_LOCATION_PROPERTY,
      'Geo Location',
      newRelationSourceId,
      '',
      PROPERTIES_SOURCED,
      'Properties Sourced'
    );

    // Create place entity
    storage.entities.name.set(placeEntityId, spaceId, result.place_name);

    // Add source to Place entity
    const newRelationPlaceSourceId = createRelation(
      MAPBOX_PROPERTY, // TODO use system ID
      'Mapbox',
      placeEntityId,
      result.place_name,
      SOURCES_TYPE, // TODO use system ID
      'Sources'
    );

    // Add source db identifier to place
    storage.values.set({
      id: ID.createValueId({
        entityId: newRelationPlaceSourceId,
        propertyId: SOURCE_DATABASE_IDENTIFIER_PROPERTY,
        spaceId,
      }),
      entity: {
        id: newRelationPlaceSourceId,
        name: '',
      },
      property: {
        id: SOURCE_DATABASE_IDENTIFIER_PROPERTY,
        name: 'Source database identifier',
        dataType: 'TEXT',
      },
      spaceId,
      value: result.mapbox_id,
      options: null,
    });

    // Add relations to properties sources (name/address)
    createRelation(
      SystemIds.NAME_PROPERTY,
      'Name',
      newRelationPlaceSourceId,
      '',
      PROPERTIES_SOURCED,
      'Properties Sourced'
    );
    const addressPropertySourcedRelationId = createRelation(
      ADDRESS_PROPERTY, // TODO use system ID
      'Address',
      newRelationPlaceSourceId,
      '',
      PROPERTIES_SOURCED,
      'Properties Sourced'
    );

    // TODO use system ID
    createRelation(PLACE_TYPE, 'Place', placeEntityId, result.place_name, SystemIds.TYPES_PROPERTY, 'Types');

    // Create relation in place entity with address entity
    createRelation(
      addressEntityId,
      result.text,
      placeEntityId,
      result.place_name,
      ADDRESS_PROPERTY, // TODO use system ID
      'Address'
    );

    // Add the address entity to "Relations sourced" on the Address property under Properties Sourced
    createRelation(
      addressEntityId,
      result.text,
      addressPropertySourcedRelationId,
      '',
      RELATIONS_SOURCED,
      'Relations Sourced'
    );

    // Create relation between place entity and current working entity
    onDone?.({ id: placeEntityId as EntityId, name: result.place_name }, true);
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
                                      onDone?.({ id: resultEn.id as EntityId, name: resultEn.name }, true);
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
                                            <NativeGeoImage
                                              value={space.image}
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
                                    onClick={async () => {
                                      setResult(null);
                                      await createPlaceWithAddress(result);
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
