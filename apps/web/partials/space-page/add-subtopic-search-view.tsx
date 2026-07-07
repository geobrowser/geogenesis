'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import { useProposeSubtopicRelation } from '~/core/hooks/use-propose-subtopic-relation';
import { useSubtopicChildren } from '~/core/hooks/use-subtopic-children';
import { useSubtopicSearch } from '~/core/hooks/use-subtopic-search';
import type { SubtopicSearchResult } from '~/core/io/subgraph/fetch-subtopic-search';

import { Dots } from '~/design-system/dots';
import { Search } from '~/design-system/icons/search';
import { Tag } from '~/design-system/tag';

import { SubtopicsDialogPopoverContext } from '~/partials/space-page/subtopics-dialog-shell';

export type AddSubtopicTarget = {
  parentEntityId: string;
  parentName: string;
};

interface AddSubtopicSearchViewProps {
  spaceId: string;
  target: AddSubtopicTarget;
  onProposed: () => void;
}

export function AddSubtopicSearchView({ spaceId, target, onProposed }: AddSubtopicSearchViewProps) {
  const popoverContainer = React.useContext(SubtopicsDialogPopoverContext);
  const { proposeAdd, proposeCreateAndAdd, isPending, isPersonalSpace } = useProposeSubtopicRelation(spaceId);
  const addActionLabel = isPersonalSpace ? 'Add' : 'Propose to add';
  const { query, onQueryChange, results, isLoading } = useSubtopicSearch();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [isDropdownVisible, setIsDropdownVisible] = React.useState(false);

  const { parentEntityId, parentName } = target;

  // Fetch the parent's children here (rather than trusting a set passed from the
  // tree) so dedup is authoritative even when the node was never expanded, and so
  // we can block proposing until the list has loaded. Shares the tree's cache key,
  // so it's instant when the node is already expanded.
  const { data: children = [], isLoading: isChildrenLoading } = useSubtopicChildren(parentEntityId, spaceId, true);
  const existingChildIds = React.useMemo(() => new Set(children.map(child => child.id)), [children]);
  const canPropose = !isPending && !isChildrenLoading;

  const handlePropose = async (result: { id: string; name: string | null }) => {
    if (!canPropose || existingChildIds.has(result.id)) return;

    await proposeAdd({
      parentEntityId,
      parentName,
      childEntityId: result.id,
      childName: result.name,
    });
    onProposed();
  };

  const handleCreate = async () => {
    const name = query.trim();
    if (!name || isPending) return;

    await proposeCreateAndAdd({ parentEntityId, parentName, name });
    onProposed();
  };

  const visibleResults = React.useMemo(
    () => results.filter(result => !existingChildIds.has(result.id)),
    [results, existingChildIds]
  );

  const isShowingSuggestions = query.trim().length === 0;
  const isDropdownOpen = isDropdownVisible;

  return (
    <div className="py-1">
      {/* onOpenChange lets Radix dismiss the dropdown on Escape / internal close. */}
      <Popover.Root open={isDropdownOpen} onOpenChange={setIsDropdownVisible}>
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
                {!isLoading && isShowingSuggestions && visibleResults.length > 0 && (
                  <div className="px-3 pt-2 pb-1 text-footnote text-grey-04">Suggested topics</div>
                )}
                {!isLoading &&
                  visibleResults.map((result, index) => (
                    <SubtopicSearchResultRow
                      key={result.id}
                      result={result}
                      showDivider={index > 0}
                      disabled={!canPropose}
                      actionLabel={addActionLabel}
                      onPropose={() => void handlePropose(result)}
                    />
                  ))}
                {!isLoading && isShowingSuggestions && visibleResults.length === 0 && (
                  <div className="px-3 py-2 text-button text-grey-04">No suggestions available</div>
                )}
                {!isLoading && !isShowingSuggestions && (
                  <CreateSubtopicRow
                    name={query.trim()}
                    disabled={isPending}
                    showDivider={visibleResults.length > 0}
                    onCreate={() => void handleCreate()}
                  />
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
  actionLabel,
  onPropose,
}: {
  result: SubtopicSearchResult;
  showDivider: boolean;
  disabled: boolean;
  actionLabel: string;
  onPropose: () => void;
}) {
  return (
    <div>
      {showDivider && <div className="h-px w-full bg-divider" />}
      <div className="flex items-start justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <span className="block truncate text-button text-text">{result.name ?? 'Untitled'}</span>
          {result.types.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {result.types.slice(0, 3).map((type, index) => (
                <Tag key={`${type.id}-${index}`}>{type.name ?? 'Untitled'}</Tag>
              ))}
              {result.types.length > 3 ? <Tag>{`+${result.types.length - 3}`}</Tag> : null}
            </div>
          )}
          {result.description && <p className="mt-1 line-clamp-2 text-footnote text-grey-04">{result.description}</p>}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onPropose}
          className="h-8 shrink-0 rounded-[8px] border border-grey-02 bg-white px-3 text-button text-text shadow-light transition hover:border-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function CreateSubtopicRow({
  name,
  disabled,
  showDivider,
  onCreate,
}: {
  name: string;
  disabled: boolean;
  showDivider: boolean;
  onCreate: () => void;
}) {
  return (
    <div>
      {showDivider && <div className="h-px w-full bg-divider" />}
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-button text-grey-04">
          Create new topic <span className="font-medium text-text">&ldquo;{name}&rdquo;</span>
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={onCreate}
          className="h-8 shrink-0 rounded-[8px] border border-grey-02 bg-white px-3 text-button text-text shadow-light transition hover:border-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          Create &amp; add
        </button>
      </div>
    </div>
  );
}
