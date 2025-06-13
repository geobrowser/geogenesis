import { useState } from 'react';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useSource } from '~/core/blocks/data/use-source';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useSpaces } from '~/core/hooks/use-spaces';
import { useSpacesQuery } from '~/core/hooks/use-spaces-query';
import { SpaceId } from '~/core/io/schema';
import { getImagePath } from '~/core/utils/utils';

import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { Check } from '~/design-system/icons/check';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { Close } from '~/design-system/icons/close';
import { Input } from '~/design-system/input';
import { MenuItem } from '~/design-system/menu';

type View = 'initial' | 'spaces' | 'entity';

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
  const { entityId } = useDataBlock();
  const { setSource, source } = useSource();

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
          <MenuItem active={source.type === 'COLLECTION'}>
            <button
              onClick={() => setSource({ type: 'COLLECTION', value: entityId })}
              className="flex w-full items-center justify-between gap-2"
            >
              <span className="text-button text-text">{collectionName || 'New collection'}</span>
              {source.type === 'COLLECTION' && <Check />}
            </button>
          </MenuItem>

          <MenuItem active={source.type === 'SPACES'}>
            <button onClick={() => setView('spaces')} className="flex w-full items-center justify-between gap-2">
              <div>
                <div className="text-button text-text">Spaces</div>
                {source.type === 'SPACES' && source.value.length > 0 && (
                  <div className="mt-1.5 flex items-center gap-1">
                    <div className="inline-flex">
                      {source.value.map(spaceId => {
                        const selectedSpace = spaces.find(space => space.id === spaceId);
                        if (!selectedSpace) return null;

                        return (
                          <div key={selectedSpace.id} className="-ml-1.5 rounded-sm border border-white first:-ml-0">
                            <img
                              src={getImagePath(selectedSpace.entity?.image ?? '') ?? PLACEHOLDER_SPACE_IMAGE}
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
          <MenuItem active={source.type === 'GEO'}>
            <button
              onClick={() => {
                setSource({
                  type: 'GEO',
                });
              }}
              className="flex w-full flex-col gap-1"
            >
              <div className="flex w-full justify-between gap-2">
                <div className="text-button text-text">All of Geo</div>
                {source.type === 'GEO' && <Check />}
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

const SpacesMenu = ({ onBack }: SpacesMenuProps) => {
  const { query, setQuery, spaces: queriedSpaces } = useSpacesQuery();
  const { setSource, source } = useSource();

  const handleToggleSpace = (spaceId: string) => {
    setSource({
      type: 'SPACES',
      value: [SpaceId(spaceId)],
    });
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
          const active = source.type === 'SPACES' && source.value.includes(SpaceId(space.id));

          return (
            <MenuItem key={space.id} onClick={() => handleToggleSpace(space.spaceId)} active={active} className="group">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0">
                  <img
                    src={getImagePath(space.image ?? '') ?? PLACEHOLDER_SPACE_IMAGE}
                    className="h-[12px] w-[12px] rounded-sm"
                  />
                </div>
                <div className="flex-grow truncate text-button text-text">{space.name}</div>
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
