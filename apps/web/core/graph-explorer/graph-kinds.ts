import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { AVATAR_PROPERTY_ID, NEWS_STORY_TYPE_ID } from '~/core/constants';
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
import { normId } from '~/core/utils/norm-id';

import { NEIGHBOUR_KIND_TYPE_IDS } from './ontology';

/**
 * What a node is drawn as, in the product team's priority order: it orders the chips and decides
 * which kinds are kept first when the caps bite. `other` catches types no kind lists yet, last.
 */
export const GRAPH_KINDS = ['topic', 'ent', 'claim', 'story', 'event', 'src', 'case', 'other'] as const;
export type GraphKind = (typeof GRAPH_KINDS)[number];

export const GRAPH_KIND_LABELS: Record<GraphKind, string> = {
  topic: 'Topics',
  ent: 'People and groups',
  claim: 'Claims',
  story: 'News',
  event: 'Events',
  src: 'Sources',
  case: 'Court cases',
  other: 'Other',
};

/**
 * Relation and type labels that only repeat a group's heading, so its rows leave them out. Matched
 * ignoring case and a plural "s". People and groups and Other hold mixed types, so they list none.
 */
export const GRAPH_KIND_REDUNDANT_LABELS: Record<GraphKind, readonly string[]> = {
  topic: ['Topic'],
  ent: [],
  claim: ['Claim'],
  story: ['News story', 'Story', 'Story in'],
  event: ['Event'],
  src: ['Source'],
  case: ['Court case', 'Legal case'],
  other: [],
};

export const NEWS_EVENT_TYPE_ID = 'bb9a85bd6dc64efd8232e2782cb4b5f8';
const TIMELINE_TYPE_ID = '3b22262d7919441db1a839eee9c2b3e9';

/**
 * Every testnet Type entity behind each kind, most important first within a kind: the one table a
 * new type is added to. Court orders and Interviews have no KG type yet, so they have no entry.
 */
export const GRAPH_KIND_TYPE_IDS: Record<GraphKind, readonly string[]> = {
  topic: NEIGHBOUR_KIND_TYPE_IDS.topic,
  ent: [
    ...NEIGHBOUR_KIND_TYPE_IDS.person,
    ...NEIGHBOUR_KIND_TYPE_IDS.organisation,
    '93b314b5126246e9babfc4dbe0c57d68', // Company ×2
    'e059a29e6f6b437bbc15c7983d078c0d',
    '531ac4c5e40946ad9dd3abcd2db955a0', // Publisher
    ...NEIGHBOUR_KIND_TYPE_IDS.court,
    ...NEIGHBOUR_KIND_TYPE_IDS.government,
    ...NEIGHBOUR_KIND_TYPE_IDS.place,
  ],
  claim: [CLAIM_TYPE_ID],
  story: [NEWS_STORY_TYPE_ID],
  event: [
    NEWS_EVENT_TYPE_ID,
    ...NEIGHBOUR_KIND_TYPE_IDS.event,
    '0578563acd894337bf5ddf95d33b043b', // Conflict event ×5
    '1bb62060fadd4a6f8a84f31ee38f065e',
    '73568896d5c34703a9349ee6092b8b3d',
    '7d34e68d505c4a7eaa8493094a01846d',
    'd4a41ddcb655436aa72c153135ae4cfe',
    '64ef895337014523b47c8b1144a4b220', // Case event
    TIMELINE_TYPE_ID,
  ],
  src: [
    ARTICLE_TYPE_ID,
    TWEET_TYPE_ID,
    '7e105afa350041af8b1960afd4807a09', // Tweet
    'e0091b4360a64354be69ad1c8c55148e', // Tweet
    POST_TYPE_ID,
    'b14d9d19e6bb49db9a0150d7fb4bf195', // Post
    '4c81561d1f9541319cdddd20ab831ba2', // Podcast
    EPISODE_TYPE_ID,
    '13078f079f0448dead67effd13c71eee', // Episode
    'ba4e41460010499da0a3caaa7f579d0e', // Image
    'd7a4817c9795405b93e212df759c43f8', // Video
    OFFICIAL_DOCUMENT_TYPE_ID,
    '79e68c1742ff427ea52ada9323cf89e0', // Report
    PAPER_TYPE_ID,
    '2f754c62cd07e2885f0581d07fb3524e', // Paper
    DATASET_TYPE_ID,
    '7e66b3d6ccd52cdb6cd89552cc9a15cb', // Dataset
    QUOTE_TYPE_ID,
    'a88271e650ebc833d854f455f12a236d', // Quote
  ],
  case: ['c058821272ef463fa97a93693456c8ba'], // Legal case
  other: [],
};

