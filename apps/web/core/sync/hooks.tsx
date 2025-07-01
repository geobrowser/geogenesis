import { createAtom } from '@xstate/store';

import { reactiveRelations, reactiveValues } from './store';

/**
 * This works for already-in-store data, but doesn't work
 * for data that isn't in the store yet. We need to update
 * useQueryEntities(y) to somehow be reactive using these
 * reactive atoms.
 *
 * What could that look like? Instead of applying the query
 * to the store, we can apply it to the reactive?
 *
 * The query layer only cares about a list of entities. We
 * can keep a list of entities that are tracked after syncing.
 *
 * This slimmed-down model would basically look like this
 *
 * Mutator ->
 *            Writes to reactive store
 *            Emits event
 *            Sync engine ->
 *                            Merges and writes to entities list
 *
 * Once this is in place we can
 * probably get rid of the geo store entirely, with helper
 * functions to get related ids from relations and stitch
 * an entity together adhoc. (getEntity, findRelatedEntities)
 * and also to emit events and sync back to the reactive state.
 *
 * We can also make reactive atoms adhoc that are mergeable
 * with any remote data _and_ store data?
 */
export const reactive = createAtom(() => ({
  relations: reactiveRelations.get(),
  values: reactiveValues.get(),
}));
