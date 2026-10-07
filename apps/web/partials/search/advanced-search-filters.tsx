'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';

import { EXPLORE_ENTITY_TYPES } from '~/core/explore/explore-constants';
import { useFetchNextPageOnScroll } from '~/core/hooks/use-fetch-next-page-on-scroll';
import { useSearch } from '~/core/hooks/use-search';
import { useSpacesQuery } from '~/core/hooks/use-spaces-query';
import { compareBySpaceRank } from '~/core/utils/space/space-ranking';

import { CheckboxVisual } from '~/design-system/checkbox';
import { NativeGeoImage } from '~/design-system/geo-image';
import { CheckCloseSmall } from '~/design-system/icons/check-close-small';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Input } from '~/design-system/input';
import { Tag } from '~/design-system/tag';
import { trapWheelToElement } from '~/design-system/trap-wheel-scroll';

export type SearchFilterTag = { id: string; name: string | null };

type Props = {
  canonicalOnly: boolean;
  onToggleCanonicalOnly: () => void;
  selectedSpaceIds: string[];
  onToggleSpace: (id: string) => void;
  typeIds: string[];
  onToggleType: (id: string) => void;
  onClearTypes: () => void;
  tags: SearchFilterTag[];
  onAddTag: (tag: SearchFilterTag) => void;
  onRemoveTag: (id: string) => void;
  portalContainer: HTMLElement | null;
  onFilterMenuOpenChange?: (open: boolean) => void;
};