/** Structural types: an entity with one of these and no kind's type is never a node. */
export const PLUMBING_TYPE_IDS: readonly string[] = [
  SystemIds.SCHEMA_TYPE,
  SystemIds.PROPERTY,
  SystemIds.RELATION_TYPE,
  SystemIds.DATA_TYPE,
  SystemIds.PAGE_TYPE,
  SystemIds.SPACE_TYPE,
  SystemIds.VIEW_TYPE,
  SystemIds.TEXT_BLOCK,
  SystemIds.DATA_BLOCK,
  SystemIds.IMAGE_BLOCK,
  SystemIds.VIDEO_BLOCK,
  ContentIds.TAG_TYPE,
  'e0fcc66c9e8643f480802469d8a1a93a', // Tag
].map(normId);

/** What `other` must not overlap: every kind's types and the plumbing types. */
export const NOT_OTHER_TYPE_IDS: readonly string[] = [
  ...GRAPH_KINDS.flatMap(kind => GRAPH_KIND_TYPE_IDS[kind]),
  ...PLUMBING_TYPE_IDS,
];
const PLUMBING = new Set(PLUMBING_TYPE_IDS);

const KIND_BY_TYPE = new Map<string, GraphKind>();
for (const kind of GRAPH_KINDS) for (const id of GRAPH_KIND_TYPE_IDS[kind]) KIND_BY_TYPE.set(id, kind);

/**
 * The node's kind from its types. Topic wins only alone or beside Timeline, since it is often a second
 * type; a News event (also typed Claim) is an event. Unlisted types are `other`; null only for plumbing.
 */
export function graphKindOf(typeIds: readonly string[]): GraphKind | null {
  let ids = typeIds.map(normId);
  if (ids.includes(NEWS_EVENT_TYPE_ID)) return 'event';
  if (ids.some(id => KIND_BY_TYPE.get(id) === 'topic')) ids = ids.filter(id => id !== TIMELINE_TYPE_ID);
  let best: GraphKind | null = null;
  for (const id of ids) {
    const kind = KIND_BY_TYPE.get(id);
    if (!kind) continue;
    if (
      best === null ||
      best === 'topic' ||
      (kind !== 'topic' && GRAPH_KINDS.indexOf(kind) < GRAPH_KINDS.indexOf(best))
    )
      best = kind;
  }
  if (best) return best;
  return ids.some(id => PLUMBING.has(id)) ? null : 'other';
}

export function parseGraphKinds(raw: string | null): GraphKind[] | undefined {
  if (raw === null) return undefined;
  const kinds = raw.split(',').map(part => part.trim()) as GraphKind[];
  const known = GRAPH_KINDS.filter(kind => kinds.includes(kind));
  return known.length > 0 ? known : undefined;
}

/** Rank within a kind: the position of its best type in the kind's list (people before places). */
export function graphTypeRank(kind: GraphKind, typeIds: readonly string[]): number {
  const order = GRAPH_KIND_TYPE_IDS[kind];
  const ranks = typeIds.map(id => order.indexOf(normId(id))).filter(rank => rank >= 0);
  return ranks.length ? Math.min(...ranks) : order.length;
}

/** Display relations: never nodes or edges. */
export const PLUMBING_RELATION_TYPE_IDS: readonly string[] = [
  '8f151ba4de204e3c9cb499ddf96f48f1', // Types
  '257090341ba5406f94e4d4af90042fba', // Tags
  '34f535072e6b42c5a84443981a77cfa2', // Cover
  AVATAR_PROPERTY_ID,
  'beaba5cba67741a8b35377030613fc70', // Blocks
  '4d9cba1c4766469881cd3273891a018b', // Tabs
  'a99f9ce12ffa4dac8c61f6310d46064a', // Collection item
  '19a4cfff45f24150abf2af0f43eb2eec', // Ranking Vote
  '890deffb384349fa826974000e3dcef6', // Rank position
  '8fcfe5ef3d9147bd83223830a998d26b', // Roles
];

