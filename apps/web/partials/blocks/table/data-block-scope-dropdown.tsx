'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import cx from 'classnames';

import type { Source } from '~/core/blocks/data/source';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { useSpacesQuery } from '~/core/hooks/use-spaces-query';
import { hasName } from '~/core/utils/utils';
import { Dots } from '~/design-system/dots';
import { NativeGeoImage } from '~/design-system/geo-image';
import { Check } from '~/design-system/icons/check';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Input } from '~/design-system/input';
import { MenuItem } from '~/design-system/menu';

type Props = {
  source: Source;
  setSource: (source: Source) => void;
  disabled?: boolean;
  readOnly?: boolean;
};

type InitialSpaceRow = {
  id: string;
  name: string;
  image: string | null;
};

const triggerClassName =
  'inline-flex h-6 max-w-[240px] shrink-0 items-center gap-1.5 rounded border border-grey-02 bg-white px-1.5 text-metadata text-text shadow-button transition hover:border-text hover:bg-bg focus:border-text focus:shadow-inner-text focus:outline-hidden disabled:pointer-events-none disabled:opacity-50';

function scopeLabel(source: Source, spacesById: ReturnType<typeof useSpacesByIds>['spacesById']): string {
  switch (source.type) {
    case 'COLLECTION':
      return 'Collection';
    case 'GEO':
      return 'All of Geo';
    case 'SPACES':
      if (source.value.length === 0) return 'Spaces';
      if (source.value.length === 1) return spacesById.get(source.value[0])?.entity?.name ?? 'Space';
      return `${source.value.length} spaces`;
    case 'RELATIONS':
      return source.name ?? 'Entity';
    default:
      return 'Scope';
  }
}

export function DataBlockScopeDropdown({ source, setSource, disabled, readOnly = false }: Props) {
  const [open, setOpen] = React.useState(false);
  const { query, setQuery, spaces: queriedSpaces, isLoading } = useSpacesQuery(open);
  const selectedSpaceIds = React.useMemo(() => (source.type === 'SPACES' ? [...new Set(source.value)] : []), [source]);
  const [draftSelectedSpaceIds, setDraftSelectedSpaceIds] = React.useState<string[]>(selectedSpaceIds);
  const { spacesById } = useSpacesByIds(selectedSpaceIds);
  const { data: initialSpaces = [], isLoading: isInitialLoading } = useQuery({
    queryKey: ['data-block-initial-space-list'],
    queryFn: async () => {
      const response = await fetch('/api/spaces/initial-list');
      if (!response.ok) return [] as InitialSpaceRow[];
      const payload = (await response.json()) as { spaces?: InitialSpaceRow[] };
      return payload.spaces ?? [];
    },
    enabled: open,
    staleTime: 60_000,
  });

  const label = React.useMemo(() => scopeLabel(source, spacesById), [source, spacesById]);
  const trimmedQuery = query.trim();
  const visibleSpaces = React.useMemo(() => {
    if (trimmedQuery.length > 0) {
      return queriedSpaces
        .filter(space => hasName(space.name))
        .map(space => ({
          id: space.id,
          name: space.name ?? '',
          image: space.image ?? null,
        }));
    }
    return initialSpaces;
  }, [trimmedQuery, queriedSpaces, initialSpaces]);

  const toggleSpace = (spaceId: string) => {
    const set = new Set(draftSelectedSpaceIds);
    if (set.has(spaceId)) {
      set.delete(spaceId);
    } else {
      set.add(spaceId);
    }

    const next = [...set];
    setDraftSelectedSpaceIds(next);
    if (next.length === 0) {
      setSource({ type: 'GEO' });
      return;
    }
    setSource({ type: 'SPACES', value: next });
  };

  const onPickAllOfGeo = () => {
    setDraftSelectedSpaceIds([]);
    setSource({ type: 'GEO' });
  };

  React.useEffect(() => {
    if (open) {
      setDraftSelectedSpaceIds(selectedSpaceIds);
    }
  }, [open, selectedSpaceIds]);

  React.useEffect(() => {
    if (source.type === 'SPACES' && source.value.length === 0) {
      setSource({ type: 'GEO' });
    }
  }, [setSource, source]);

  if (readOnly) {
    return <span className="truncate text-metadata text-grey-04">{label}</span>;
  }

  return (
    <Dropdown.Root open={open} onOpenChange={setOpen}>
      <Dropdown.Trigger asChild disabled={disabled}>
        <button type="button" className={triggerClassName}>
          <span className="truncate">{label}</span>
          <span className={cx('inline-flex shrink-0 transition-transform', open && 'rotate-180')}>
            <ChevronDownSmall color="grey-04" />
          </span>
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          sideOffset={8}
          align="start"
          className="z-1001 flex max-h-[min(420px,80vh)] w-[min(320px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg"
        >
          <div className="shrink-0 border-b border-grey-02 px-2.5 py-1.5">
            <p className="text-footnoteMedium text-grey-04">Query from</p>
          </div>
          <div className="shrink-0 border-b border-grey-02 p-1.5">
            <Input
              withSearchIcon
              placeholder="Search..."
              value={query}
              onChange={event => setQuery(event.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => e.stopPropagation()}
            />
          </div>
          <div className="shrink-0 px-0.5 pb-1">
            <MenuItem active={source.type === 'GEO'} onClick={onPickAllOfGeo} className="py-1.5 text-metadata">
              <div className="grid w-full grid-cols-[minmax(0,1fr)_16px] items-center gap-2">
                <span className="text-metadata text-text">All of Geo</span>
                <span className="flex h-4 w-4 items-center justify-center justify-self-end">
                  {source.type === 'GEO' && <Check />}
                </span>
              </div>
            </MenuItem>
          </div>
          <div className="max-h-[273px] w-full overflow-y-auto">
            {(trimmedQuery.length > 0 ? isLoading : isInitialLoading) && (
              <div className="flex h-12 items-center justify-center">
                <Dots />
              </div>
            )}
            {visibleSpaces.map(space => {
                const active = draftSelectedSpaceIds.includes(space.id);

                return (
                  <Dropdown.Item key={space.id} asChild onSelect={event => event.preventDefault()}>
                    <MenuItem onClick={() => toggleSpace(space.id)} active={active} className="group py-1.5 text-metadata">
                      <div className="grid w-full grid-cols-[12px_minmax(0,1fr)_16px] items-center gap-2">
                        <div className="shrink-0">
                          {space.image ? (
                            <NativeGeoImage value={space.image} className="h-[12px] w-[12px] rounded-sm" />
                          ) : (
                            <img src={PLACEHOLDER_SPACE_IMAGE} alt="" className="h-[12px] w-[12px] rounded-sm" />
                          )}
                        </div>
                        <div className="truncate text-metadata text-text">{space.name}</div>
                        <span className="flex h-4 w-4 items-center justify-center justify-self-end text-grey-04">
                          {active && <Check />}
                        </span>
                      </div>
                    </MenuItem>
                  </Dropdown.Item>
                );
              })}
          </div>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