function shieldNavigationKeys(event: React.KeyboardEvent) {
  if (['Enter', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
    event.stopPropagation();
  }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-footnoteMedium text-grey-04">{children}</span>;
}

/**
 * The space/type/tag filters shown under global search Advanced. Space (which folds in the
 * canonical-only scope) and type are select-style popovers that float over the results (see
 * `portalContainer` — must be outside the dialog's overflow clipping); tags are a free entity
 * search. Type and tag feed `useSearch` (`filterByTypes` / `filterByTags`), the canonical-only
 * scope feeds `includeNonCanonical`, and the chosen spaces are included (added to eligibility) via
 * `useSearch`'s `alsoSearchSpaceIds` → REST `additional_space_ids`.
 */
export function AdvancedSearchFilters({
  canonicalOnly,
  onToggleCanonicalOnly,
  selectedSpaceIds,
  onToggleSpace,
  typeIds,
  onToggleType,
  onClearTypes,
  tags,
  onAddTag,
  onRemoveTag,
  portalContainer,
  onFilterMenuOpenChange,
}: Props) {
  // Space and type each have their own menu; OR them so the dialog pauses load-more for either.
  const openMenusRef = React.useRef({ space: false, type: false });
  const notifyMenuOpen = React.useCallback(
    (menu: 'space' | 'type', open: boolean) => {
      openMenusRef.current[menu] = open;
      onFilterMenuOpenChange?.(openMenusRef.current.space || openMenusRef.current.type);
    },
    [onFilterMenuOpenChange]
  );

  return (
    <div className="flex flex-col gap-3" onKeyDown={shieldNavigationKeys}>
      <div className="flex items-start gap-2">
        <SpaceFilter
          canonicalOnly={canonicalOnly}
          onToggleCanonicalOnly={onToggleCanonicalOnly}
          selectedSpaceIds={selectedSpaceIds}
          onToggleSpace={onToggleSpace}
          container={portalContainer}
          onOpenChange={open => notifyMenuOpen('space', open)}
        />
        <TypeFilter
          typeIds={typeIds}
          onToggleType={onToggleType}
          onClearTypes={onClearTypes}
          container={portalContainer}
          onOpenChange={open => notifyMenuOpen('type', open)}
        />
      </div>
      <TagFilter tags={tags} onAddTag={onAddTag} onRemoveTag={onRemoveTag} />
    </div>
  );
}

function FilterDropdown({
  label,
  trigger,
  container,
  header,
  onOpenChange,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  children,
}: {
  label: string;
  trigger: React.ReactNode;
  container: HTMLElement | null;
  header?: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const listRef = React.useRef<HTMLUListElement | null>(null);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  const handleListScroll = useFetchNextPageOnScroll<HTMLUListElement>({
    hasNextPage: Boolean(hasNextPage && fetchNextPage),
    isFetchingNextPage,
    fetchNextPage: fetchNextPage ?? (() => undefined),
    scrollRef: listRef,
    distanceFromBottom: 80,
  });

  return (
    <Popover.Root modal={false} open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded border border-grey-02 px-3 py-2 text-footnoteMedium text-text transition-colors hover:border-text focus:outline-hidden"
        >
          <span className="flex min-w-0 items-center gap-1.5 truncate">{trigger}</span>
          <span className={cx('shrink-0 transition-transform duration-200', open && 'rotate-180')}>
            <ChevronDownSmall color="grey-04" />
          </span>
        </button>
      </Popover.Trigger>
      {/* Always portal (body when host is briefly null) so load-more re-renders never unmount the open menu. */}
      <Popover.Portal container={container ?? undefined}>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          avoidCollisions={false}
          onKeyDown={shieldNavigationKeys}
          onOpenAutoFocus={event => event.preventDefault()}
          onCloseAutoFocus={event => event.preventDefault()}
          className="z-[var(--elevated-popover-z,1001)] flex w-(--radix-popper-anchor-width) min-w-[12rem] flex-col rounded border border-grey-02 bg-white shadow-lg"
        >
          {header}
          <ul
            ref={listRef}
            onScroll={fetchNextPage ? handleListScroll : undefined}
            onWheel={event => trapWheelToElement(event.currentTarget, event)}
            className="m-0 flex max-h-52 list-none flex-col overflow-y-auto overscroll-contain"
          >
            {children(() => handleOpenChange(false))}
            {isFetchingNextPage ? <li className="px-3 py-2 text-footnoteMedium text-grey-04">Loading more…</li> : null}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function FilterSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="border-b border-divider p-2">
      <input
        type="text"
        value={value}
        onChange={event => onChange(event.currentTarget.value)}
        onKeyDown={shieldNavigationKeys}
        placeholder={placeholder}
        className="w-full bg-transparent px-1 text-footnoteMedium text-text placeholder:text-grey-04 focus:outline-hidden"
      />
    </div>
  );
}

function OptionRow({
  selected,
  onClick,
  disabled = false,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="border-b border-divider last:border-none">
      <button
        type="button"
        onPointerDown={event => event.preventDefault()}
        onClick={onClick}
        disabled={disabled}
        className={cx(
          'flex w-full items-center gap-2 px-3 py-2 text-left text-footnoteMedium transition-colors',
          disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-grey-01',
          selected ? 'text-text' : 'text-grey-04'
        )}
      >
        {children}
      </button>
    </li>
  );
}

function TypeFilter({
  typeIds,
  onToggleType,
  onClearTypes,
  container,
  onOpenChange,
}: {
  typeIds: string[];
  onToggleType: (id: string) => void;
  onClearTypes: () => void;
  container: HTMLElement | null;
  onOpenChange?: (open: boolean) => void;
}) {
  const selectedTypes = React.useMemo(() => new Set(typeIds), [typeIds]);
  const [query, setQuery] = React.useState('');
  const normalized = query.trim().toLowerCase();
  const filteredTypes = React.useMemo(
    () =>
      normalized === ''
        ? EXPLORE_ENTITY_TYPES
        : EXPLORE_ENTITY_TYPES.filter(type => type.label.toLowerCase().includes(normalized)),
    [normalized]
  );
  const label =
    typeIds.length === 0 ? 'Any type' : `${typeIds.length} ${typeIds.length === 1 ? 'type' : 'types'} selected`;

  return (
    <FilterDropdown
      label="Types"
      container={container}
      onOpenChange={open => {
        onOpenChange?.(open);
        if (!open) setQuery('');
      }}
      header={<FilterSearchInput value={query} onChange={setQuery} placeholder="Filter types…" />}
      trigger={<span className={cx('truncate', typeIds.length === 0 && 'text-grey-04')}>{label}</span>}
    >
      {() => (
        <>
          {normalized === '' ? (
            <OptionRow selected={typeIds.length === 0} onClick={onClearTypes}>
              Any type
            </OptionRow>
          ) : null}
          {filteredTypes.map(type => {
            const selected = selectedTypes.has(type.id);
            return (
              <OptionRow key={type.id} selected={selected} onClick={() => onToggleType(type.id)}>
                <CheckboxVisual checked={selected} />
                <span className="min-w-0 flex-1 truncate text-text">{type.label}</span>
              </OptionRow>
            );
          })}
          {filteredTypes.length === 0 ? (
            <li className="px-3 py-2 text-footnoteMedium text-grey-04">No matches</li>
          ) : null}
        </>
      )}
    </FilterDropdown>
  );
}

function SpaceFilter({
  canonicalOnly,
  onToggleCanonicalOnly,
  selectedSpaceIds,
  onToggleSpace,
  container,
  onOpenChange,
}: {
  canonicalOnly: boolean;
  onToggleCanonicalOnly: () => void;
  selectedSpaceIds: string[];
  onToggleSpace: (id: string) => void;
  container: HTMLElement | null;
  onOpenChange?: (open: boolean) => void;
}) {
  const { query, setQuery, spaces, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useSpacesQuery(true, {
    allowEmptyQuery: true,
    matchLimit: 100,
  });

  const seenRef = React.useRef<Map<string, { name: string | null; image: string | null }>>(new Map());
  for (const space of spaces) {
    seenRef.current.set(space.id, { name: space.name, image: space.image });
  }

  const selected = React.useMemo(() => new Set(selectedSpaceIds), [selectedSpaceIds]);

  const rows = React.useMemo(() => {
    const byId = new Map<string, { id: string; name: string | null; image: string | null }>();
    for (const id of selectedSpaceIds) {
      const meta = seenRef.current.get(id);
      byId.set(id, { id, name: meta?.name ?? null, image: meta?.image ?? null });
    }
    for (const space of spaces) {
      byId.set(space.id, { id: space.id, name: space.name, image: space.image });
    }
    const all = [...byId.values()];

    if (query.trim() === '') {
      all.sort(compareBySpaceRank(space => space.id));
    }
    return all;
  }, [selectedSpaceIds, spaces, query]);

  const selectedName = selectedSpaceIds.length === 1 ? (seenRef.current.get(selectedSpaceIds[0])?.name ?? null) : null;
  const label = canonicalOnly
    ? 'Canonical only'
    : selectedSpaceIds.length === 0
      ? 'All spaces'
      : selectedSpaceIds.length === 1
        ? (selectedName ?? '1 space')
        : `${selectedSpaceIds.length} spaces`;

  return (
    <FilterDropdown
      label="Spaces"
      container={container}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      fetchNextPage={fetchNextPage}
      onOpenChange={open => {
        onOpenChange?.(open);
        if (!open) setQuery('');
      }}
      header={<FilterSearchInput value={query} onChange={setQuery} placeholder="Filter spaces…" />}
      trigger={<span className="truncate">{label}</span>}
    >
      {() => (
        <>
          <OptionRow selected={canonicalOnly} onClick={onToggleCanonicalOnly}>
            <CheckboxVisual checked={canonicalOnly} />
            <span className="min-w-0 flex-1 truncate text-text">Canonical only</span>
          </OptionRow>
          {rows.map(space => {
            const isSelected = selected.has(space.id);
            return (
              <OptionRow key={space.id} selected={isSelected} onClick={() => onToggleSpace(space.id)}>
                <CheckboxVisual checked={isSelected} />
                <span className="relative size-4 shrink-0 overflow-hidden rounded-sm bg-grey-01">
                  <NativeGeoImage value={space.image ?? ''} alt="" className="h-full w-full object-cover" />
                </span>
                <span className="min-w-0 flex-1 truncate text-text">{space.name ?? space.id}</span>
              </OptionRow>
            );
          })}
          {isLoading && rows.length === 0 ? (
            <li className="px-3 py-2 text-footnoteMedium text-grey-04">Loading spaces…</li>
          ) : rows.length === 0 ? (
            <li className="px-3 py-2 text-footnoteMedium text-grey-04">No spaces</li>
          ) : null}
        </>
      )}
    </FilterDropdown>
  );
}

function TagFilter({
  tags,
  onAddTag,
  onRemoveTag,
}: {
  tags: SearchFilterTag[];
  onAddTag: (tag: SearchFilterTag) => void;
  onRemoveTag: (id: string) => void;
}) {
  const { query, onQueryChange, results, isLoading, isEmpty, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useSearch({ includeNonCanonical: true });
  const selectedIds = React.useMemo(() => new Set(tags.map(tag => tag.id)), [tags]);
  const resultsRef = React.useRef<HTMLUListElement | null>(null);

  const handleScroll = useFetchNextPageOnScroll<HTMLUListElement>({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    scrollRef: resultsRef,
    distanceFromBottom: 80,
  });

  const choose = (tag: SearchFilterTag) => {
    onAddTag(tag);
    onQueryChange('');
  };

  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>Tags</SectionLabel>

      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(tag => (
            <span
              key={tag.id}
              className="inline-flex h-6 max-w-full items-center gap-1 rounded border border-text px-2 text-[0.6875rem] text-text"
            >
              <span className="truncate">{tag.name ?? tag.id}</span>
              <button
                type="button"
                aria-label={`Remove ${tag.name ?? 'tag'}`}
                onClick={() => onRemoveTag(tag.id)}
                className="shrink-0 text-grey-04 transition-colors hover:text-text"
              >
                <CheckCloseSmall />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <Input value={query} onChange={event => onQueryChange(event.currentTarget.value)} placeholder="Filter by tag…" />

      {query.trim().length > 0 ? (
        <ul
          ref={resultsRef}
          onScroll={handleScroll}
          onWheel={event => trapWheelToElement(event.currentTarget, event)}
          className="m-0 flex max-h-40 list-none flex-col overflow-y-auto overscroll-contain rounded border border-grey-02"
        >
          {isLoading && results.length === 0 ? (
            <li className="px-3 py-2 text-footnoteMedium text-grey-04">Searching…</li>
          ) : isEmpty ? (
            <li className="px-3 py-2 text-footnoteMedium text-grey-04">No matches</li>
          ) : (
            <>
              {results.map(result => {
                const alreadySelected = selectedIds.has(result.id);
                return (
                  <li key={result.id} className="border-b border-divider last:border-none">
                    <button
                      type="button"
                      disabled={alreadySelected}
                      onClick={() => choose({ id: result.id, name: result.name })}
                      className={cx(
                        'flex w-full flex-col items-start gap-1 px-3 py-2 text-left transition-colors',
                        alreadySelected ? 'cursor-not-allowed bg-grey-01' : 'hover:bg-grey-01'
                      )}
                    >
                      <span className="max-w-full truncate text-footnoteMedium text-text">
                        {result.name ?? result.id}
                      </span>
                      {result.types.length > 0 ? (
                        <span className="flex flex-wrap items-center gap-1">
                          {result.types.slice(0, 3).map(type => (
                            <Tag key={type.id}>{type.name}</Tag>
                          ))}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
              {isFetchingNextPage ? (
                <li className="px-3 py-2 text-footnoteMedium text-grey-04">Loading more…</li>
              ) : null}
            </>
          )}
        </ul>
      ) : null}
    </div>
  );
}