/** How content relations read from each end; merged into RELATION_LABELS. */
export const CONTENT_RELATION_LABELS: Record<string, { out: string; in: string }> = {
  '806d52bc27e94c9193c057978b093351': { out: 'Topic', in: 'On this topic' }, // Topics
  '49c5d5e1679a4dbdbfd33f618f227c94': { out: 'Source', in: 'Cited by' }, // Sources
  '91a9e2f6e51a48f7997661de8561b690': { out: 'Author', in: 'Wrote' }, // Authors
  '9ec2b47e481947c0a99e8ddb27a3ed8e': { out: 'Publisher', in: 'Published' }, // Publisher
  e1371bcda7044396adb7ea7ecc8fe3d4: { out: 'Notable claim', in: 'Notable claim in' }, // Notable claims
  '504e5776788844f6a77dba3ee811d8f0': { out: 'Related claim', in: 'Related to' }, // Related claims
  e81750db3f09440cab9dd01808a43ccb: { out: 'Similar claim', in: 'Similar claim' }, // Similar claims
  '1dc6a843458848198e7a6e672268f811': { out: 'Supporting argument', in: 'Supports' }, // Supporting arguments
  '4e6ec5d14292498a84e5f607ca1a08ce': { out: 'Opposing argument', in: 'Opposes' }, // Opposing arguments
  '09987fc8b20ddf11875d4e8e41336826': { out: 'Supports', in: 'Supported by' }, // Supports
  '71d1bcd5f1cf487fb9a3c7b1d53803eb': { out: 'Opposes', in: 'Opposed by' }, // Opposes
  '249010038c9e4663a7922a63ffe23f39': { out: 'Story', in: 'Story in' }, // Stories
  ff5c1866e5ea41ebbbd93b30536ec020: { out: 'Related story', in: 'Related story' }, // Related stories
  d58d55c4d5434d4c94538092f2629d83: { out: 'Event', in: 'Part of' }, // Events
  '0c5ec2e899494c15a4bdbfaa3442dc4c': { out: 'Actor', in: 'Actor in' }, // Actors (Conflict event)
  '4fa2168bc6ab443ab269ad7ea02fb0a6': { out: 'Theatre', in: 'Theatre of' }, // Theatre
  '95d770021faf4f7cb7deb21a7d48cda0': { out: 'Location', in: 'Location of' }, // Location
  '8cbaab9c1a7e4078b1268fcae5e0d12b': { out: 'Key claim', in: 'Key claim in' }, // Key claims
  '74f188976da94694a1665a5e0597e0fe': { out: 'Key figure', in: 'Key figure in' }, // Key figures
  b214879e1e304bfdbd1d5c5251126ce2: { out: 'Plaintiff', in: 'Brought' }, // Plaintiff
  a7d5747076bf4fb8802d3ed5b11eab96: { out: 'Defendant', in: 'Faces' }, // Defendant
  c72d9abbbca84e86b7e8b71e91d2b37e: { out: 'Host', in: 'Hosted' }, // Hosts
  cb60a1a66fb548c9b936200c5c271330: { out: 'Guest', in: 'Guest on' }, // Guests
};

/** A claim's relation to another claim that makes it an argument for or against it. */
export const ARGUMENT_RELATION_TYPE_IDS = [
  '1dc6a843458848198e7a6e672268f811',
  '4e6ec5d14292498a84e5f607ca1a08ce',
  '09987fc8b20ddf11875d4e8e41336826',
  '71d1bcd5f1cf487fb9a3c7b1d53803eb',
];

/** Value properties for an event or source's date line. */
export const DATE_PROPERTY_IDS = ['52665f3efb7d48d58b6babb21b0d36db', '94e43fe8faf241009eb887ab4f999723'];
