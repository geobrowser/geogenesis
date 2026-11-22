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
  UNNAMED_SUBTOPIC_PROPERTY_ID,
} from '~/core/topics/ontology';
import type { Entity, Relation, Value } from '~/core/types';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import type { ClaimKind, EntityContextDataModel, EntityFlagModel, GraphConnectionGroupModel } from './models';

/**
 * Canonical GRC-20 type and property IDs consumed by entity templates and their live adapters.
 *
 * Re-exports canonical `@geoprotocol/geo-sdk` `ContentIds` / `SystemIds` and existing app ontology
 * modules, plus verified live-graph schema IDs observed on Geo's active Claim, Topic, News story,
 * News event, Source, Quote, and Post types.
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
  /** Verified on live graph (`Community notes` `To entity types` -> `Community note`). */
  COMMUNITY_NOTE_TYPE_ID: 'ba7b7d1c8f8543e7b22675e1bb243c7f',

  // Topic & tag properties
  TOPICS_PROPERTY_ID,
  SUBTOPICS_PROPERTY_ID: ContentIds.SUBTOPICS_PROPERTY,
  UNNAMED_SUBTOPIC_PROPERTY_ID,
  BROADER_TOPICS_PROPERTY_ID: ContentIds.BROADER_TOPICS_PROPERTY,
  TAG_PROPERTY_ID,
  CURATED_TOPIC_TAG_ID,
  /** Verified on live Topic schema (`Claims` relation on Topic). */
  TOPIC_CLAIMS_PROPERTY_ID: '73c9e41ee86e4e4ca3f857850518e104',
  /** Verified on live Topic entities (`Stories` relation on Topic). */
  STORIES_PROPERTY_ID: '249010038c9e4663a7922a63ffe23f39',

  // Claim hierarchy & argumentation properties
  CLAIM_IS_FACTUAL_PROPERTY_ID,
  SUBCLAIMS_PROPERTY_ID: SystemIds.SUBCLAIMS_PROPERTY,
  BROADER_CLAIMS_PROPERTY_ID: SystemIds.BROADER_CLAIMS_PROPERTY,
  CLAIM_SUPPORTS_PROPERTY_ID,
  CLAIM_OPPOSES_PROPERTY_ID,
  CLAIM_ADDRESSES_PROPERTY_ID,
  /** Verified on live Claim schema (`Supported by`). */
  SUPPORTED_BY_PROPERTY_ID: 'd19fad5651364a7f8309daf5c7bf99dd',
  /** Verified on live Claim schema (`Opposed by`). */
  OPPOSED_BY_PROPERTY_ID: 'c57de77c3eee4e7ba0d2258d18aab11c',
  /** Verified on live Claim schema (`Inverse claims`). */
  INVERSE_CLAIMS_PROPERTY_ID: '47b1eb794dcd43099bbfb3144e71605a',
  /** Verified on live NewsStory / Post / Tweet schemas (`Related claims`). */
  RELATED_CLAIMS_PROPERTY_ID: '504e5776788844f6a77dba3ee811d8f0',
  /** Verified on live NewsStory entities (`Notable claims`). */
  NOTABLE_CLAIMS_PROPERTY_ID: 'e1371bcda7044396adb7ea7ecc8fe3d4',
  SUPPORTING_ARGUMENTS_PROPERTY_ID: ContentIds.SUPPORTING_ARGUMENTS_PROPERTY,
  OPPOSING_ARGUMENTS_PROPERTY_ID: ContentIds.OPPOSING_ARGUMENTS_PROPERTY,
  /** SDK `ContentIds.QUOTES_THAT_SUPPORT_CLAIMS_PROPERTY`. */
  QUOTES_THAT_SUPPORT_CLAIMS_PROPERTY_ID: ContentIds.QUOTES_THAT_SUPPORT_CLAIMS_PROPERTY,
  /** Verified active Claim schema property (`Quotes that support claims`). */
  QUOTES_THAT_SUPPORT_CLAIMS_LIVE_PROPERTY_ID: 'f9eeaf9d9eb741b1ac5d257c6e82e526',

  // Community notes / flags
  /** Verified on live Tweet & Post schemas (`Community notes` -> `Community note`). */
  COMMUNITY_NOTES_PROPERTY_ID: '2f17820c6ed44be8b3fce43b981b8e91',

  // Event, story, source & post metadata properties
  EVENT_DATE_PROPERTY_ID: ContentIds.EVENT_DATE_PROPERTY,
  PUBLISH_DATE_PROPERTY_ID: ContentIds.PUBLISH_DATE_PROPERTY,
  PUBLISHER_PROPERTY_ID: ContentIds.PUBLISHER_PROPERTY,
  AUTHORS_PROPERTY_ID: ContentIds.AUTHORS_PROPERTY,
  SOURCES_PROPERTY_ID: ContentIds.SOURCES_PROPERTY,
  WEB_URL_PROPERTY_ID: ContentIds.WEB_URL_PROPERTY,
  WEB_ARCHIVE_URL_PROPERTY_ID: ContentIds.WEB_ARCHIVE_URL_PROPERTY,
  WEBSITE_PROPERTY_ID: ContentIds.WEBSITE_PROPERTY,
  DISCLAIMER_PROPERTY_ID: ContentIds.DISCLAIMER_PROPERTY,
  /** Verified on live NewsStory / OfficialDocument (`Summary`). */
  SUMMARY_PROPERTY_ID: 'aa5da9278af44294a8a9b79421762c3a',
  /** Verified on live Paper schema (`DOI`). */
  DOI_PROPERTY_ID: '7cb59354e30c48119e99ff62fcf61646',
  LOCATION_PROPERTY_ID: ContentIds.LOCATION_PROPERTY,
  RELATED_ENTITIES_PROPERTY_ID: ContentIds.RELATED_ENTITIES_PROPERTY,
  RELATED_PEOPLE_PROPERTY_ID: ContentIds.RELATED_PEOPLE_PROPERTY,
  RELATED_PROJECTS_PROPERTY_ID: ContentIds.RELATED_PROJECTS_PROPERTY,
  RELATED_SPACES_PROPERTY_ID: ContentIds.RELATED_SPACES_PROPERTY,
  HIGHLIGHTED_RELATED_ENTITIES_PROPERTY_ID: ContentIds.HIGHLIGHTED_RELATED_ENTIRIES_PROPERTY,

  // NewsStory & Post specific relations
  BLOCKS_PROPERTY_ID: SystemIds.BLOCKS,
  COLLECTION_ITEM_PROPERTY_ID: SystemIds.COLLECTION_ITEM_RELATION_TYPE,
  /** Verified on live NewsStory schema (`Associated timelines`). */
  ASSOCIATED_TIMELINES_PROPERTY_ID: '6384a9b0b9be42fab705d7223aa37ac2',
  /** Verified on live NewsStory schema (`Related stories`). */
  RELATED_STORIES_PROPERTY_ID: 'ff5c1866e5ea41ebbbd93b30536ec020',
  /** Verified on live NewsStory schema (`Perspectives`). */
  PERSPECTIVES_PROPERTY_ID: '8f637e6a629743c08eb9c49e971b2b54',
  /** Verified on live NewsStory schema (`Questions`). */
  QUESTIONS_PROPERTY_ID: '9678296fca604e17a997a5dbbc227d18',
  /** Verified on live Post schema (`Platform`). */
  PLATFORM_PROPERTY_ID: '9fef07bddd4f4f5f9f11a521feea767f',
  /** Verified on live Post & Tweet schemas (`Quoted posts`). */
  QUOTED_POSTS_PROPERTY_ID: '86f50b07460e48539ef817cc7f6009b8',
  /** Verified on live Post & Tweet schemas (`Reply to`). */
  REPLY_TO_PROPERTY_ID: '310d4a240e5b451cb2151bfce40d0fe6',
  /** Verified on live Post & Tweet schemas (`Related posts`). */
  RELATED_POSTS_PROPERTY_ID: 'b355103e27ae4e4aa911fde2a076a6ca',
} as const;

