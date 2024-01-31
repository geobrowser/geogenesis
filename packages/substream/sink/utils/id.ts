export function generateTripleId({
  space_id,
  entity_id,
  attribute_id,
  value_id,
}: {
  space_id: string;
  entity_id: string;
  attribute_id: string;
  value_id: string;
}): string {
  return `${space_id}:${entity_id}:${attribute_id}:${value_id}`;
}

export function generateActionId({
  space_id,
  entity_id,
  attribute_id,
  value_id,
  cursor,
}: {
  space_id: string;
  entity_id: string;
  attribute_id: string;
  value_id: string;
  cursor: string;
}): string {
  return `${space_id}:${entity_id}:${attribute_id}:${value_id}:${cursor}}`;
}

// This should be the onchain-id + the space id (anything else?)
// Note that the entries-based proposal does not have an onchain id
export function generateProposalId({ entryIndex, cursor }: { entryIndex: number; cursor: string }): string {
  return `${entryIndex}:${cursor}`;
}

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
