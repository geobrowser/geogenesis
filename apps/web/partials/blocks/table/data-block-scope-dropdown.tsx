'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';

import cx from 'classnames';

import type { Source } from '~/core/blocks/data/source';
import { useDataBlockInstance } from '~/core/blocks/data/use-data-block';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import {
  sortSpacesForDropdownSearch,
  useQueryFromSpacesList,
  type QueryFromSpaceRow,
} from '~/core/hooks/use-query-from-spaces-list';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { useSpacesQuery } from '~/core/hooks/use-spaces-query';

import { Dots } from '~/design-system/dots';
import { NativeGeoImage } from '~/design-system/geo-image';
import { Check } from '~/design-system/icons/check';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Input } from '~/design-system/input';
import { trapWheelToElement } from '~/design-system/trap-wheel-scroll';
import { useAdaptiveDropdownPlacement } from '~/design-system/use-adaptive-dropdown-placement';

const listScrollClassName =
  'max-h-[198px] min-h-0 overflow-y-auto overscroll-contain scroll-smooth snap-y snap-mandatory';
const listRowClassName = 'snap-start min-h-[44px] shrink-0';

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

function SpaceDropdownRow({
  row,
  selected,
  onPick,
}: {
  row: QueryFromSpaceRow;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <Dropdown.Item
      textValue={row.name}
      className={cx(
        'group relative flex w-full cursor-pointer items-center px-3 py-[10px] text-button text-text outline-none select-none',
        listRowClassName,
        selected ? 'bg-grey-01' : 'bg-white data-highlighted:bg-grey-01'
      )}
      onSelect={e => {
        e.preventDefault();
        onPick();
      }}
    >
      <div className="flex w-full flex-col gap-0.5">
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
        {row.pendingLabel ? (
          <p className="truncate pl-6 text-footnote text-grey-04">{row.pendingLabel}</p>
        ) : null}
      </div>
    </Dropdown.Item>
  );
}

type DataBlockScopeDropdownProps = {
  source: Source;
  setSource: (source: Source) => void;
  disabled?: boolean;
  /** When false, trigger is a grey read-only pill (no border); menu does not open. */
  isEditing?: boolean;
};

const readOnlyScopeTriggerClassName =
  'inline-flex h-6 max-w-[220px] shrink-0 cursor-default items-center gap-1.5 rounded-md border-0 bg-grey-01 px-1.5 text-metadata leading-none text-text';