/** Canonical predicate name -> property ID lookup for live `+` Context relation writes. */
export const CANONICAL_PREDICATE_PROPERTY_IDS: Readonly<Record<string, { id: string; name: string }>> = {
  topics: { id: TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID, name: 'Topics' },
  subtopics: { id: TEMPLATE_ONTOLOGY.SUBTOPICS_PROPERTY_ID, name: 'Subtopics' },
  'broader topics': { id: TEMPLATE_ONTOLOGY.BROADER_TOPICS_PROPERTY_ID, name: 'Broader topics' },
  sources: { id: TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID, name: 'Sources' },
  'supporting source': { id: TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID, name: 'Sources' },
  'related entities': { id: TEMPLATE_ONTOLOGY.RELATED_ENTITIES_PROPERTY_ID, name: 'Related entities' },
  'related actors': { id: TEMPLATE_ONTOLOGY.RELATED_ENTITIES_PROPERTY_ID, name: 'Related entities' },
  'related people': { id: TEMPLATE_ONTOLOGY.RELATED_PEOPLE_PROPERTY_ID, name: 'Related people' },
  'related projects': { id: TEMPLATE_ONTOLOGY.RELATED_PROJECTS_PROPERTY_ID, name: 'Related projects' },
  'related spaces': { id: TEMPLATE_ONTOLOGY.RELATED_SPACES_PROPERTY_ID, name: 'Related spaces' },
  'related claims': { id: TEMPLATE_ONTOLOGY.RELATED_CLAIMS_PROPERTY_ID, name: 'Related claims' },
  supports: { id: TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID, name: 'Supports' },
  opposes: { id: TEMPLATE_ONTOLOGY.CLAIM_OPPOSES_PROPERTY_ID, name: 'Opposes' },
  'supported by': { id: TEMPLATE_ONTOLOGY.SUPPORTED_BY_PROPERTY_ID, name: 'Supported by' },
  'opposed by': { id: TEMPLATE_ONTOLOGY.OPPOSED_BY_PROPERTY_ID, name: 'Opposed by' },
  'disputed by': { id: TEMPLATE_ONTOLOGY.OPPOSED_BY_PROPERTY_ID, name: 'Opposed by' },
  subclaims: { id: TEMPLATE_ONTOLOGY.SUBCLAIMS_PROPERTY_ID, name: 'Subclaims' },
  'broader claims': { id: TEMPLATE_ONTOLOGY.BROADER_CLAIMS_PROPERTY_ID, name: 'Broader claims' },
  location: { id: TEMPLATE_ONTOLOGY.LOCATION_PROPERTY_ID, name: 'Location' },
  publisher: { id: TEMPLATE_ONTOLOGY.PUBLISHER_PROPERTY_ID, name: 'Publisher' },
  authors: { id: TEMPLATE_ONTOLOGY.AUTHORS_PROPERTY_ID, name: 'Authors' },
  tags: { id: TEMPLATE_ONTOLOGY.TAG_PROPERTY_ID, name: 'Tags' },
  platform: { id: TEMPLATE_ONTOLOGY.PLATFORM_PROPERTY_ID, name: 'Platform' },
  'community notes': { id: TEMPLATE_ONTOLOGY.COMMUNITY_NOTES_PROPERTY_ID, name: 'Community notes' },
};

