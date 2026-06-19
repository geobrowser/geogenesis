'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';

import cx from 'classnames';

import { type Source } from '~/core/blocks/data/source';
import { useDataBlockInstance } from '~/core/blocks/data/use-data-block';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useCreatableSpaceIds } from '~/core/hooks/use-creatable-space-ids';
import { useDebouncedValue } from '~/core/hooks/use-debounced-value';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import {
  type QueryFromSpaceRow,
  sortSpacesForDropdownSearch,
  useQueryFromSpacesList,
} from '~/core/hooks/use-query-from-spaces-list';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { useSpacesQuery } from '~/core/hooks/use-spaces-query';

import { Dots } from '~/design-system/dots';
import { NativeGeoImage } from '~/design-system/geo-image';
import { Create } from '~/design-system/icons/create';
import { Input } from '~/design-system/input';
import { trapWheelToElement } from '~/design-system/trap-wheel-scroll';
import { useAdaptiveDropdownPlacement } from '~/design-system/use-adaptive-dropdown-placement';

const listScrollClassName =
  'max-h-[198px] min-h-0 overflow-y-auto overscroll-contain scroll-smooth snap-y snap-mandatory';
const listRowClassName = 'snap-start min-h-[44px] shrink-0';

type DataBlockCreateEntitySpaceDropdownProps = {
  source: Source;
  /** Called with the space the user picked for the new entity. */
  onPick: (spaceId: string, spaceName: string | null) => void;
  disabled?: boolean;
};

function SpaceDropdownRow({
  row,
  disabled,
  onPick,
}: {
  row: QueryFromSpaceRow;
  disabled?: boolean;
  onPick: () => void;
}) {
  return (
    <Dropdown.Item
      disabled={disabled}
      textValue={row.name}
      className={cx(
        'group relative flex w-full items-center px-3 py-[10px] text-button outline-none select-none',
        listRowClassName,
        'bg-white',
        disabled
          ? 'pointer-events-none cursor-not-allowed text-grey-04 opacity-50'
          : 'cursor-pointer text-text data-highlighted:bg-grey-01'
      )}
      onSelect={e => {
        e.preventDefault();
        if (disabled) return;
        onPick();
      }}
      onPointerDown={disabled ? e => e.preventDefault() : undefined}
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
            <span className="truncate text-button">{row.name}</span>
          </div>
        </div>
        {row.pendingLabel ? <p className="truncate pl-6 text-footnote text-grey-04">{row.pendingLabel}</p> : null}
      </div>
    </Dropdown.Item>
  );
}

