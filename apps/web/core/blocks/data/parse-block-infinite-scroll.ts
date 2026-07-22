import { ID } from '~/core/id';
import type { Value } from '~/core/types';

import { DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID } from './block-ontology-ids';

export function parseBlockInfiniteScroll(raw: string | null | undefined): boolean {
  if (raw == null || raw === '') return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export function readBlockInfiniteScrollFromValues(
  values: readonly Value[] | null | undefined,
  spaceId: string
): boolean {
  if (!values?.length) return false;

  const triple = values.find(
    value =>
      ID.equals(value.property.id, DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID) &&
      value.spaceId === spaceId &&
      !value.isDeleted
  );

  if (!triple) return false;

  return parseBlockInfiniteScroll(triple.value);
}