const HIDDEN_CONTEXT_PROPERTY_IDS = new Set<string>([
  SystemIds.TYPES_PROPERTY,
  SystemIds.COVER_PROPERTY,
  ContentIds.AVATAR_PROPERTY,
  SystemIds.BLOCKS,
  SystemIds.TABS_PROPERTY,
  TEMPLATE_ONTOLOGY.UNNAMED_SUBTOPIC_PROPERTY_ID,
  TEMPLATE_ONTOLOGY.COMMUNITY_NOTES_PROPERTY_ID,
]);

/** Read the first non-empty string value for a property ID from an entity's values array. */
export function readEntityTextValue(
  entity: Pick<Entity, 'values'> | null | undefined,
  propertyId: string
): string | null {
  if (!entity) return null;
  const match = entity.values.find(
    entry => !entry.isDeleted && ID.equals(entry.property.id, propertyId) && entry.value.trim().length > 0
  );
  return match ? match.value.trim() : null;
}

/** Read a Claim's stored epistemic property (`CLAIM_IS_FACTUAL_PROPERTY_ID`). */
export function readClaimKind(
  values: readonly Pick<Value, 'property' | 'value' | 'isDeleted'>[] | undefined
): ClaimKind {
  if (!values) return 'judgment';
  const factual = values.find(entry => !entry.isDeleted && ID.equals(entry.property.id, CLAIM_IS_FACTUAL_PROPERTY_ID));
  if (factual?.value === '1' || factual?.value.toLowerCase() === 'true') {
    return 'fact';
  }
  return 'judgment';
}

/** Read live (non-deleted), deduplicated outgoing relations of one or more property IDs. */
export function readEntityRelations(
  entity: Pick<Entity, 'relations'> | null | undefined,
  propertyId: string | readonly string[]
): Relation[] {
  if (!entity) return [];
  const targetIds = Array.isArray(propertyId) ? propertyId : [propertyId];
  const seen = new Set<string>();
  const out: Relation[] = [];

  for (const relation of entity.relations) {
    if (relation.isDeleted === true) continue;
    if (!targetIds.some(targetId => ID.equals(relation.type.id, targetId))) continue;
    const key = ID.uuidToHex(relation.toEntity.id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(relation);
  }

  return out;
}

/**
 * Resolve an entity cover/media URL for browser rendering.
 * Converts `ipfs://` URIs via Geo's IPFS gateway while leaving `/...` and `https://...` untouched.
 */
export function resolveTemplateImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('ipfs://')) {
    return getImagePath(trimmed);
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
    return trimmed;
  }
  return getImagePath(trimmed);
}

