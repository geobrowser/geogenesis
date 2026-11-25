import {
  type EntityTemplateId,
  type StableEntityTemplateId,
  resolveEntityTemplateFromTypes,
} from '~/core/templates/registry';

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

/**
 * The template an entity's page draws by default, for analytics `page_type`.
 *
 * The server cannot read the browser's feature flags, so this assumes `entityTemplatesV2` is on, which
 * is its default. Without that, an entity typed both Claim and News event, which draws the Event
 * template, would be recorded as a claim page view. Routing decisions on the server keep using
 * `entityBrowseViewFromTypes`, which only ever answers with a stable template.
 */
export function entityPageTypeFromTypes(types: readonly { id: string }[]): EntityTemplateId | null {
  return resolveEntityTemplateFromTypes(types, { includeV2: true })?.id ?? null;
}
