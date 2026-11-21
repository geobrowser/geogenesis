import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { CURATED_TOPIC_TAG_ID, NEWS_STORY_TYPE_ID, TAG_PROPERTY_ID, TOPIC_TYPE_ID } from '~/core/constants';
import {
  CLAIM_ADDRESSES_PROPERTY_ID,
  CLAIM_OPPOSES_PROPERTY_ID,
  CLAIM_SUPPORTS_PROPERTY_ID,
} from '~/core/debates/ontology';
import { ID } from '~/core/id';
import {
  ARTICLE_TYPE_ID,
  DATASET_TYPE_ID,
  EPISODE_TYPE_ID,
  OFFICIAL_DOCUMENT_TYPE_ID,
  PAPER_TYPE_ID,
  POST_TYPE_ID,
  QUOTE_TYPE_ID,
  TWEET_TYPE_ID,
} from '~/core/topics/ontology';
import type { Entity, Relation } from '~/core/types';

/**
 * Canonical GRC-20 type and property IDs consumed by entity templates and their live adapters.
 *
 * Re-exports canonical `@geoprotocol/geo-sdk` `ContentIds` / `SystemIds` and existing app ontology
 * modules so no raw UUID literals are duplicated inside template code.
 */
export const TEMPLATE_ONTOLOGY = {
  // Types
  CLAIM_TYPE_ID,
  TOPIC_TYPE_ID,
  NEWS_EVENT_TYPE_ID: ContentIds.NEWS_EVENT_TYPE,
  NEWS_STORY_TYPE_ID,
  ARTICLE_TYPE_ID,
  OFFICIAL_DOCUMENT_TYPE_ID,
  DATASET_TYPE_ID,
  PAPER_TYPE_ID,
  QUOTE_TYPE_ID,
  EPISODE_TYPE_ID,
  POST_TYPE_ID,
  TWEET_TYPE_ID,
  PERSON_TYPE_ID: SystemIds.PERSON_TYPE,
  PUBLISHER_TYPE_ID: ContentIds.PUBLISHER_TYPE,

  // Topic & tag properties
  TOPICS_PROPERTY_ID,
  SUBTOPICS_PROPERTY_ID: ContentIds.SUBTOPICS_PROPERTY,
  BROADER_TOPICS_PROPERTY_ID: ContentIds.BROADER_TOPICS_PROPERTY,
  TAG_PROPERTY_ID,
  CURATED_TOPIC_TAG_ID,

  // Claim hierarchy & argumentation properties
  CLAIM_IS_FACTUAL_PROPERTY_ID,
  SUBCLAIMS_PROPERTY_ID: SystemIds.SUBCLAIMS_PROPERTY,
  BROADER_CLAIMS_PROPERTY_ID: SystemIds.BROADER_CLAIMS_PROPERTY,
  CLAIM_SUPPORTS_PROPERTY_ID,
  CLAIM_OPPOSES_PROPERTY_ID,
  CLAIM_ADDRESSES_PROPERTY_ID,
  SUPPORTING_ARGUMENTS_PROPERTY_ID: ContentIds.SUPPORTING_ARGUMENTS_PROPERTY,
  OPPOSING_ARGUMENTS_PROPERTY_ID: ContentIds.OPPOSING_ARGUMENTS_PROPERTY,
  QUOTES_THAT_SUPPORT_CLAIMS_PROPERTY_ID: ContentIds.QUOTES_THAT_SUPPORT_CLAIMS_PROPERTY,

  // Event, story, source & post metadata properties
  EVENT_DATE_PROPERTY_ID: ContentIds.EVENT_DATE_PROPERTY,
  PUBLISH_DATE_PROPERTY_ID: ContentIds.PUBLISH_DATE_PROPERTY,
  PUBLISHER_PROPERTY_ID: ContentIds.PUBLISHER_PROPERTY,
  AUTHORS_PROPERTY_ID: ContentIds.AUTHORS_PROPERTY,
  SOURCES_PROPERTY_ID: ContentIds.SOURCES_PROPERTY,
  WEB_URL_PROPERTY_ID: ContentIds.WEB_URL_PROPERTY,
  WEB_ARCHIVE_URL_PROPERTY_ID: ContentIds.WEB_ARCHIVE_URL_PROPERTY,
  DISCLAIMER_PROPERTY_ID: ContentIds.DISCLAIMER_PROPERTY,
  RELATED_ENTITIES_PROPERTY_ID: ContentIds.RELATED_ENTITIES_PROPERTY,
  HIGHLIGHTED_RELATED_ENTITIES_PROPERTY_ID: ContentIds.HIGHLIGHTED_RELATED_ENTIRIES_PROPERTY,
} as const;

/** Read the first non-empty string value for a property ID from an entity's values array. */
export function readEntityTextValue(
  entity: Pick<Entity, 'values'> | null | undefined,
  propertyId: string
): string | null {
  if (!entity) return null;
  const match = entity.values.find(entry => ID.equals(entry.property.id, propertyId) && entry.value.trim().length > 0);
  return match ? match.value.trim() : null;
}

/** Read live (non-deleted), deduplicated outgoing relations of a given property type. */
export function readEntityRelations(
  entity: Pick<Entity, 'relations'> | null | undefined,
  propertyId: string
): Relation[] {
  if (!entity) return [];
  const seen = new Set<string>();
  const out: Relation[] = [];

  for (const relation of entity.relations) {
    if (relation.isDeleted === true) continue;
    if (!ID.equals(relation.type.id, propertyId)) continue;
    const key = ID.uuidToHex(relation.toEntity.id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(relation);
  }

  return out;
}

/** Formats an ISO/GRC-20 date string into a readable label, returning the raw string if unparseable. */
export function formatOntologyDate(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;

  return parsed.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Derives a compact 1–3 character monogram from an outlet or publisher name. */
export function outletInitialsFrom(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'G';
  if (/^[A-Z]{2,4}$/.test(trimmed)) return trimmed;

  const words = trimmed.split(/\s+/).filter(word => /^[A-Za-z0-9]/.test(word));
  const initials = words.map(word => word[0]?.toUpperCase() ?? '').join('');
  return (initials || trimmed[0]?.toUpperCase() || 'G').slice(0, 3);
}

const OUTLET_PALETTE = ['#202020', '#6833ff', '#3963fe', '#35363a'] as const;

/** Deterministic accent color for an outlet monogram tile. */
export function outletColorFrom(name: string): string {
  let hash = 7;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return OUTLET_PALETTE[hash % OUTLET_PALETTE.length];
}
