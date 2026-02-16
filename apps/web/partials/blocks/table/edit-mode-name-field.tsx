'use client';

import { useState } from 'react';

import { NavUtils } from '~/core/utils/utils';

import { PageStringField } from '~/design-system/editable-fields/editable-fields';
import { RightArrowLongChip } from '~/design-system/icons/right-arrow-long-chip';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

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
  placeholder = 'Entity name...',
  onChange,
}: {
  name: string | null;
  entityId: string;
  spaceId: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="relative w-full" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <div className="absolute -inset-2 z-0" />
      <div className="relative z-10">
        <div className="relative z-20 w-full">
          <PageStringField placeholder={placeholder} value={name ?? ''} onChange={onChange} />
        </div>
        <div className="pointer-events-none absolute inset-0 z-30">
          <span className="inline text-body opacity-0">{name || placeholder}</span>
          {isHovered && (
            <Link
              href={NavUtils.toEntity(spaceId, entityId, true)}
              entityId={entityId}
              spaceId={spaceId}
              aria-label="Navigate to entity"
              className="pointer-events-auto ml-1 inline-flex items-center text-grey-03 transition duration-300 ease-in-out hover:text-text"
            >
              <RightArrowLongChip />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
