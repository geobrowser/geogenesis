import { normId } from '~/core/utils/norm-id';

import { DEBATE_TYPE_ID } from './ontology';

const DEBATE_TYPE = normId(DEBATE_TYPE_ID);

/**
 * Whether an entity is a debate.
 *
 * One predicate because it is one decision, asked at both ends of the same journey: Explore reads
 * it to send a title to the debate rather than the side panel (GEO-2794), and the entity route
 * reads it to render the full-screen debates feed rather than a value sheet. Two spellings of that
 * question could disagree, and the way they would show up is a reader clicking a debate and landing
 * on a page that does not think it is one.
 *
 * Keyed on the entity's types rather than on whatever drew it. `ExploreFeedCard` hands a debate to
 * `DebateExploreFeedCard`, which falls back to the generic card when the debate cannot be watched —
 * so a rule written against the card would stop applying to exactly those debates.
 *
 * Ids are normalized on both sides. The API returns them hyphenless today and every caller happens
 * to match already, but ids reach the client in both spellings depending on the query that found
 * them, and this is not a comparison worth leaving to that.
 */
export function isDebateEntity(types: readonly { id: string }[] | undefined): boolean {
  return types?.some(type => normId(type.id) === DEBATE_TYPE) ?? false;
}
