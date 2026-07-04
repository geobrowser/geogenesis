import { ID } from '~/core/id';
import type { Value } from '~/core/types';

import {
  DATA_BLOCK_PAGE_SIZE_PROPERTY_ID,
  DEFAULT_DATA_BLOCK_PAGE_SIZE,
  MAX_DATA_BLOCK_PAGE_SIZE,
  MIN_DATA_BLOCK_PAGE_SIZE,
} from './block-ontology-ids';

export function parseBlockPageSize(raw: string | null | undefined, fallback = DEFAULT_DATA_BLOCK_PAGE_SIZE): number {
  if (raw == null || raw === '') return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;

  return Math.min(MAX_DATA_BLOCK_PAGE_SIZE, Math.max(MIN_DATA_BLOCK_PAGE_SIZE, parsed));
}

/** Page size INTEGER value on the block-relation entity (BLOCKS relation entity). */
export function readBlockPageSizeFromValues(
  values: readonly Value[] | null | undefined,
  spaceId: string,
  fallback = DEFAULT_DATA_BLOCK_PAGE_SIZE
): number {
  if (!values?.length) return fallback;

  const triple = values.find(
    value =>
      ID.equals(value.property.id, DATA_BLOCK_PAGE_SIZE_PROPERTY_ID) && value.spaceId === spaceId && !value.isDeleted
  );

  if (!triple) return fallback;

  return parseBlockPageSize(triple.value, fallback);
}
