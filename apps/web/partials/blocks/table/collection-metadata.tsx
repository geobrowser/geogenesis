'use client';

import * as Popover from '@radix-ui/react-popover';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import cx from 'classnames';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import type { DataBlockView } from '~/core/blocks/data/use-view';
import { useSpace } from '~/core/hooks/use-space';
import { EntityId } from '~/core/io/substream-schema';
import { useMutate } from '~/core/sync/use-mutate';
import { NavUtils } from '~/core/utils/utils';

import { GeoImage } from '~/design-system/geo-image';
import { CheckCircle } from '~/design-system/icons/check-circle';
import { CheckCloseSmall } from '~/design-system/icons/check-close-small';
import { Menu } from '~/design-system/icons/menu';
import { RelationSmall } from '~/design-system/icons/relation-small';
import { RightArrowLongChip } from '~/design-system/icons/right-arrow-long-chip';
import { TopRanked } from '~/design-system/icons/top-ranked';
import { PrefetchLink } from '~/design-system/prefetch-link';
import { SelectSpaceAsPopover } from '~/design-system/select-space-dialog';

import type { onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { DataBlockOpenSidePanelButton } from '~/partials/blocks/table/data-block-open-side-panel-button';

type CollectionMetadataProps = {
  view: DataBlockView;
  isEditing: boolean;
  name: string | null;
  placeholder?: string;
  currentSpaceId: string;
  entityId: string;
  spaceId?: string;
  collectionId?: string;
  relationId?: string;
  verified?: boolean;
  onLinkEntry: onLinkEntryFn;
  children: ReactNode;
  /** When false, the open-in-side-panel control is hidden (e.g. placeholder rows, Power Tools). */
  showSidePanel?: boolean;
  openedWithMainViewEditing?: boolean;
};

export const CollectionMetadata = ({
  view,
  isEditing,
  name: _name,
  placeholder: _placeholder = 'Entity name...',
  currentSpaceId,
  entityId,
  spaceId,
  relationId,
  verified,
  onLinkEntry,
  children,
  showSidePanel = true,
  openedWithMainViewEditing = false,
}: CollectionMetadataProps) => {
  const [isRowHovered, setIsRowHovered] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const { storage } = useMutate();

  const { blockEntity } = useDataBlock();
  const { space } = useSpace(spaceId ?? '');

  const onDeleteEntry = async () => {
    if (blockEntity) {
      const blockRelation = blockEntity.relations.find(r => r.toEntity.id === entityId);

      if (blockRelation) {
        storage.relations.delete(blockRelation);
      }
    }
  };

  // eslint-disable-next-line no-undef
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const hasHoverActions = Boolean(relationId || showSidePanel || isEditing);
  const showHoverActions = isRowHovered;
  const reserveActionSpace = verified || hasHoverActions;

  const leaveRow = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsPopoverOpen(false);
    setIsRowHovered(false);
  };

  return (
    <div
      className="relative w-full min-w-0"
      onMouseEnter={() => setIsRowHovered(true)}
      onMouseLeave={leaveRow}
    >
      <div className={cx('min-w-0', reserveActionSpace && 'pr-14')}>{children}</div>
      {reserveActionSpace && (
        <div className="absolute top-0 right-0 flex flex-nowrap items-center gap-0.5">
          {verified && (
            <span className="inline-flex shrink-0 pt-0.5">
              <CheckCircle color={isEditing || view !== 'TABLE' ? 'text' : 'ctaHover'} />
            </span>
          )}
          {hasHoverActions && showHoverActions && (
            <div className="flex shrink-0 flex-nowrap items-center gap-0.5">
              {relationId && (
                <Popover.Root open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                  <Popover.Trigger asChild>
                    <button
                      onMouseEnter={() => setIsPopoverOpen(true)}
                      onMouseLeave={() => {
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
                      onMouseEnter={() => {
                        if (closeTimeoutRef.current) {
                          clearTimeout(closeTimeoutRef.current);
                          closeTimeoutRef.current = null;
                        }
                      }}
                      onMouseLeave={() => {
                        setIsPopoverOpen(false);
                      }}
                    >
                      {isEditing && (
                        <SelectSpaceAsPopover
                          entityId={EntityId(entityId)}
                          spaceId={spaceId}
                          verified={verified}
                          onDone={result => {
                            if (!relationId) return;

                            onLinkEntry(relationId, result, verified);
                          }}
                          trigger={
                            <button className="inline-flex items-center p-1" onMouseDown={e => e.preventDefault()}>
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
                      <PrefetchLink
                        href={`/space/${currentSpaceId}/${relationId}`}
                        className="p-1 group-hover:text-grey-03 hover:text-text!"
                      >
                        <RelationSmall />
                      </PrefetchLink>
                      {isEditing && (
                        <button
                          onClick={onDeleteEntry}
                          onMouseDown={e => e.preventDefault()}
                          className="p-1 group-hover:text-grey-03 hover:text-text!"
                        >
                          <CheckCloseSmall />
                        </button>
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
              {isEditing && (
                <PrefetchLink
                  href={NavUtils.toEntity(spaceId ?? currentSpaceId, entityId, true)}
                  entityId={entityId}
                  spaceId={spaceId ?? currentSpaceId}
                  aria-label="Navigate to entity"
                  className="inline-flex shrink-0 items-center text-grey-03 transition duration-300 ease-in-out hover:text-text"
                >
                  <RightArrowLongChip />
                </PrefetchLink>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
