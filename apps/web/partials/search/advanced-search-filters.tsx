'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';

import { EXPLORE_ENTITY_TYPES } from '~/core/explore/explore-constants';
import { useFetchNextPageOnScroll } from '~/core/hooks/use-fetch-next-page-on-scroll';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSearch } from '~/core/hooks/use-search';
import { useSpace } from '~/core/hooks/use-space';
import { useSpacesWhereMember } from '~/core/hooks/use-spaces-where-member';
import { hasName } from '~/core/utils/utils';

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
  onSelectAllSpaces: () => void;
  typeIds: string[];
  onToggleType: (id: string) => void;
  onClearTypes: () => void;
  tags: SearchFilterTag[];
  onAddTag: (tag: SearchFilterTag) => void;
  onRemoveTag: (id: string) => void;
  portalContainer: HTMLElement | null;
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
 * `portalContainer`); tags are a free entity search. Selections feed `useSearch`
 * (`filterBySpaceIds` + `includeNonCanonical` / `filterByTypes` / `filterByTags`).
 */
export function AdvancedSearchFilters({
  canonicalOnly,
  onToggleCanonicalOnly,
  selectedSpaceIds,
  onToggleSpace,
  onSelectAllSpaces,
  typeIds,
  onToggleType,
  onClearTypes,
  tags,
  onAddTag,
  onRemoveTag,
  portalContainer,
}: Props) {
  return (
    <div className="flex flex-col gap-3" onKeyDown={shieldNavigationKeys}>
      <div className="flex items-start gap-2">
        <SpaceFilter
          canonicalOnly={canonicalOnly}
          onToggleCanonicalOnly={onToggleCanonicalOnly}
          selectedSpaceIds={selectedSpaceIds}
          onToggleSpace={onToggleSpace}
          onSelectAllSpaces={onSelectAllSpaces}
          container={portalContainer}
        />
        <TypeFilter
          typeIds={typeIds}
          onToggleType={onToggleType}
          onClearTypes={onClearTypes}
          container={portalContainer}
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
  children,
}: {
  label: string;
  trigger: React.ReactNode;
  container: HTMLElement | null;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
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
      <Popover.Portal container={container ?? undefined}>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          avoidCollisions
          collisionPadding={12}
          onKeyDown={shieldNavigationKeys}
          onOpenAutoFocus={event => event.preventDefault()}
          className="z-100 w-(--radix-popper-anchor-width) min-w-[12rem] rounded border border-grey-02 bg-white shadow-lg"
        >
          <ul
            onWheel={event => trapWheelToElement(event.currentTarget, event)}
            className="m-0 flex max-h-52 list-none flex-col overflow-y-auto overscroll-contain"
          >
            {children(() => setOpen(false))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
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
}: {
  typeIds: string[];
  onToggleType: (id: string) => void;
  onClearTypes: () => void;
  container: HTMLElement | null;
}) {
  const selectedTypes = React.useMemo(() => new Set(typeIds), [typeIds]);
  const label =
    typeIds.length === 0 ? 'Any type' : `${typeIds.length} ${typeIds.length === 1 ? 'type' : 'types'} selected`;

  return (
    <FilterDropdown
      label="Types"
      container={container}
      trigger={<span className={cx('truncate', typeIds.length === 0 && 'text-grey-04')}>{label}</span>}
    >
      {() => (
        <>
          {/* Multi-select, so picking a type keeps the menu open; the reset row is the only way to clear. */}
          <OptionRow selected={typeIds.length === 0} onClick={onClearTypes}>
            Any type
          </OptionRow>
          {EXPLORE_ENTITY_TYPES.map(type => {
            const selected = selectedTypes.has(type.id);
            return (
              <OptionRow key={type.id} selected={selected} onClick={() => onToggleType(type.id)}>
                <CheckboxVisual checked={selected} />
                <span className="min-w-0 flex-1 truncate text-text">{type.label}</span>
              </OptionRow>
            );
          })}
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
  onSelectAllSpaces,
  container,
}: {
  canonicalOnly: boolean;
  onToggleCanonicalOnly: () => void;
  selectedSpaceIds: string[];
  onToggleSpace: (id: string) => void;
  onSelectAllSpaces: () => void;
  container: HTMLElement | null;
}) {
  const { personalSpaceId } = usePersonalSpaceId();
  const { space: personalSpace } = useSpace(personalSpaceId ?? undefined);
  const memberSpaces = useSpacesWhereMember(personalSpaceId ?? undefined);

  // The viewer's own spaces — personal first, then member/editor — named only, mirroring the
  // "create entity in space" list already in the dialog.
  const spaces = React.useMemo(() => {
    const list = [...memberSpaces];
    if (personalSpace && !list.some(space => space.id === personalSpace.id)) {
      list.unshift(personalSpace);
    }
    return list.filter(space => hasName(space?.entity?.name));
  }, [personalSpace, memberSpaces]);

  // Drop selected spaces that have fallen out of the member list
  React.useEffect(() => {
    if (spaces.length === 0) return;
    const known = new Set(spaces.map(space => space.id));
    const stale = selectedSpaceIds.filter(id => !known.has(id));
    stale.forEach(onToggleSpace);
  }, [spaces, selectedSpaceIds, onToggleSpace]);

  const selected = React.useMemo(() => new Set(selectedSpaceIds), [selectedSpaceIds]);
  const label =
    selectedSpaceIds.length === 0
      ? 'All spaces'
      : selectedSpaceIds.length === 1
        ? (spaces.find(space => space.id === selectedSpaceIds[0])?.entity?.name ?? '1 space')
        : `${selectedSpaceIds.length} spaces`;

  return (
    <FilterDropdown label="Spaces" container={container} trigger={<span className="truncate">{label}</span>}>
      {() => (
        <>
          <OptionRow selected={canonicalOnly} onClick={onToggleCanonicalOnly}>
            <CheckboxVisual checked={canonicalOnly} />
            <span className="min-w-0 flex-1 truncate text-text">Canonical only</span>
          </OptionRow>
          {!canonicalOnly ? (
            <li className="border-b border-divider px-3 py-2 text-footnote text-grey-04 last:border-none">
              Turn on Canonical only to filter by space.
            </li>
          ) : null}
          <OptionRow selected={selectedSpaceIds.length === 0} onClick={onSelectAllSpaces} disabled={!canonicalOnly}>
            All spaces
          </OptionRow>
          {spaces.map(space => {
            const isSelected = selected.has(space.id);
            return (
              <OptionRow
                key={space.id}
                selected={isSelected}
                onClick={() => onToggleSpace(space.id)}
                disabled={!canonicalOnly}
              >
                <CheckboxVisual checked={isSelected} />
                <span className="relative size-4 shrink-0 overflow-hidden rounded-sm bg-grey-01">
                  <NativeGeoImage value={space.entity.image} alt="" className="h-full w-full object-cover" />
                </span>
                <span className="min-w-0 flex-1 truncate text-text">{space.entity.name}</span>
              </OptionRow>
            );
          })}
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
