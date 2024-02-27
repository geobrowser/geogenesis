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

// Proposal id should be generated on the client or at least deterministically derived
// from the proposal metadata.
//
// This is so we can correctly map the proposal id on the server with the DAO.Action
// callback we pass to the proposal.
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
