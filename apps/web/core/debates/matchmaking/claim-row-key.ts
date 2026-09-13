/**
 * How a claim row is named, everywhere it has to be recognised again.
 *
 * Space *and* claim, which is the part worth stating once: a claim tagged in two spaces is two
 * cards with two sets of sides, and the viewer can answer one without the other. Keyed on the claim
 * alone, a list holds whichever row arrived last and draws one space's answers onto the other's
 * card — see the row lookup in `claims-tab`, which hits the same trap from the other direction.
 *
 * Structural rather than tied to one type, because the same key is wanted of three shapes that all
 * carry the same pair: geo-chat's index rows, the graph-backed entries built from the Debate tag,
 * and the matches list's rows.
 */
export function claimRowKey(row: { claim: { space_id: string; claim_entity_id: string } }): string {
  return `${row.claim.space_id}:${row.claim.claim_entity_id}`;
}
