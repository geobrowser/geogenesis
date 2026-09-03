import type { Entity } from '~/core/types';

/**
 * Hidden (PROPERTY, BOOLEAN) — set on an entity to withhold its page from the product.
 *
 * geo-chat has its own `hidden_at` column (GEO-2785), but that only reaches geo-chat: the entity is
 * published to the knowledge graph, so the entity page kept rendering it — title, video, transcript
 * and an open comment box — for every debate a curator had hidden (GEO-2809). Visibility has to be
 * a fact in the graph, next to the data it governs, or every graph consumer needs its own
 * per-entity round trip to a second service to find out.
 *
 * Deliberately generic rather than debates-specific. Nothing about "withhold this page" is about
 * debates, and a marker only the debate code understands would need re-inventing the first time
 * anything else needs hiding.
 */
export const HIDDEN_PROPERTY_ID = '6ed78f16da324392b1c5376cd06ee0ca';

/**
 * True when the entity carries `Hidden = true`.
 *
 * Scope follows the caller's data: `entityPageQuery` filters `valuesList` to the space being
 * viewed, so this reads as "hidden in this space". That is the right default — hiding is a
 * curation act by one space's editors, and it is their copy they are withholding — but it means an
 * entity published to two spaces must be marked in each. Nothing enforces that today; the
 * reconcile job described in GEO-2809 is where it belongs.
 *
 * A positive check, so an entity is only ever withheld by an explicit marker: unhiding deletes the
 * value, and a missing or unreadable value renders normally rather than 404ing the page.
 *
 * The backend serialises BOOLEAN values inconsistently across query paths ('true' and '1' both
 * occur), so both are accepted rather than trusting one spelling.
 */
export function isHiddenEntity(entity: Pick<Entity, 'values'> | null | undefined): boolean {
  if (!entity?.values) return false;
  return entity.values.some(value => {
    if (value.property?.id !== HIDDEN_PROPERTY_ID) return false;
    const raw = String(value.value).trim().toLowerCase();
    return raw === 'true' || raw === '1';
  });
}
