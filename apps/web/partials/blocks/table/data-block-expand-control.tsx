'use client';

import { DATA_BLOCK_VIEW_ALL_PROPERTY_ID } from '~/core/blocks/data/block-ontology-ids';
import { ID } from '~/core/id';
import { useSpaceAwareRelation } from '~/core/sync/use-store';
import { NavUtils } from '~/core/utils/utils';

import { IconButton } from '~/design-system/button';
import { Fullscreen } from '~/design-system/icons/full-screen';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

const viewAllButtonClassName =
  'inline-flex h-[28px] min-w-[66px] shrink-0 items-center justify-center rounded-lg border border-grey-02 bg-white px-[10px] text-[16px] leading-none whitespace-nowrap text-text transition hover:bg-bg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-grey-04';

type Props = {
  spaceId: string;
  blockEntityId: string;
  isEditing: boolean;
  fullscreenHref?: string;
  onFullscreenClick?: () => void;
  fullscreenAriaLabel?: string;
  disabled?: boolean;
};

export function DataBlockExpandControl({
  spaceId,
  blockEntityId,
  isEditing,
  fullscreenHref,
  onFullscreenClick,
  fullscreenAriaLabel = 'Open fullscreen',
  disabled = false,
}: Props) {
  const viewAllRelation = useSpaceAwareRelation({
    selector: r => r.fromEntity.id === blockEntityId && ID.equals(r.type.id, DATA_BLOCK_VIEW_ALL_PROPERTY_ID),
    spaceId,
  });

  const viewAllEntityId = viewAllRelation?.toEntity.id;
  const viewAllSpaceId = viewAllRelation?.toSpaceId ?? spaceId;
  const showViewAll = !isEditing && !disabled && Boolean(viewAllEntityId);

  if (showViewAll && viewAllEntityId) {
    return (
      <Link
        href={NavUtils.toEntity(viewAllSpaceId, viewAllEntityId)}
        className={viewAllButtonClassName}
        aria-label="View all"
      >
        View all
      </Link>
    );
  }

  if (onFullscreenClick) {
    return (
      <IconButton
        onClick={onFullscreenClick}
        icon={<Fullscreen color="grey-04" />}
        color="grey-04"
        aria-label={fullscreenAriaLabel}
        disabled={disabled}
      />
    );
  }

  if (fullscreenHref) {
    return (
      <Link
        href={fullscreenHref}
        className={
          disabled
            ? 'pointer-events-none inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border-none bg-transparent text-grey-04'
            : 'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border-none bg-transparent text-grey-04 transition hover:bg-bg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-grey-04'
        }
        aria-label={fullscreenAriaLabel}
      >
        <Fullscreen color="grey-04" />
      </Link>
    );
  }

  return null;
}
