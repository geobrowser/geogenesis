'use client';

import * as Popover from '@radix-ui/react-popover';

import { useEffect, useRef, useState } from 'react';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useSpace } from '~/core/hooks/use-space';
import { EntityId } from '~/core/io/substream-schema';
import { useMutate } from '~/core/sync/use-mutate';
import { NavUtils } from '~/core/utils/utils';

import { GeoImage } from '~/design-system/geo-image';
import { CopySmall } from '~/design-system/icons/copy-small';
import { Menu } from '~/design-system/icons/menu';
import { RelationSmall } from '~/design-system/icons/relation-small';
import { RightArrowLongSmall } from '~/design-system/icons/right-arrow-long-small';
import { TickSmall } from '~/design-system/icons/tick-small';
import { TopRanked } from '~/design-system/icons/top-ranked';
import { Trash } from '~/design-system/icons/trash';
import { PrefetchLink } from '~/design-system/prefetch-link';
import { SelectSpaceAsPopover } from '~/design-system/select-space-dialog';

import type { onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { DataBlockOpenSidePanelButton } from '~/partials/blocks/table/data-block-open-side-panel-button';

type CollectionRowActionsProps = {
  isEditing: boolean;
  currentSpaceId: string;
  entityId: string;
  spaceId?: string;
  relationId?: string;
  verified?: boolean;
  onLinkEntry: onLinkEntryFn;
  showSidePanel?: boolean;
  openedWithMainViewEditing?: boolean;
};

export function CollectionRowActions({
  isEditing,
  currentSpaceId,
  entityId,
  spaceId,
  relationId,
  verified,
  onLinkEntry,
  showSidePanel = true,
  openedWithMainViewEditing = false,
}: CollectionRowActionsProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  // The space-selector is a nested popover. Its content is portaled outside this
  // popover's DOM, so opening it would normally fire `onFocusOutside` /
  // `onInteractOutside` on the outer popover and immediately unmount the nested
  // popover along with us. Track its open state and suppress the outer's
  // dismiss handlers while it's active.
  const [isSpacePopoverOpen, setIsSpacePopoverOpen] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether this popover opened because a cursor crossed the trigger, rather than because someone
  // asked for it. On close Radix hands focus back to the trigger, which is right for a popover you
  // opened on purpose and wrong for one that opened on the way past: focus lands on a button nobody
  // focused, every view's `group-focus-within:visible` matches, and the row's controls stay up with
  // the pointer long gone. Keyboard opens still get their focus back — see `onCloseAutoFocus`.
  const openedByHoverRef = useRef(false);
  const [hasCopiedId, setHasCopiedId] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { storage } = useMutate();
  const { blockEntity } = useDataBlock();
  const { space } = useSpace(spaceId ?? '');

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
      if (announceTimeoutRef.current) {
        clearTimeout(announceTimeoutRef.current);
      }
    };
  }, []);

  const onCopyEntityId = async () => {
    // Clipboard writes reject on insecure origins, on denied permissions, and when the document
    // isn't focused. None of that is worth breaking a row over, and leaving the icon alone is the
    // honest response — a tick would claim a copy that never happened.
    try {
      await navigator.clipboard.writeText(entityId);
    } catch (error) {
      console.error('Failed to copy entity ID', entityId, error);
      return;
    }

    // Empty the region, then fill it on the next commit. A live region announces when its text
    // changes, and for a second copy inside the confirmation window the text is identical — so
    // without an empty render in between, the words are already there and nothing is announced.
    // The copy happened; the confirmation is what goes missing.
    if (copiedTimeoutRef.current) {
      clearTimeout(copiedTimeoutRef.current);
    }
    if (announceTimeoutRef.current) {
      clearTimeout(announceTimeoutRef.current);
    }

    setHasCopiedId(false);
    announceTimeoutRef.current = setTimeout(() => {
      setHasCopiedId(true);
      copiedTimeoutRef.current = setTimeout(() => setHasCopiedId(false), 1500);
    }, 0);
  };

  // By the relation's own id, not by what it points at. `blockEntity.relations` holds everything
  // hanging off the block — its types, its blocks, its filters — so matching on `toEntity.id` would
  // delete whichever of those happened to reach this entity first. That was survivable while
  // removal took two deliberate interactions to reach; as a one-click control on every row it is
  // not. `relationId` is the collection-item relation for this row (use-mapping.ts:127), which is
  // exactly the one to drop.
  const onDeleteEntry = async () => {
    if (!blockEntity || !relationId) return;

    const blockRelation = blockEntity.relations.find(r => r.id === relationId);
    if (blockRelation) {
      storage.relations.delete(blockRelation);
    }
  };

  // A relation has two IDs: `id` (its own identifier, used for update/delete) and
  // `entityId` (the entity that represents the relation, used for navigation —
  // same pattern as LinkableRelationChip). Look up the collection-item relation by
  // its id and navigate to its entityId so the link lands on the relation entity
  // page, not on a non-existent entity at /space/.../$relation.id.
  //
  // Gate the scan on `isPopoverOpen`: in list/gallery views `CollectionRowActions`
  // is mounted per row (CSS-hidden until hover), so scanning every render would be
  // O(rows × relations). Radix only mounts `Popover.Content` (where the link
  // lives) while open, so the lookup only needs to be correct for the open row.
  const collectionItemRelation = isPopoverOpen ? blockEntity?.relations.find(r => r.id === relationId) : undefined;
  const relationEntityId = collectionItemRelation?.entityId ?? relationId;

  return (
    <div className="flex shrink-0 flex-nowrap items-center gap-0.5">
      {/* Side panel first: it is the one people reach for, so it keeps a fixed position rather than
          shifting left and right depending on whether the row has a menu to show. */}
      {showSidePanel && (
        <DataBlockOpenSidePanelButton
          entityId={entityId}
          entitySpaceId={spaceId ?? currentSpaceId}
          openedWithMainViewEditing={openedWithMainViewEditing}
        />
      )}
      {(relationId || isEditing) && (
        <Popover.Root
          open={isPopoverOpen}
          onOpenChange={next => {
            // Radix routes click and keyboard opens through here; hover sets the state directly
            // below, so anything arriving on this path was deliberate.
            if (next) openedByHoverRef.current = false;
            setIsPopoverOpen(next);
          }}
        >
          <Popover.Trigger asChild>
            <button
              type="button"
              aria-label="Show row actions"
              onMouseEnter={() => {
                if (closeTimeoutRef.current) {
                  clearTimeout(closeTimeoutRef.current);
                  closeTimeoutRef.current = null;
                }
                // Only when this is the event that opens it. A pointer wandering over the trigger of
                // a popover someone opened from the keyboard must not relabel it as a hover open, or
                // the close would skip the focus restoration that open is owed.
                if (!isPopoverOpen) openedByHoverRef.current = true;
                setIsPopoverOpen(true);
              }}
              onMouseLeave={() => {
                if (closeTimeoutRef.current) {
                  clearTimeout(closeTimeoutRef.current);
                }
                closeTimeoutRef.current = setTimeout(() => {
                  setIsPopoverOpen(false);
                }, 300);
              }}
              onMouseDown={e => e.preventDefault()}
              className="inline-flex shrink-0 items-center text-grey-03 transition duration-300 ease-in-out hover:text-text"
            >
              <Menu />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="top"
              sideOffset={-4}
              className="group z-100 flex items-center rounded-[7px] border border-grey-04 bg-white hover:bg-divider"
              onOpenAutoFocus={event => {
                event.preventDefault();
                event.stopPropagation();
              }}
              // Focus never entered a hover-opened popover, so there is nothing to give back, and
              // taking the default would strand it on the trigger and hold the row's controls open.
              // A popover opened by click or keyboard still returns focus the way it should.
              onCloseAutoFocus={event => {
                if (openedByHoverRef.current) event.preventDefault();
              }}
              // Unless focus did end up in here after all — tabbed in, or moved by something we
              // rendered. Whatever holds it is about to unmount, so from this point the close owes
              // focus a home and Radix's restoration is the only one on offer.
              onFocusCapture={() => {
                openedByHoverRef.current = false;
              }}
              onFocusOutside={event => {
                if (isSpacePopoverOpen) event.preventDefault();
              }}
              onInteractOutside={event => {
                if (isSpacePopoverOpen) event.preventDefault();
              }}
              onMouseEnter={() => {
                if (closeTimeoutRef.current) {
                  clearTimeout(closeTimeoutRef.current);
                  closeTimeoutRef.current = null;
                }
              }}
              onMouseLeave={() => {
                if (isSpacePopoverOpen) return;
                setIsPopoverOpen(false);
              }}
            >
              {isEditing && relationId && (
                <SelectSpaceAsPopover
                  entityId={EntityId(entityId)}
                  spaceId={spaceId}
                  verified={verified}
                  showVerified={false}
                  open={isSpacePopoverOpen}
                  onOpenChange={setIsSpacePopoverOpen}
                  onDone={result => {
                    if (!relationId) return;
                    onLinkEntry(relationId, result, verified);
                    setIsSpacePopoverOpen(false);
                  }}
                  trigger={
                    <button type="button" className="inline-flex items-center p-1">
                      <span className="inline-flex size-[12px] items-center justify-center rounded-sm border group-hover:border-grey-03 group-hover:text-grey-03 hover:border-text! hover:text-text!">
                        {space ? (
                          <div className="size-[8px] overflow-clip rounded-sm grayscale">
                            <GeoImage fill value={space.entity.image} alt="" />
                          </div>
                        ) : (
                          <TopRanked />
                        )}
                      </span>
                    </button>
                  }
                />
              )}
              {relationId && (
                <PrefetchLink
                  href={`/space/${currentSpaceId}/${relationEntityId}`}
                  className="p-1 group-hover:text-grey-03 hover:text-text!"
                >
                  <RelationSmall />
                </PrefetchLink>
              )}
              {/* The entity the row's relation points at, not the relation itself — the id you want
                  when writing a query or quoting a row in a ticket. The relation's own id is a click
                  away through the link beside this one (GEO-2679). */}
              <button
                type="button"
                // Stable, tick or no tick. Renaming a focused control mid-interaction is announced
                // inconsistently, and while it is renamed the button claims to be a thing that
                // happened rather than the thing it does. The tick below says what happened.
                aria-label="Copy entity ID"
                title="Copy entity ID"
                onClick={onCopyEntityId}
                onMouseDown={e => e.preventDefault()}
                className="inline-flex items-center p-1 group-hover:text-grey-03 hover:text-text!"
              >
                {hasCopiedId ? <TickSmall /> : <CopySmall />}
              </button>
              {/* A clipboard write leaves nothing behind to look at, so the tick is the whole
                  confirmation — and a tick is nothing at all if you are not looking. Mounted empty
                  with the popover so the region is already there when the text arrives, which is
                  what makes it announce. */}

              {/* A clipboard write leaves nothing behind to look at, so the tick is the whole
                  confirmation — and a tick is nothing at all if you are not looking. Mounted empty
                  with the popover so the region is already there when the text arrives, which is
                  what makes it announce. */}
              <span role="status" aria-live="polite" className="sr-only">
                {hasCopiedId ? 'Entity ID copied' : ''}
              </span>
              {isEditing && (
                <PrefetchLink
                  href={NavUtils.toEntity(spaceId ?? currentSpaceId, entityId, true)}
                  entityId={entityId}
                  spaceId={spaceId ?? currentSpaceId}
                  aria-label="Navigate to entity"
                  className="p-1 group-hover:text-grey-03 hover:text-text!"
                >
                  <RightArrowLongSmall />
                </PrefetchLink>
              )}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
      {/* Last in the row on purpose: the only destructive action here, kept furthest from the side
          panel people open by habit. Grey until hovered, then red — the row shouldn't shout at
          someone who is only reading it. No confirmation: this is an edit like any other, and the
          review bar is where it gets taken back. */}
      {isEditing && relationId && (
        <button
          type="button"
          aria-label="Remove from collection"
          title="Remove from collection"
          onClick={onDeleteEntry}
          onMouseDown={e => e.preventDefault()}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-grey-03 transition duration-300 ease-in-out hover:text-red-01"
        >
          <Trash />
        </button>
      )}
    </div>
  );
}
