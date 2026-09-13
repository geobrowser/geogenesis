import { normId } from '~/core/utils/norm-id';

/**
 * How a claim row is named, everywhere it has to be recognised again.
 *
 * Space *and* claim, which is the first thing worth stating once: a claim tagged in two spaces is
 * two cards with two sets of sides, and the viewer can answer one without the other. Keyed on the
 * claim alone, a list holds whichever row arrived last and draws one space's answers onto the
 * other's card — see the row lookup in `claims-tab`, which hits the same trap from the other side.
 *
 * Canonical ids, which is the second: a row carries whichever spelling its source used — hyphenated
 * from one, bare hex from another — and this key is what decides whether two sources describing the
 * same claim are the same row. Compared raw, one source's copy reads as a different row from the
 * other's, which splits a list's order and lets two cards claim one claim.
 *
 * Structural rather than tied to one type, because the same key is wanted of three shapes that all
 * carry the same pair: geo-chat's index rows, the graph-backed entries built from the Debate tag,
 * and the matches list's rows.
 */
export function claimRowKey(row: { claim: { space_id: string; claim_entity_id: string } }): string {
  return `${normId(row.claim.space_id)}:${normId(row.claim.claim_entity_id)}`;
}
