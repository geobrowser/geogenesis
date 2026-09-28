import { storage } from '~/core/sync/use-mutate';
import type { Relation } from '~/core/types';

/**
 * Tell the local-first sync store about relations we deleted on-chain
 * outside of it.
 *
 * The bounty flows build their ops directly and hand them to `makeProposal`
 * (like the community-call form does), so the store never sees the
 * tombstones. That matters because the store caches an entity's remote
 * relations and keeps a cached row when a fresh fetch stops returning it
 * (`hydrateReactiveState` only replaces ids it receives) — so a status
 * relation that was correctly deleted on-chain kept rendering on the entity
 * page as a second status. Marking the rows deleted (then published, which
 * `makeProposal` already did by id) hides them and makes rehydration skip
 * them, exactly like a delete made through the store.
 *
 * Call this only AFTER the publish succeeded — before, a failed publish would
 * leave pending local deletes in the FlowBar.
 */
export function reconcileDeletedRelations(published: readonly Relation[]): void {
  const deleted = published.filter(relation => relation.isDeleted);
  if (deleted.length === 0) return;
  storage.relations.deleteMany(deleted);
  storage.setAsPublished(
    [],
    deleted.map(relation => relation.id)
  );
}
