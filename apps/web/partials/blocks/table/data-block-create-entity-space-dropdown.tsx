'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';

import cx from 'classnames';

import { type Source } from '~/core/blocks/data/source';
import { useDataBlockInstance } from '~/core/blocks/data/use-data-block';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useDebouncedValue } from '~/core/hooks/use-debounced-value';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import {
  sortSpacesForDropdownSearch,
  useQueryFromSpacesList,
  type QueryFromSpaceRow,
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

function SpaceDropdownRow({ row, onPick }: { row: QueryFromSpaceRow; onPick: () => void }) {
  return (
    <Dropdown.Item
      textValue={row.name}
      className={cx(
        'group relative flex w-full cursor-pointer items-center px-3 py-[10px] text-button text-text outline-none select-none',
        listRowClassName,
        'bg-white data-highlighted:bg-grey-01'
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
        </div>
        {row.pendingLabel ? (
          <p className="truncate pl-6 text-footnote text-grey-04">{row.pendingLabel}</p>
        ) : null}
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
 * Lets the user pick which space the new entity will be created in.
 *
 * - SPACES source: lists the spaces from the block's filter.
 * - GEO source: searchable list of all spaces (defaults to editor / member / featured).
 *
 * For other source types this component should not be rendered — the caller
 * is expected to show the plain "+" button instead.
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

  const { align, side } = useAdaptiveDropdownPlacement(triggerRef, {
    isOpen: open,
    preferredHeight: 340,
    gap: 8,
  });

  const onListWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    trapWheelToElement(e.currentTarget, e);
  }, []);

  const sourceSpaceIds = source.type === 'SPACES' ? source.value : [];
  const { spacesById, isLoading: sourceSpacesLoading } = useSpacesByIds(sourceSpaceIds);

  // GEO branch: pull the same sectioned list / search behavior used by the scope dropdown.
  const enableScopeList = open && source.type === 'GEO';
  const { data: scopeData, isLoading: initialListLoading } = useQueryFromSpacesList(
    personalSpaceId ?? spaceId,
    enableScopeList
  );
  const sections = scopeData?.sections;
  const scopeOrdering = scopeData?.ordering;

  const { setQuery: setRemoteSearchQuery, spaces: remoteSearchSpaces, isLoading: remoteSearchLoading } = useSpacesQuery(
    enableScopeList,
    { matchLimit: 1000 }
  );

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
        name:
          space?.entity?.name?.trim() ||
          hintedName?.trim() ||
          id.slice(0, 8),
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

  /** Flat list: editors → members → top spaces (no section headers). */
  const orderedScopeRows = React.useMemo(() => {
    if (!sections) return [];
    return dedupeSpaceRows([...sections.editors, ...sections.members, ...sections.featured]);
  }, [sections]);

  const listLoading = isGeoSource
    ? searchMode
      ? remoteSearchLoading
      : initialListLoading
    : sourceSpacesLoading;

  const handlePick = (id: string, name: string | null) => {
    onPick(id, name);
    setOpen(false);
  };

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

            {!listLoading && !isGeoSource && filteredSourceRows.length > 0 && (
              <>
                {filteredSourceRows.map(row => (
                  <SpaceDropdownRow key={row.id} row={row} onPick={() => handlePick(row.id, row.name)} />
                ))}
              </>
            )}

            {!listLoading && !isGeoSource && filteredSourceRows.length === 0 && (
              <div className="px-3 py-4 text-footnote text-grey-04">No spaces in this query.</div>
            )}

            {!listLoading && isGeoSource && searchMode && filteredGeoSearchRows && (
              <>
                {filteredGeoSearchRows.map(row => (
                  <SpaceDropdownRow key={row.id} row={row} onPick={() => handlePick(row.id, row.name)} />
                ))}
                {filteredGeoSearchRows.length === 0 && (
                  <div className="px-3 py-4 text-footnote text-grey-04">No spaces match your search.</div>
                )}
              </>
            )}

            {!listLoading && isGeoSource && !searchMode && sections && orderedScopeRows.length > 0 && (
              <>
                {orderedScopeRows.map(row => (
                  <SpaceDropdownRow key={row.id} row={row} onPick={() => handlePick(row.id, row.name)} />
                ))}
              </>
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