function dedupeSpaceRows(rows: QueryFromSpaceRow[]): QueryFromSpaceRow[] {
  const seen = new Set<string>();
  return rows.filter(row => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

/**
 * Dropdown shown when the user clicks the "+" button on a query data block.
 * All scoped spaces are listed; only spaces where the user is a member or editor are selectable.
 */
export function DataBlockCreateEntitySpaceDropdown({
  source,
  onPick,
  disabled,
}: DataBlockCreateEntitySpaceDropdownProps) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  const { spaceId } = useDataBlockInstance();
  const { personalSpaceId } = usePersonalSpaceId();

  const [contentElement, setContentElement] = React.useState<HTMLDivElement | null>(null);
  const { align, side } = useAdaptiveDropdownPlacement(triggerRef, {
    isOpen: open,
    preferredHeight: 340,
    gap: 8,
    contentElement,
  });

  const onListWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    trapWheelToElement(e.currentTarget, e);
  }, []);

  const sourceSpaceIds = source.type === 'SPACES' ? source.value : [];
  const { spacesById, isLoading: sourceSpacesLoading } = useSpacesByIds(sourceSpaceIds);

  const { data: scopeData, isLoading: scopeListLoading } = useQueryFromSpacesList(
    personalSpaceId ?? spaceId,
    open && source.type === 'GEO'
  );
  const sections = scopeData?.sections;
  const scopeOrdering = scopeData?.ordering;

  const {
    setQuery: setRemoteSearchQuery,
    spaces: remoteSearchSpaces,
    isLoading: remoteSearchLoading,
  } = useSpacesQuery(open && source.type === 'GEO', { matchLimit: 1000 });

  const debouncedSearch = useDebouncedValue(search, 200);

  React.useEffect(() => {
    if (!open) {
      setSearch('');
      setRemoteSearchQuery('');
    }
  }, [open, setRemoteSearchQuery]);

  React.useEffect(() => {
    if (open) {
      setRemoteSearchQuery(debouncedSearch);
    }
  }, [open, debouncedSearch, setRemoteSearchQuery]);

  const searchTrim = search.trim();
  const searchMode = Boolean(searchTrim);
  const isGeoSource = source.type === 'GEO';

  const sourceRows: QueryFromSpaceRow[] = React.useMemo(() => {
    if (source.type !== 'SPACES') return [];
    return sourceSpaceIds.map(id => {
      const space = spacesById.get(id);
      const hintedName = source.nameById?.[id] ?? null;
      return {
        id,
        name: space?.entity?.name?.trim() || hintedName?.trim() || id.slice(0, 8),
        image: typeof space?.entity?.image === 'string' && space.entity.image.length > 0 ? space.entity.image : null,
        tier: 3 as const,
      };
    });
  }, [source, sourceSpaceIds, spacesById]);

  const filteredSourceRows = React.useMemo(() => {
    if (!searchMode) return sourceRows;
    const q = searchTrim.toLowerCase();
    return sourceRows.filter(row => row.name.toLowerCase().includes(q));
  }, [searchMode, searchTrim, sourceRows]);

  const filteredGeoSearchRows = React.useMemo(() => {
    if (!isGeoSource || !searchMode) return null;
    const mapped = remoteSearchSpaces.map(s => ({
      id: s.id,
      name: s.name?.trim() || 'Untitled space',
      image: typeof s.image === 'string' && s.image.length > 0 ? s.image : null,
    }));
    if (!scopeOrdering) return dedupeSpaceRows(mapped.map(row => ({ ...row, tier: 3 as const })));
    return dedupeSpaceRows(sortSpacesForDropdownSearch(mapped, scopeOrdering));
  }, [isGeoSource, searchMode, remoteSearchSpaces, scopeOrdering]);

  const orderedScopeRows = React.useMemo(() => {
    if (!sections) return [];
    return dedupeSpaceRows([...sections.editors, ...sections.members, ...sections.featured]);
  }, [sections]);

  const visibleRows = React.useMemo(() => {
    if (isGeoSource) {
      if (searchMode && filteredGeoSearchRows) return filteredGeoSearchRows;
      return orderedScopeRows;
    }
    return filteredSourceRows;
  }, [filteredGeoSearchRows, filteredSourceRows, isGeoSource, orderedScopeRows, searchMode]);

  const {
    canCreateInSpace,
    isLoading: accessLoading,
    isResolved: accessResolved,
  } = useCreatableSpaceIds(
    visibleRows.map(row => row.id),
    open
  );

  const listLoading =
    !accessResolved &&
    (isGeoSource
      ? searchMode
        ? remoteSearchLoading || accessLoading
        : scopeListLoading || accessLoading
      : sourceSpacesLoading || accessLoading);

  const handlePick = (id: string, name: string | null) => {
    if (!canCreateInSpace(id)) return;
    onPick(id, name);
    setOpen(false);
  };

  const renderRow = (row: QueryFromSpaceRow) => (
    <SpaceDropdownRow
      key={row.id}
      row={row}
      disabled={!canCreateInSpace(row.id)}
      onPick={() => handlePick(row.id, row.name)}
    />
  );

  return (
    <Dropdown.Root open={open} onOpenChange={setOpen}>
      <Dropdown.Trigger asChild disabled={disabled}>
        <button
          ref={triggerRef}
          type="button"
          aria-label="Add row"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-grey-04 transition hover:text-text focus:outline-hidden focus-visible:ring-2 focus-visible:ring-grey-04 disabled:pointer-events-none disabled:opacity-50"
        >
          <Create />
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          ref={setContentElement}
          side={side}
          align={align}
          sideOffset={8}
          avoidCollisions={true}
          collisionPadding={8}
          className="z-1001 flex max-h-[min(360px,80vh)] w-[min(300px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg"
        >
          <div className="shrink-0 border-b border-grey-02 px-2.5 py-1.5">
            <p className="text-footnoteMedium text-grey-04">Create entity in</p>
          </div>

          {isGeoSource && (
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
          )}

          <div className={cx('px-0.5 py-1', listScrollClassName)} onWheel={onListWheel}>
            {listLoading && (
              <div className="flex h-14 items-center justify-center">
                <Dots />
              </div>
            )}

            {!listLoading && !isGeoSource && filteredSourceRows.length > 0 && <>{filteredSourceRows.map(renderRow)}</>}

            {!listLoading && !isGeoSource && filteredSourceRows.length === 0 && (
              <div className="px-3 py-4 text-footnote text-grey-04">No spaces in this query.</div>
            )}

            {!listLoading && isGeoSource && searchMode && filteredGeoSearchRows && (
              <>
                {filteredGeoSearchRows.map(renderRow)}
                {filteredGeoSearchRows.length === 0 && (
                  <div className="px-3 py-4 text-footnote text-grey-04">No spaces match your search.</div>
                )}
              </>
            )}

            {!listLoading && isGeoSource && !searchMode && sections && orderedScopeRows.length > 0 && (
              <>{orderedScopeRows.map(renderRow)}</>
            )}

            {!listLoading && isGeoSource && !searchMode && sections && orderedScopeRows.length === 0 && (
              <div className="px-3 py-4 text-footnote text-grey-04">No spaces to show. Try search.</div>
            )}

            {!listLoading && isGeoSource && !searchMode && !sections && (
              <div className="px-3 py-4 text-footnote text-grey-04">No spaces to show.</div>
            )}
          </div>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
