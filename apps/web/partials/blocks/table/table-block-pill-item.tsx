'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Source } from '~/core/blocks/data/source';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Cell } from '~/core/types';
import { useImageUrlFromEntity } from '~/core/utils/use-entity-media';
import { NavUtils } from '~/core/utils/utils';

import { ThumbGeoImage } from '~/design-system/geo-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { SelectEntity } from '~/design-system/select-entity';

import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';

type Props = {
  columns: Record<string, Cell>;
  currentSpaceId: string;
  isEditing: boolean;
  rowEntityId: string;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  isPlaceholder: boolean;
  source: Source;
  autoFocus?: boolean;
  focusRequestKey?: number;
  collectionTypeFilters?: { id: string; name: string | null }[];
};

export function TableBlockPillItem({
  columns,
  currentSpaceId,
  isEditing,
  rowEntityId,
  onChangeEntry,
  isPlaceholder,
  source,
  autoFocus = false,
  focusRequestKey,
  collectionTypeFilters,
}: Props) {
  const nameCell = columns[SystemIds.NAME_PROPERTY];
  const entitySpaceId = nameCell?.space ?? currentSpaceId;
  const showPlaceholderPicker = isEditing && isPlaceholder && source.type === 'COLLECTION';

  const lookedUpImage = useImageUrlFromEntity(nameCell?.image || undefined, currentSpaceId);
  const imageUrl = lookedUpImage ?? nameCell?.image ?? PLACEHOLDER_SPACE_IMAGE;

  if (showPlaceholderPicker) {
    return (
      <div className="min-w-[220px]">
        <SelectEntity
          onCreateEntity={result => {
            onChangeEntry(rowEntityId, currentSpaceId, { type: 'CREATE_ENTITY', name: result.name });
            return rowEntityId;
          }}
          onDone={(result, fromCreateFn) => {
            if (fromCreateFn) return;
            onChangeEntry(rowEntityId, currentSpaceId, { type: 'FIND_ENTITY', entity: result });
          }}
          spaceId={currentSpaceId}
          autoFocus={autoFocus}
          focusRequestKey={focusRequestKey}
          relationValueTypes={collectionTypeFilters}
        />
      </div>
    );
  }

  const name = nameCell?.name?.trim() || rowEntityId;

  return (
    <Link
      href={NavUtils.toEntity(entitySpaceId, rowEntityId)}
      className="inline-flex h-8 max-w-full shrink-0 items-center gap-2 overflow-hidden rounded-full border border-grey-02 bg-white p-2 text-[16px] leading-[13px] font-normal tracking-[-0.35px] text-text transition-colors hover:border-text"
      title={name}
    >
      <span className="relative h-4 w-4 shrink-0 overflow-hidden rounded-full bg-grey-01">
        <ThumbGeoImage value={imageUrl} className="object-cover" alt="" />
      </span>
      <span className="min-w-0 truncate">{name}</span>
    </Link>
  );
}
