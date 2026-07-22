import { ID } from '~/core/id';
import type { Value } from '~/core/types';

import { SCORE_DISMISSED_PROPERTY_ID } from './block-ontology-ids';

export function parseScoreDismissed(raw: string | null | undefined): boolean {
  return raw === '1' || raw === 'true';
}

export function serializeScoreDismissed(dismissed: boolean): string {
  return dismissed ? '1' : '0';
}

export function readScoreDismissedFromValues(values: readonly Value[] | null | undefined, spaceId: string): boolean {
  if (!values?.length) return false;

  const triple = values.find(
    value => ID.equals(value.property.id, SCORE_DISMISSED_PROPERTY_ID) && value.spaceId === spaceId && !value.isDeleted
  );

  return parseScoreDismissed(triple?.value);
}
