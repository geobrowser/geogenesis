import { type StableEntityTemplateId, resolveEntityTemplateFromTypes } from '~/core/templates/registry';

export type EntityBrowseView = StableEntityTemplateId | null;

/**
 * The custom read surface an entity's types put it in line for.
 *
 * Precedence is owned by `ENTITY_TEMPLATE_REGISTRY` in `~/core/templates/registry` and shared by
 * the client body and server route/layout. Keeping one source of truth avoids a mixed-type entity
 * being classified as a Claim in one layer and wrapped in a Person profile in another.
 */
export function entityBrowseViewFromTypes(types: readonly { id: string }[]): EntityBrowseView {
  const match = resolveEntityTemplateFromTypes(types, { includeV2: false });
  return match ? (match.id as StableEntityTemplateId) : null;
}
