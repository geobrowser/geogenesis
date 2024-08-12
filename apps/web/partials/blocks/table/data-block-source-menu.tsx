'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
import Fuse from 'fuse.js';

import { useState } from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useSpaces } from '~/core/hooks/use-spaces';
import { useTableBlock } from '~/core/state/table-block-store';
import type { Space } from '~/core/types';
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
  const sourceIsSpaces = Array.isArray(source);

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
          <MenuItem active={source === 'collection'}>
            <button onClick={() => null} className="flex w-full items-center justify-between gap-2">
              <span className="text-button text-text">{collectionName || 'New collection'}</span>
              {source === 'collection' && <Check />}
            </button>
          </MenuItem>
          <MenuItem active={sourceIsSpaces}>
            <button onClick={() => setView('spaces')} className="flex w-full items-center justify-between gap-2">
              <div>
                <div className="text-button text-text">Spaces</div>
                {sourceIsSpaces && source.length > 0 && (
                  <div className="mt-1.5 flex items-center gap-1">
                    <div className="inline-flex">
                      {source.map(spaceId => {
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
                    <div className="text-footnoteMedium text-grey-04">{source.length} selected</div>
                  </div>
                )}
              </div>
              <ChevronRight />
            </button>
          </MenuItem>
          <MenuItem active={source === 'geo'}>
            <button
              onClick={() => {
                const newFilterState = filterState.filter(filter => filter.columnId !== SYSTEM_IDS.SPACE);
                setFilterState(newFilterState);
              }}
              className="flex w-full flex-col gap-1"
            >
              <div className="flex w-full justify-between gap-2">
                <div className="text-button text-text">All of Geo</div>
                {source === 'geo' && <Check />}
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

const options = {
  keys: ['spaceConfig.name'],
  ignoreLocation: true,
};

type SpacesMenuProps = {
  onBack: () => void;
};

export const SpacesMenu = ({ onBack }: SpacesMenuProps) => {
  const [query, setQuery] = useState<string>('');
  const { filterState, setFilterState } = useTableBlock();

  const { spaces } = useSpaces();
  const searchableSpaces = spaces.filter(space => space.type === 'PUBLIC' && !!space?.spaceConfig?.name);

  const fuse = new Fuse(searchableSpaces, options);
  const results = fuse.search(query);
  const renderedSpaces = query.length > 0 ? results.map(space => space.item) : spaces;

  const handleToggleSpace = (space: Space) => {
    if (filterState.find(filter => filter.columnId === SYSTEM_IDS.SPACE && filter.value === space.id)) {
      const newFilterState = filterState.filter(filter => filter.value !== space.id);
      setFilterState(newFilterState);
    } else {
      const newFilterState = [
        ...filterState,
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
        {renderedSpaces.map(space => {
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
