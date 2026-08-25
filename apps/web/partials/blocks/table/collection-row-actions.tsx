'use client';

import * as Popover from '@radix-ui/react-popover';

import { useEffect, useRef, useState } from 'react';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useSpace } from '~/core/hooks/use-space';
import { EntityId } from '~/core/io/substream-schema';
import { useMutate } from '~/core/sync/use-mutate';
import { NavUtils } from '~/core/utils/utils';

import { GeoImage } from '~/design-system/geo-image';
import { Menu } from '~/design-system/icons/menu';
import { RelationSmall } from '~/design-system/icons/relation-small';
import { RightArrowLongSmall } from '~/design-system/icons/right-arrow-long-small';
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
  const { storage } = useMutate();
  const { blockEntity } = useDataBlock();
  const { space } = useSpace(spaceId ?? '');

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

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
      {(relationId || isEditing) && (
        <Popover.Root open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              aria-label="Show row actions"
              onMouseEnter={() => {
                if (closeTimeoutRef.current) {
                  clearTimeout(closeTimeoutRef.current);
                  closeTimeoutRef.current = null;
                }
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
      {showSidePanel && (
        <DataBlockOpenSidePanelButton
          entityId={entityId}
          entitySpaceId={spaceId ?? currentSpaceId}
          openedWithMainViewEditing={openedWithMainViewEditing}
        />
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
