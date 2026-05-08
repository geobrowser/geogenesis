'use client';

import { useState } from 'react';

import { NavUtils } from '~/core/utils/utils';

import { PageStringField } from '~/design-system/editable-fields/editable-fields';
import { RightArrowLongChip } from '~/design-system/icons/right-arrow-long-chip';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { DataBlockOpenSidePanelButton } from '~/partials/blocks/table/data-block-open-side-panel-button';

/**
 * An editable name field with an inline navigate arrow that appears on hover.
 * Used in edit mode for non-collection data block items (gallery, list, bulleted list).
 *
 * The arrow is positioned inline after the text using an invisible span that mirrors
 * the text content to measure its width. The invisible span must use the same font
 * styling as PageStringField's default variant (text-body) to stay aligned.
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
  const [isHovered, setIsHovered] = useState(false);
  const resolvedPanelSpaceId = entitySpaceIdForPanel ?? spaceId;
  const navigateHrefSpaceId = resolvedPanelSpaceId;

  return (
    <div className="relative w-full" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <div className="absolute -inset-2 z-0" />
      <div className="relative z-10">
        <div className="relative z-20 w-full">
          <PageStringField placeholder={placeholder} value={name ?? ''} onChange={onChange} />
        </div>
        <div className="pointer-events-none absolute inset-0 z-30">
          <span aria-hidden className="inline select-none text-body invisible">
            {name || placeholder}
          </span>
          {isHovered && (
            <span className="pointer-events-auto ml-1 inline-flex items-center gap-0.5">
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
                className="inline-flex items-center text-grey-03 transition duration-300 ease-in-out hover:text-text"
              >
                <RightArrowLongChip />
              </Link>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
