'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';

import cx from 'classnames';

import type { Source } from '~/core/blocks/data/source';
import { useDataBlockInstance } from '~/core/blocks/data/use-data-block';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useQueryFromSpacesList } from '~/core/hooks/use-query-from-spaces-list';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { useSpacesQuery } from '~/core/hooks/use-spaces-query';

import { Dots } from '~/design-system/dots';
import { NativeGeoImage } from '~/design-system/geo-image';
import { Check } from '~/design-system/icons/check';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Input } from '~/design-system/input';
import { MenuItem } from '~/design-system/menu';

/** Match `SmallButton` / Filter trigger (secondary + small). */
const pillClassName =
  'inline-flex h-6 max-w-[220px] shrink-0 items-center gap-1.5 rounded border border-grey-02 bg-white px-1.5 text-metadata leading-none text-text shadow-button transition hover:border-text hover:bg-bg focus:outline-hidden disabled:pointer-events-none disabled:opacity-50';

function scopeLabel(source: Source, spacesById: ReturnType<typeof useSpacesByIds>['spacesById']): string {
  switch (source.type) {
    case 'COLLECTION':
      return 'Collection';
    case 'GEO':
      return 'All of Geo';
    case 'SPACES': {
      if (source.value.length === 0) return 'Spaces';
      if (source.value.length === 1) {
        return spacesById.get(source.value[0])?.entity?.name ?? 'Space';
      }
      return `${source.value.length} spaces`;
    }
    case 'RELATIONS':
      return source.name ?? 'Entity';
    default:
      return 'Scope';
  }
}

type DataBlockScopeDropdownProps = {
  source: Source;
  setSource: (source: Source) => void;
  disabled?: boolean;
};

export function DataBlockScopeDropdown({ source, setSource, disabled }: DataBlockScopeDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const { spaceId } = useDataBlockInstance();
  const selectedSpaceIds = source.type === 'SPACES' ? source.value : [];
  const { spacesById } = useSpacesByIds(source.type === 'SPACES' ? source.value : []);

  const { data: spaceRows = [], isLoading: initialListLoading } = useQueryFromSpacesList(spaceId, open);
  const { setQuery: setRemoteSearchQuery, spaces: remoteSearchSpaces, isLoading: remoteSearchLoading } = useSpacesQuery(
    open,
    { matchLimit: 1000 }
  );

  React.useEffect(() => {
    if (!open) {
      setSearch('');
      setRemoteSearchQuery('');
    }
  }, [open, setRemoteSearchQuery]);

  React.useEffect(() => {
    if (open) {
      setRemoteSearchQuery(search);
    }
  }, [open, search, setRemoteSearchQuery]);

  const filteredRows = React.useMemo(() => {
    const q = search.trim();
    if (!q) return spaceRows;
    return remoteSearchSpaces.map(s => ({
      id: s.id,
      name: s.name?.trim() || 'Untitled space',
      image: typeof s.image === 'string' && s.image.length > 0 ? s.image : null,
      tier: 3 as const,
    }));
  }, [spaceRows, search, remoteSearchSpaces]);

  const listLoading = !search.trim() ? initialListLoading : remoteSearchLoading;

  const label = React.useMemo(() => scopeLabel(source, spacesById), [source, spacesById]);
  const isAllOfGeo = source.type === 'GEO';

  const toggleSpace = (id: string) => {
    if (source.type === 'GEO' || source.type === 'RELATIONS') {
      setSource({ type: 'SPACES', value: [id] });
      return;
    }
    if (source.type !== 'SPACES') return;

    const set = new Set(source.value);
    if (set.has(id)) {
      set.delete(id);
      const next = [...set];
      if (next.length === 0) {
        setSource({ type: 'GEO' });
      } else {
        setSource({ type: 'SPACES', value: next });
      }
    } else {
      set.add(id);
      setSource({ type: 'SPACES', value: [...set] });
    }
  };

  const onPickAllOfGeo = () => {
    setSource({ type: 'GEO' });
    setOpen(false);
  };

  return (
    <Dropdown.Root open={open} onOpenChange={setOpen}>
      <Dropdown.Trigger asChild disabled={disabled}>
        <button type="button" className={pillClassName}>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          <span className={cx('inline-flex shrink-0 transition-transform', open && 'rotate-180')}>
            <ChevronDownSmall color="grey-04" />
          </span>
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          sideOffset={8}
          className="z-1001 flex max-h-[min(420px,80vh)] w-[min(320px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg"
          align="start"
        >
          <div className="shrink-0 border-b border-grey-02 px-2.5 py-1.5">
            <p className="text-footnoteMedium text-grey-04">Query from</p>
          </div>

          <div className="shrink-0 border-b border-grey-02 p-1.5">
            <Input
              withSearchIcon
              placeholder="Search spaces..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => e.stopPropagation()}
            />
          </div>

          <div className="shrink-0 px-0.5 pb-1">
            <MenuItem active={isAllOfGeo} onClick={onPickAllOfGeo}>
              <div className="flex w-full flex-col gap-0.5">
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-button text-text">All of Geo</span>
                  {isAllOfGeo && <Check />}
                </div>
              </div>
            </MenuItem>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {listLoading && (
              <div className="flex h-14 items-center justify-center">
                <Dots />
              </div>
            )}
            {!listLoading &&
              filteredRows.map(row => {
                const selected = !isAllOfGeo && selectedSpaceIds.includes(row.id);

                return (
                  <MenuItem key={row.id} onClick={() => toggleSpace(row.id)} active={selected}>
                    <div className="flex w-full items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="h-4 w-4 shrink-0 overflow-hidden rounded-sm border border-grey-02 bg-grey-01">
                          {row.image ? (
                            <NativeGeoImage value={row.image} className="h-full w-full object-cover" />
                          ) : (
                            <img src={PLACEHOLDER_SPACE_IMAGE} alt="" className="h-full w-full object-cover" />
                          )}
                        </div>
                        <span className="truncate text-button text-text">{row.name}</span>
                      </div>
                      {selected && <Check />}
                    </div>
                  </MenuItem>
                );
              })}
            {!listLoading && filteredRows.length === 0 && (
              <div className="px-3 py-4 text-footnote text-grey-04">
                {search.trim() ? 'No spaces match your search.' : 'No spaces to show.'}
              </div>
            )}
          </div>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
