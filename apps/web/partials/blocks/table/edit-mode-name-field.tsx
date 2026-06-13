'use client';

import { useState } from 'react';

import { NavUtils } from '~/core/utils/utils';

import { PageStringField } from '~/design-system/editable-fields/editable-fields';
import { RightArrowLongChip } from '~/design-system/icons/right-arrow-long-chip';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { DataBlockOpenSidePanelButton } from '~/partials/blocks/table/data-block-open-side-panel-button';

/**
 * An editable name field with action buttons (side panel, navigate) that appear on hover.
 * Used in edit mode for non-collection data block items (gallery, list, bulleted list).
 */
export function EditModeNameField({
  name,
  entityId,
  spaceId,
  entitySpaceIdForPanel,
  placeholder = 'Entity name...',
  onChange,
  openedWithMainViewEditing = false,
}: {
  name: string | null;
  entityId: string;
  spaceId: string;
  entitySpaceIdForPanel?: string;
  placeholder?: string;
  onChange: (value: string) => void;
  openedWithMainViewEditing?: boolean;
}) {
  const [isRowHovered, setIsRowHovered] = useState(false);
  const resolvedPanelSpaceId = entitySpaceIdForPanel ?? spaceId;
  const navigateHrefSpaceId = resolvedPanelSpaceId;

  return (
    <div
      className="relative w-full min-w-0"
      onMouseEnter={() => setIsRowHovered(true)}
      onMouseLeave={() => setIsRowHovered(false)}
    >
      <div className="min-w-0 pr-14 md:pr-0">
        <PageStringField placeholder={placeholder} value={name ?? ''} onChange={onChange} />
      </div>
      {isRowHovered && (
        <div className="absolute top-0 right-0 flex shrink-0 flex-nowrap items-center gap-0.5 md:hidden">
          <DataBlockOpenSidePanelButton
            entityId={entityId}
            entitySpaceId={resolvedPanelSpaceId}
            openedWithMainViewEditing={openedWithMainViewEditing}
          />
          <Link
            href={NavUtils.toEntity(navigateHrefSpaceId, entityId, true)}
            entityId={entityId}
            spaceId={navigateHrefSpaceId}
            aria-label="Navigate to entity"
            className="inline-flex shrink-0 items-center text-grey-03 transition duration-300 ease-in-out hover:text-text"
          >
            <RightArrowLongChip />
          </Link>
        </div>
      )}
    </div>
  );
}
