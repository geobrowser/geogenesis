import { createGeoId } from './create-geo-id';

export function generateTripleId({
  space_id,
  entity_id,
  attribute_id,
}: {
  space_id: string;
  entity_id: string;
  attribute_id: string;
}): string {
  return `${space_id}:${entity_id}:${attribute_id}`;
}

export function generateActionId(): string {
  return createGeoId();
}

// @TODO: Deterministic version that maps to proposal
export function generateVersionId({
  entryIndex,
  entityId,
  cursor,
}: {
  entryIndex: number;
  entityId: string;
  cursor: string;
}): string {
  return `${entryIndex}:${entityId}:${cursor}`;
}
