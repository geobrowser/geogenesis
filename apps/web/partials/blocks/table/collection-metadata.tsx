'use client';

import type { ReactNode } from 'react';
import { useRef, useState } from 'react';

import cx from 'classnames';

import type { DataBlockView } from '~/core/blocks/data/use-view';

import { CheckCircle } from '~/design-system/icons/check-circle';

import type { onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { CollectionRowActions } from '~/partials/blocks/table/collection-row-actions';

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
  /**
   * When true, do not render the popover/side-panel/edit-chip hover actions inline next to the
   * title. Caller is responsible for rendering them elsewhere (e.g. next to vote buttons).
   * The verified checkmark is unaffected and still renders inline.
   */
  hideHoverActions?: boolean;
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
  hideHoverActions = false,
}: CollectionMetadataProps) => {
  const [isRowHovered, setIsRowHovered] = useState(false);
  // eslint-disable-next-line no-undef
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const hasHoverActions = !hideHoverActions && Boolean(relationId || showSidePanel || isEditing);
  const showHoverActions = isRowHovered;
  const reserveActionSpace = verified || hasHoverActions;
  const paddingClass = hasHoverActions ? 'pr-14' : verified ? 'pr-6' : '';

  const leaveRow = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsRowHovered(false);
  };

  return (
    <div className="relative w-full min-w-0" onMouseEnter={() => setIsRowHovered(true)} onMouseLeave={leaveRow}>
      <div className={cx('min-w-0', paddingClass)}>{children}</div>
      {reserveActionSpace && (
        <div className="absolute top-0 right-0 flex flex-nowrap items-center gap-0.5">
          {verified && (
            <span className="inline-flex shrink-0 pt-0.5">
              <CheckCircle color={isEditing || view !== 'TABLE' ? 'text' : 'ctaHover'} />
            </span>
          )}
          {hasHoverActions && showHoverActions && (
            <CollectionRowActions
              isEditing={isEditing}
              currentSpaceId={currentSpaceId}
              entityId={entityId}
              spaceId={spaceId}
              relationId={relationId}
              verified={verified}
              onLinkEntry={onLinkEntry}
              showSidePanel={showSidePanel}
              openedWithMainViewEditing={openedWithMainViewEditing}
            />
          )}
        </div>
      )}
    </div>
  );
};