export function DataBlockScopeDropdown({ source, setSource, disabled, isEditing = true }: DataBlockScopeDropdownProps) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [open, setOpen] = React.useState(false);

  const { align, side } = useAdaptiveDropdownPlacement(triggerRef, {
    isOpen: open,
    preferredHeight: 380,
    gap: 8,
  });

  const onListWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    trapWheelToElement(e.currentTarget, e);
  }, []);
  const [pendingSource, setPendingSource] = React.useState<Source | null>(null);
  const [search, setSearch] = React.useState('');
  const { spaceId } = useDataBlockInstance();

  const scopeDraftDirtyRef = React.useRef(false);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        scopeDraftDirtyRef.current = false;
        setPendingSource(source);
      } else {
        setPendingSource(prev => {
          if (prev !== null && scopeDraftDirtyRef.current) {
            setSource(prev);
          }
          scopeDraftDirtyRef.current = false;
          return null;
        });
      }
      setOpen(nextOpen);
    },
    [source, setSource]
  );

  React.useEffect(() => {
    if (!open || scopeDraftDirtyRef.current) return;
    setPendingSource(source);
  }, [open, source]);

  const draft = pendingSource ?? source;
  const selectedSpaceIds = draft.type === 'SPACES' ? draft.value : [];
  const { spacesById } = useSpacesByIds(source.type === 'SPACES' ? source.value : []);

  const { data: scopeData, isLoading: initialListLoading } = useQueryFromSpacesList(spaceId, open);
  const sections = scopeData?.sections;
  const scopeOrdering = scopeData?.ordering;

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

  const searchTrim = search.trim();
  const searchMode = Boolean(searchTrim);

  const filteredSearchRows = React.useMemo(() => {
    if (!searchMode) return null;
    const mapped = remoteSearchSpaces.map(s => ({
      id: s.id,
      name: s.name?.trim() || 'Untitled space',
      image: typeof s.image === 'string' && s.image.length > 0 ? s.image : null,
    }));
    if (!scopeOrdering) return mapped.map(row => ({ ...row, tier: 3 as const }));
    return sortSpacesForDropdownSearch(mapped, scopeOrdering);
  }, [searchMode, remoteSearchSpaces, scopeOrdering]);

  /** Flat list: editors → members → top spaces (no section headers). */
  const orderedScopeRows = React.useMemo(() => {
    if (!sections) return [];
    return [...sections.editors, ...sections.members, ...sections.featured];
  }, [sections]);

  const listLoading = searchMode ? remoteSearchLoading : initialListLoading;

  const label = React.useMemo(() => scopeLabel(source, spacesById), [source, spacesById]);
  const isAllOfGeo = draft.type === 'GEO';

  const toggleSpace = (id: string) => {
    scopeDraftDirtyRef.current = true;
    setPendingSource(prev => {
      const base = prev ?? source;
      if (base.type === 'GEO' || base.type === 'RELATIONS') {
        return { type: 'SPACES', value: [id] };
      }
      if (base.type !== 'SPACES') return base;

      const set = new Set(base.value);
      if (set.has(id)) {
        set.delete(id);
        const next = [...set];
        if (next.length === 0) {
          return { type: 'GEO' };
        }
        return { type: 'SPACES', value: next };
      }
      set.add(id);
      return { type: 'SPACES', value: [...set] };
    });
  };

  const onPickAllOfGeo = () => {
    scopeDraftDirtyRef.current = true;
    setPendingSource({ type: 'GEO' });
  };

  const triggerDisabled = disabled || !isEditing;

  return (
    <Dropdown.Root open={open} onOpenChange={handleOpenChange}>
      <Dropdown.Trigger asChild disabled={triggerDisabled}>
        <button ref={triggerRef} type="button" className={isEditing ? pillClassName : readOnlyScopeTriggerClassName}>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          {isEditing && (
            <span className={cx('inline-flex shrink-0 transition-transform', open && 'rotate-180')}>
              <ChevronDownSmall color="grey-04" />
            </span>
          )}
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          side={side}
          align={align}
          sideOffset={8}
          avoidCollisions={true}
          collisionPadding={8}
          className="z-1001 flex max-h-[min(420px,80vh)] w-[min(320px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg"
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
            <Dropdown.Item
              textValue="All of Geo"
              className={cx(
                'group relative flex w-full cursor-pointer items-center px-3 py-[10px] text-button text-text outline-none select-none',
                isAllOfGeo ? 'bg-grey-01' : 'bg-white data-highlighted:bg-grey-01'
              )}
              onSelect={e => {
                e.preventDefault();
                onPickAllOfGeo();
              }}
            >
              <div className="flex w-full flex-col gap-0.5">
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-button text-text">All of Geo</span>
                  {isAllOfGeo && <Check />}
                </div>
              </div>
            </Dropdown.Item>
          </div>

          <div
            className={cx('px-0.5 pb-1', listScrollClassName)}
            onWheel={onListWheel}
          >
            {listLoading && (
              <div className="flex h-14 items-center justify-center">
                <Dots />
              </div>
            )}

            {!listLoading && searchMode && filteredSearchRows && (
              <>
                {filteredSearchRows.map(row => {
                  const selected = !isAllOfGeo && selectedSpaceIds.includes(row.id);
                  return (
                    <SpaceDropdownRow key={row.id} row={row} selected={selected} onPick={() => toggleSpace(row.id)} />
                  );
                })}
                {filteredSearchRows.length === 0 && (
                  <div className="px-3 py-4 text-footnote text-grey-04">No spaces match your search.</div>
                )}
              </>
            )}

            {!listLoading && !searchMode && sections && orderedScopeRows.length > 0 && (
              <>
                {orderedScopeRows.map(row => (
                  <SpaceDropdownRow
                    key={row.id}
                    row={row}
                    selected={!isAllOfGeo && selectedSpaceIds.includes(row.id)}
                    onPick={() => toggleSpace(row.id)}
                  />
                ))}
              </>
            )}

            {!listLoading && !searchMode && sections && orderedScopeRows.length === 0 && (
              <div className="px-3 py-4 text-footnote text-grey-04">No spaces to show. Try search.</div>
            )}

            {!listLoading && !searchMode && !sections && (
              <div className="px-3 py-4 text-footnote text-grey-04">No spaces to show.</div>
            )}
          </div>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
