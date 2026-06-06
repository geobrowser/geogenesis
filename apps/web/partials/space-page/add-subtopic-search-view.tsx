'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import { useProposeSubtopicRelation } from '~/core/hooks/use-propose-subtopic-relation';
import { useSubtopicSearch } from '~/core/hooks/use-subtopic-search';
import type { SubtopicSearchResult } from '~/core/io/subgraph/fetch-subtopic-search';

import { Dots } from '~/design-system/dots';
import { Search } from '~/design-system/icons/search';
import { SubtopicsDialogPopoverContext } from '~/partials/space-page/subtopics-dialog-shell';

export type AddSubtopicTarget = {
  parentEntityId: string;
  parentName: string;
  existingChildIds: Set<string>;
};

interface AddSubtopicSearchViewProps {
  spaceId: string;
  target: AddSubtopicTarget;
  onProposed: () => void;
}

export function AddSubtopicSearchView({ spaceId, target, onProposed }: AddSubtopicSearchViewProps) {
  const popoverContainer = React.useContext(SubtopicsDialogPopoverContext);
  const { proposeAdd, isPending } = useProposeSubtopicRelation(spaceId);
  const { query, onQueryChange, results, isLoading } = useSubtopicSearch();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [isDropdownVisible, setIsDropdownVisible] = React.useState(false);

  const { parentEntityId, parentName, existingChildIds } = target;

  const handlePropose = async (result: { id: string; name: string | null }) => {
    if (existingChildIds.has(result.id) || isPending) return;

    await proposeAdd({
      parentEntityId,
      parentName,
      childEntityId: result.id,
      childName: result.name,
    });
    onProposed();
  };

  const visibleResults = React.useMemo(
    () => results.filter(result => !existingChildIds.has(result.id)),
    [results, existingChildIds]
  );

  const isDropdownOpen = isDropdownVisible && query.trim().length > 0;

  return (
    <div className="py-1">
      <Popover.Root open={isDropdownOpen}>
        <Popover.Anchor asChild>
          <div className="relative w-full">
            <div className="absolute top-0 bottom-0 left-3 z-10 flex items-center">
              <Search />
            </div>
            <input
              ref={inputRef}
              autoFocus
              placeholder="Search..."
              value={query}
              onFocus={() => setIsDropdownVisible(true)}
              onChange={e => {
                onQueryChange(e.target.value);
                setIsDropdownVisible(true);
              }}
              className="w-full appearance-none rounded px-[10px] py-[9px] pl-9 text-input text-text shadow-inner shadow-grey-02 outline-hidden transition-all duration-150 placeholder:text-grey-03 hover:shadow-inner hover:shadow-grey-02 focus:shadow-inner focus:shadow-grey-02"
            />
          </div>
        </Popover.Anchor>
        {isDropdownOpen && (
          <Popover.Portal container={popoverContainer ?? undefined}>
            <Popover.Content
              side="bottom"
              align="start"
              sideOffset={4}
              avoidCollisions
              onOpenAutoFocus={event => {
                event.preventDefault();
                event.stopPropagation();
                inputRef.current?.focus();
              }}
              onCloseAutoFocus={event => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onInteractOutside={event => {
                const targetNode = event.target as Node | null;
                if (targetNode && inputRef.current?.contains(targetNode)) {
                  event.preventDefault();
                  return;
                }
                setIsDropdownVisible(false);
              }}
              className="z-1001 w-[var(--radix-popper-anchor-width)] overflow-hidden rounded-[12px] border border-grey-02 bg-white shadow-lg"
            >
              <div className="max-h-[280px] overflow-y-auto">
                {isLoading && (
                  <div className="flex h-12 items-center justify-center">
                    <Dots />
                  </div>
                )}
                {!isLoading &&
                  visibleResults.map((result, index) => (
                    <SubtopicSearchResultRow
                      key={result.id}
                      result={result}
                      showDivider={index > 0}
                      disabled={isPending}
                      onPropose={() => void handlePropose(result)}
                    />
                  ))}
                {!isLoading && visibleResults.length === 0 && (
                  <div className="px-3 py-2 text-button text-grey-04">No results found</div>
                )}
              </div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </Popover.Root>
    </div>
  );
}

function SubtopicSearchResultRow({
  result,
  showDivider,
  disabled,
  onPropose,
}: {
  result: SubtopicSearchResult;
  showDivider: boolean;
  disabled: boolean;
  onPropose: () => void;
}) {
  return (
    <div>
      {showDivider && <div className="h-px w-full bg-divider" />}
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <span className="truncate text-button text-text">{result.name ?? 'Untitled'}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={onPropose}
          className="h-8 shrink-0 rounded-[8px] border border-grey-02 bg-white px-3 text-button text-text shadow-light transition hover:border-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          Propose to add
        </button>
      </div>
    </div>
  );
}
