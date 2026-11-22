import { ID } from '~/core/id';

import { TEMPLATE_ONTOLOGY } from './ontology';

/**
 * All entity template identifiers supported by the Geo entity rendering pipeline.
 *
 * `claim`, `topic`, and `person` are live browse templates today.
 * `event`, `news-story`, `source`, and `post` are the v2 template slots gated behind the
 * `entityTemplatesV2` feature flag while their surfaces and data adapters are built out.
 */
export type EntityTemplateId =
  'claim' | 'topic' | 'event' | 'news-story' | 'podcast' | 'episode' | 'source' | 'post' | 'person';

/** Templates enabled without the `entityTemplatesV2` feature flag. */
export type StableEntityTemplateId = 'claim' | 'topic' | 'person';

/** Templates currently gated behind the `entityTemplatesV2` feature flag. */
export type V2EntityTemplateId = Exclude<EntityTemplateId, StableEntityTemplateId>;

export interface EntityTemplateDefinition {
  /** Stable identifier used by routing, analytics, and template dispatch. */
  readonly id: EntityTemplateId;
  /** Human-readable label shown in badges and dev previews. */
  readonly label: string;
  /**
   * Canonical Geo type IDs that select this template.
   * An empty array reserves the template slot until its ontology type ID is finalized (e.g. Event).
   */
  readonly typeIds: readonly string[];
  /**
   * Whether the template keeps its custom shell when the user toggles edit mode,
   * rather than falling back to the generic block/property editor.
   */
  readonly keepInEditMode: boolean;
  /**
   * Whether final selection also depends on the enclosing Space (Person is a profile only when
   * it is the entity of a PERSONAL space).
   */
  readonly requiresSpaceCheck: boolean;
  /** Whether this template is gated behind the `entityTemplatesV2` local feature flag. */
  readonly requiresV2Flag: boolean;
  /** Default max content width (px) for the template column. */
  readonly contentMaxWidth: number;
}

/**
 * Canonical source type IDs grouped under the `source` template.
 * Keeps documents, datasets, papers, and articles sharing one structured source view.
 */
export const SOURCE_TEMPLATE_TYPE_IDS: readonly string[] = [
  TEMPLATE_ONTOLOGY.OFFICIAL_DOCUMENT_TYPE_ID,
  TEMPLATE_ONTOLOGY.DATASET_TYPE_ID,
  TEMPLATE_ONTOLOGY.PAPER_TYPE_ID,
  TEMPLATE_ONTOLOGY.ARTICLE_TYPE_ID,
];

/** Social / viral post type IDs grouped under the `post` template. */
export const SOCIAL_POST_TEMPLATE_TYPE_IDS: readonly string[] = [
  TEMPLATE_ONTOLOGY.TWEET_TYPE_ID,
  TEMPLATE_ONTOLOGY.POST_TYPE_ID,
];

/**
 * Precedence-ordered registry of entity templates.
 *
 * Narrower, product-owned record types come first:
 *   claim > topic > event > news-story > source > post > person
 *
 * Every layer (server layout/route, client browse dispatch, space-read gate, analytics) reads
 * precedence from this list rather than duplicating `if` chains.
 */
export const ENTITY_TEMPLATE_REGISTRY: readonly EntityTemplateDefinition[] = [
  {
    id: 'claim',
    label: 'Claim',
    typeIds: [TEMPLATE_ONTOLOGY.CLAIM_TYPE_ID],
    keepInEditMode: true,
    requiresSpaceCheck: false,
    requiresV2Flag: false,
    contentMaxWidth: 840,
  },
  {
    id: 'topic',
    label: 'Topic',
    typeIds: [TEMPLATE_ONTOLOGY.TOPIC_TYPE_ID],
    keepInEditMode: true,
    requiresSpaceCheck: false,
    requiresV2Flag: false,
    contentMaxWidth: 1180,
  },
  {
    id: 'event',
    label: 'Event',
    typeIds: [TEMPLATE_ONTOLOGY.NEWS_EVENT_TYPE_ID],
    keepInEditMode: false,
    requiresSpaceCheck: false,
    requiresV2Flag: true,
    contentMaxWidth: 840,
  },
  {
    id: 'news-story',
    label: 'News story',
    typeIds: [TEMPLATE_ONTOLOGY.NEWS_STORY_TYPE_ID],
    keepInEditMode: false,
    requiresSpaceCheck: false,
    requiresV2Flag: true,
    contentMaxWidth: 840,
  },
  {
    id: 'podcast',
    label: 'Podcast',
    typeIds: [TEMPLATE_ONTOLOGY.PODCAST_TYPE_ID],
    keepInEditMode: false,
    requiresSpaceCheck: false,
    requiresV2Flag: true,
    contentMaxWidth: 960,
  },
  {
    id: 'episode',
    label: 'Episode',
    typeIds: [TEMPLATE_ONTOLOGY.EPISODE_TYPE_ID],
    keepInEditMode: false,
    requiresSpaceCheck: false,
    requiresV2Flag: true,
    contentMaxWidth: 880,
  },
  {
    id: 'source',
    label: 'Source',
    typeIds: SOURCE_TEMPLATE_TYPE_IDS,
    keepInEditMode: false,
    requiresSpaceCheck: false,
    requiresV2Flag: true,
    contentMaxWidth: 840,
  },
  {
    id: 'post',
    label: 'Post',
    typeIds: SOCIAL_POST_TEMPLATE_TYPE_IDS,
    keepInEditMode: false,
    requiresSpaceCheck: false,
    requiresV2Flag: true,
    contentMaxWidth: 960,
  },
  {
    id: 'person',
    label: 'Person',
    typeIds: [TEMPLATE_ONTOLOGY.PERSON_TYPE_ID],
    keepInEditMode: false,
    requiresSpaceCheck: true,
    requiresV2Flag: false,
    contentMaxWidth: 900,
  },
] as const;

const REGISTRY_BY_ID: Readonly<Record<EntityTemplateId, EntityTemplateDefinition>> = Object.fromEntries(
  ENTITY_TEMPLATE_REGISTRY.map(definition => [definition.id, definition])
) as Record<EntityTemplateId, EntityTemplateDefinition>;

export function getEntityTemplateDefinition(id: EntityTemplateId): EntityTemplateDefinition {
  return REGISTRY_BY_ID[id];
}

export function isV2EntityTemplateId(id: EntityTemplateId): id is V2EntityTemplateId {
  return REGISTRY_BY_ID[id].requiresV2Flag;
}

/**
 * Resolves the highest-precedence template definition matching an entity's types.
 *
 * By default (`includeV2: false`), only stable templates (`claim`, `topic`, `person`) are matched,
 * preserving exact production dispatch behavior.
 */
export function resolveEntityTemplateFromTypes(
  types: readonly { id: string }[],
  options?: { includeV2?: boolean }
): EntityTemplateDefinition | null {
  const includeV2 = options?.includeV2 ?? false;

  for (const definition of ENTITY_TEMPLATE_REGISTRY) {
    if (definition.requiresV2Flag && !includeV2) continue;
    if (definition.typeIds.length === 0) continue;

    if (definition.typeIds.some(targetId => types.some(type => ID.equals(type.id, targetId)))) {
      return definition;
    }
  }

  return null;
}
