'use client';

import * as React from 'react';

import cx from 'classnames';

import { EXPLORE_ENTITY_TYPES } from '~/core/explore/explore-constants';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSearch } from '~/core/hooks/use-search';
import { useSpace } from '~/core/hooks/use-space';
import { useSpacesWhereMember } from '~/core/hooks/use-spaces-where-member';
import { hasName } from '~/core/utils/utils';

import { NativeGeoImage } from '~/design-system/geo-image';
import { CheckCloseSmall } from '~/design-system/icons/check-close-small';
import { Input } from '~/design-system/input';
import { Tag } from '~/design-system/tag';
import { trapWheelToElement } from '~/design-system/trap-wheel-scroll';

export type SearchFilterTag = { id: string; name: string | null };

type Props = {
  typeIds: string[];
  onToggleType: (id: string) => void;
  spaceId: string | null;
  onSelectSpace: (id: string | null) => void;
  tags: SearchFilterTag[];
  onAddTag: (tag: SearchFilterTag) => void;
  onRemoveTag: (id: string) => void;
};

const CHIP_BASE =
  'inline-flex h-6 max-w-full items-center gap-1 rounded border px-2 text-[0.6875rem] transition-colors focus:outline-hidden';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-footnoteMedium text-grey-04">{children}</span>;
}

/**
 * The type/space/tag filters shown under global search Advanced.
 */
export function AdvancedSearchFilters({
  typeIds,
  onToggleType,
  spaceId,
  onSelectSpace,
  tags,
  onAddTag,
  onRemoveTag,
}: Props) {
  const selectedTypes = React.useMemo(() => new Set(typeIds), [typeIds]);

  const shieldNavigationKeys = React.useCallback((event: React.KeyboardEvent) => {
    if (['Enter', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.stopPropagation();
    }
  }, []);

  return (
    <div className="flex flex-col gap-3" onKeyDown={shieldNavigationKeys}>
      <div className="flex flex-col gap-1.5">
        <SectionLabel>Types</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {EXPLORE_ENTITY_TYPES.map(type => {
            const selected = selectedTypes.has(type.id);
            return (
              <button
                key={type.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onToggleType(type.id)}
                className={cx(
                  CHIP_BASE,
                  selected ? 'border-text text-text' : 'border-grey-02 text-grey-04 hover:border-text'
                )}
              >
                <span className="truncate">{type.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <SpaceFilter spaceId={spaceId} onSelectSpace={onSelectSpace} />

      <TagFilter tags={tags} onAddTag={onAddTag} onRemoveTag={onRemoveTag} />
    </div>
  );
}

function SpaceFilter({
  spaceId,
  onSelectSpace,
}: {
  spaceId: string | null;
  onSelectSpace: (id: string | null) => void;
}) {
  const { personalSpaceId } = usePersonalSpaceId();
  const { space: personalSpace } = useSpace(personalSpaceId ?? undefined);
  const memberSpaces = useSpacesWhereMember(personalSpaceId ?? undefined);

  const spaces = React.useMemo(() => {
    const list = [...memberSpaces];
    if (personalSpace && !list.some(space => space.id === personalSpace.id)) {
      list.unshift(personalSpace);
    }
    return list.filter(space => hasName(space?.entity?.name));
  }, [personalSpace, memberSpaces]);

  if (spaces.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>Space</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {spaces.map(space => {
          const selected = space.id === spaceId;
          return (
            <button
              key={space.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelectSpace(selected ? null : space.id)}
              className={cx(
                CHIP_BASE,
                selected ? 'border-text text-text' : 'border-grey-02 text-grey-04 hover:border-text'
              )}
            >
              <span className="relative size-3.5 shrink-0 overflow-hidden rounded-sm bg-grey-01">
                <NativeGeoImage value={space.entity.image} alt="" className="h-full w-full object-cover" />
              </span>
              <span className="truncate">{space.entity.name}</span>
            </button>
          );
        })}
      </div>
    </div>
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
  const { query, onQueryChange, results, isLoading, isEmpty } = useSearch({ includeNonCanonical: true });
  const selectedIds = React.useMemo(() => new Set(tags.map(tag => tag.id)), [tags]);
  const resultsRef = React.useRef<HTMLUListElement | null>(null);

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
          onWheel={event => trapWheelToElement(event.currentTarget, event)}
          className="m-0 flex max-h-40 list-none flex-col overflow-y-auto overscroll-contain rounded border border-grey-02"
        >
          {isLoading && results.length === 0 ? (
            <li className="px-3 py-2 text-footnoteMedium text-grey-04">Searching…</li>
          ) : isEmpty ? (
            <li className="px-3 py-2 text-footnoteMedium text-grey-04">No matches</li>
          ) : (
            results.map(result => {
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
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
