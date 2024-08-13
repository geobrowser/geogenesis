'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
import { useQuery } from '@tanstack/react-query';
import { Effect, Either } from 'effect';

import { useState } from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import { useDebouncedValue } from '~/core/hooks/use-debounced-value';
import { useSpaces } from '~/core/hooks/use-spaces';
import { SpaceMetadataDto } from '~/core/io/dto';
import { Space } from '~/core/io/dto/spaces';
import { SubstreamSpace } from '~/core/io/schema';
import { spaceMetadataFragment } from '~/core/io/subgraph/fragments';
import { graphql } from '~/core/io/subgraph/graphql';
import { useTableBlock } from '~/core/state/table-block-store';
import type { OmitStrict } from '~/core/types';
import { getImagePath } from '~/core/utils/utils';
import { valueTypes } from '~/core/value-types';

import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { Check } from '~/design-system/icons/check';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { Close } from '~/design-system/icons/close';
import { Input } from '~/design-system/input';
import { MenuItem } from '~/design-system/menu';

type View = 'initial' | 'spaces';

type DataBlockSourceMenuProps = {
  collectionName?: string;
  onBack?: () => void;
};

export const DataBlockSourceMenu = ({
  collectionName = 'New collection',
  onBack = () => null,
}: DataBlockSourceMenuProps) => {
  const [view, setView] = useState<View>('initial');
  const { spaces } = useSpaces();
  const { filterState, setFilterState, source } = useTableBlock();

  return (
    <>
      {view === 'initial' && (
        <>
          <div className="border-b border-grey-02">
            <button onClick={onBack} className="flex w-full items-center gap-1 p-2">
              <ArrowLeft color="grey-04" />
              <span className="text-smallButton text-grey-04">Back</span>
            </button>
          </div>
          <MenuItem active={source.type === 'collection'}>
            <button onClick={() => null} className="flex w-full items-center justify-between gap-2">
              <span className="text-button text-text">{collectionName || 'New collection'}</span>
              {source.type === 'collection' && <Check />}
            </button>
          </MenuItem>
          <MenuItem active={source.type === 'spaces'}>
            <button onClick={() => setView('spaces')} className="flex w-full items-center justify-between gap-2">
              <div>
                <div className="text-button text-text">Spaces</div>
                {source.type === 'spaces' && source.value.length > 0 && (
                  <div className="mt-1.5 flex items-center gap-1">
                    <div className="inline-flex">
                      {source.value.map(spaceId => {
                        const selectedSpace = spaces.find(space => space.id === spaceId);

                        if (!selectedSpace) return null;

                        return (
                          <div key={selectedSpace.id} className="-ml-1.5 rounded-sm border border-white first:-ml-0">
                            <img
                              src={getImagePath(selectedSpace.spaceConfig?.image ?? '') ?? PLACEHOLDER_SPACE_IMAGE}
                              className="h-[12px] w-[12px] rounded-sm"
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-footnoteMedium text-grey-04">{source.value.length} selected</div>
                  </div>
                )}
              </div>
              <ChevronRight />
            </button>
          </MenuItem>
          <MenuItem active={source.type === 'geo'}>
            <button
              onClick={() => {
                const newFilterState = filterState.filter(filter => filter.columnId !== SYSTEM_IDS.SPACE);
                setFilterState(newFilterState);
              }}
              className="flex w-full flex-col gap-1"
            >
              <div className="flex w-full justify-between gap-2">
                <div className="text-button text-text">All of Geo</div>
                {source.type === 'geo' && <Check />}
              </div>
              <div className="mt-0.5 text-footnote text-grey-04">
                Fields limited to Name, Description, Types, Cover and Avatar
              </div>
            </button>
          </MenuItem>
        </>
      )}
      {view === 'spaces' && <SpacesMenu onBack={() => setView('initial')} />}
    </>
  );
};

type SpacesMenuProps = {
  onBack: () => void;
};

type ReducedSpace = OmitStrict<
  Space,
  | 'members'
  | 'editors'
  | 'mainVotingPluginAddress'
  | 'memberAccessPluginAddress'
  | 'personalSpaceAdminPluginAddress'
  | 'spacePluginAddress'
  | 'type'
>;

export const SpacesMenu = ({ onBack }: SpacesMenuProps) => {
  const { query, setQuery, spaces: queriedSpaces } = useSpacesQuery();
  const { filterState, setFilterState } = useTableBlock();

  const handleToggleSpace = (space: ReducedSpace) => {
    if (filterState.find(filter => filter.columnId === SYSTEM_IDS.SPACE && filter.value === space.id)) {
      const newFilterState = filterState.filter(filter => filter.value !== space.id);
      setFilterState(newFilterState);
    } else {
      const newFilterState = [
        // temporarily restricted to one space
        // @TODO remove array filter to support multiple spaces
        ...filterState.filter(filter => filter.columnId !== SYSTEM_IDS.SPACE),
        {
          valueType: valueTypes[SYSTEM_IDS.TEXT],
          columnId: SYSTEM_IDS.SPACE,
          value: space.id,
          valueName: null,
        },
      ];

      setFilterState(newFilterState);
    }
  };

  return (
    <>
      <div className="border-b border-grey-02">
        <button onClick={onBack} className="flex w-full items-center gap-1 p-2">
          <ArrowLeft color="grey-04" />
          <span className="text-smallButton text-grey-04">Back</span>
        </button>
      </div>
      <div className="p-1">
        <Input withSearchIcon placeholder="Search..." value={query} onChange={event => setQuery(event.target.value)} />
      </div>
      <div className="max-h-[273px] w-full overflow-y-auto">
        {queriedSpaces.map(space => {
          const active = !!filterState.find(
            filter => filter.columnId === SYSTEM_IDS.SPACE && filter.value === space.id
          );

          return (
            <MenuItem key={space.id} onClick={() => handleToggleSpace(space)} active={active} className="group">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0">
                  <img
                    src={getImagePath(space.spaceConfig?.image ?? '') ?? PLACEHOLDER_SPACE_IMAGE}
                    className="h-[12px] w-[12px] rounded-sm"
                  />
                </div>
                <div className="flex-grow truncate text-button text-text">{space.spaceConfig?.name}</div>
                {active && (
                  <div className="relative text-grey-04">
                    <Check />
                    <div className="absolute inset-0 flex items-center justify-center bg-grey-01 opacity-0 group-hover:opacity-100">
                      <Close />
                    </div>
                  </div>
                )}
              </div>
            </MenuItem>
          );
        })}
      </div>
    </>
  );
};

const spacesQuery = (name: string) => `
  {
    spaces(
      filter: { spacesMetadata: { some: { entity: { name: { includesInsensitive: "${name}" } } } } }
      first: 10
    ) {
      nodes {
        id
        daoAddress
        spaceMembers {
          totalCount
        }
        spaceEditors {
          totalCount
        }
        spacesMetadata {
          nodes {
            entity {
              ${spaceMetadataFragment}
            }
          }
        }
      }
    }
  }
`;

interface NetworkResult {
  spaces: {
    nodes: (Pick<SubstreamSpace, 'spacesMetadata' | 'id' | 'daoAddress'> & {
      spaceMembers: { totalCount: number };
      spaceEditors: { totalCount: number };
    })[];
  };
}

function useSpacesQuery() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 200);

  const { data } = useQuery({
    queryKey: ['spaces-by-name', debouncedQuery],
    queryFn: async ({ signal }) => {
      const queryEffect = graphql<NetworkResult>({
        query: spacesQuery(query),
        endpoint: Environment.getConfig().api,
        signal,
      });

      const resultOrError = await Effect.runPromise(Effect.either(queryEffect));

      if (Either.isLeft(resultOrError)) {
        const error = resultOrError.left;

        switch (error._tag) {
          case 'AbortError':
            // Right now we re-throw AbortErrors and let the callers handle it. Eventually we want
            // the caller to consume the error channel as an effect. We throw here the typical JS
            // way so we don't infect more of the codebase with the effect runtime.
            throw error;
          case 'GraphqlRuntimeError':
            console.error(
              `Encountered runtime graphql error in spaces-by-name.

              queryString: ${spacesQuery(query)}
              `,
              error.message
            );

            return {
              spaces: {
                nodes: [],
              },
            };

          default:
            console.error(`${error._tag}: Unable to fetch spaces in spaces-by-name`);

            return {
              spaces: {
                nodes: [],
              },
            };
        }
      }

      return resultOrError.right;
    },
  });

  if (!data) {
    return {
      query,
      setQuery,
      spaces: [],
    };
  }

  const spaces = data?.spaces?.nodes.map(s => {
    return {
      id: s.id,
      daoAddress: s.daoAddress,
      spaceConfig: SpaceMetadataDto(s.id, s.spacesMetadata.nodes[0].entity),
      totalMembers: s?.spaceMembers.totalCount ?? 0,
      totalEditors: s?.spaceEditors.totalCount ?? 0,
    };
  });

  return {
    query,
    setQuery,
    spaces,
  };
}