/**
 * Extract all non-sectioned outgoing graph relations on an entity into grouped `Context` rows.
 * Deduplicates by `(predicate, toEntityId)` and excludes structural Geo properties (Types, Cover,
 * Avatar, Blocks, Tabs) plus any property IDs already rendered in dedicated template sections.
 */
export function extractGraphConnections(
  entity: Pick<Entity, 'relations'> | null | undefined,
  spaceId: string,
  excludePropertyIds: readonly string[] = []
): GraphConnectionGroupModel[] {
  if (!entity) return [];

  const groupsMap = new Map<string, GraphConnectionGroupModel['items'][number][]>();
  const seenPerPredicate = new Map<string, Set<string>>();

  for (const rel of entity.relations) {
    if (rel.isDeleted) continue;
    if (Array.from(HIDDEN_CONTEXT_PROPERTY_IDS).some(hiddenId => ID.equals(rel.type.id, hiddenId))) continue;
    if (excludePropertyIds.some(excludedId => ID.equals(rel.type.id, excludedId))) continue;

    const predicate = rel.type.name?.trim();
    const label = rel.toEntity.name?.trim();
    if (!predicate || !label || /^(Types|Cover|Avatar|Blocks|Tabs|OG image)$/i.test(predicate)) continue;

    const targetKey = ID.uuidToHex(rel.toEntity.id);
    const seen = seenPerPredicate.get(predicate) ?? new Set<string>();
    if (seen.has(targetKey)) continue;
    seen.add(targetKey);
    seenPerPredicate.set(predicate, seen);

    const list = groupsMap.get(predicate) ?? [];
    list.push({
      id: rel.id,
      label,
      kind: 'entity',
      href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
      relationHref: rel.entityId ? NavUtils.toEntity(rel.spaceId ?? spaceId, rel.entityId) : undefined,
    });
    groupsMap.set(predicate, list);
  }

  return Array.from(groupsMap.entries()).map(([predicate, items]) => ({ predicate, items }));
}

/**
 * Extract live `Flags` from an entity's `Community notes` relations and `Disclaimer` text value.
 */
export function extractEntityFlags(
  entity: Pick<Entity, 'id' | 'relations' | 'values'> | null | undefined,
  spaceId: string
): EntityFlagModel[] {
  if (!entity) return [];
  const flags: EntityFlagModel[] = [];

  const disclaimer = readEntityTextValue(entity, TEMPLATE_ONTOLOGY.DISCLAIMER_PROPERTY_ID);
  if (disclaimer) {
    flags.push({
      id: `disclaimer-${entity.id}`,
      reason: 'Disclaimer',
      body: disclaimer,
    });
  }

  const noteRels = readEntityRelations(entity, TEMPLATE_ONTOLOGY.COMMUNITY_NOTES_PROPERTY_ID);
  for (const rel of noteRels) {
    const body = rel.toEntity.name?.trim();
    if (!body) continue;
    flags.push({
      id: rel.toEntity.id,
      reason: 'Community note',
      body,
      sourceUrl: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
      sourceLabel: 'Open note',
    });
  }

  return flags;
}

/**
 * Build `contextByEntityId` seeded with an entity's live flags (and optional triples) so
 * `EntityFlagsSection` and `EntityInlineContext` render real graph data.
 */
export function buildEntityContextMap(
  entityId: string,
  flags: readonly EntityFlagModel[]
): Readonly<Record<string, EntityContextDataModel>> | undefined {
  if (flags.length === 0) return undefined;
  return {
    [entityId]: {
      flags,
    },
  };
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

/** Derives a clean publication display name from an article URL when no Publisher relation exists. */
export function publicationFromUrl(rawUrl: string | null | undefined): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const host = new URL(rawUrl).hostname.replace(/^www\./i, '');
    const parts = host.split('.').filter(Boolean);
    if (parts.length === 0) return undefined;
    // Pick the registrable label (e.g. markets.businessinsider.com -> businessinsider)
    const label = parts.length >= 3 && parts[parts.length - 1]!.length >= 2 ? parts[parts.length - 2]! : parts[0]!;
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return undefined;
  }
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
