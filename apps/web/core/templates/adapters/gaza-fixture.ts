'use client';

import * as React from 'react';

import {
  type ClaimKind,
  type ClaimStance,
  type ClaimSummaryModel,
  type ClaimTemplateModel,
  type CommunityDefinition,
  type ContextPeekItemModel,
  type DebateTemplateModel,
  type EntityContextDataModel,
  type EntityListSectionModel,
  type EventTemplateModel,
  type GraphConnectionGroupModel,
  type NewsStoryTemplateModel,
  type PostContextNoteModel,
  type PostSuggestedEvidenceModel,
  type PostTemplateModel,
  type SourceLibraryItemModel,
  type SourceLibraryTemplateModel,
  type SourceMediaKind,
  type SourceQuoteModel,
  type SourceTemplateModel,
  type SplitBreakdown,
  type SubClaimModel,
  type TemplateDataSource,
  type TimelineTemplateModel,
  type TopicRankingItemModel,
  type TopicRankingModel,
  type TopicTemplateModel,
  type TopicTrendsModel,
  type TopicViralPostPreviewModel,
  type VoteChoice,
  computeSplitGap,
  formatClaimKindLabel,
  formatCompactCount,
  isClaimSplit,
} from '../models';
import { outletColorFrom, outletInitialsFrom } from '../ontology';
import {
  DEBATE_BY_ID,
  SEED_DEBATES,
  SEED_GRAPH_NODES,
  SEED_TIMELINE_ERAS,
  SEED_TIMELINE_NUMBERS,
  SEED_TIMELINE_TURNS,
  classifySourceLibraryGroup,
} from './gaza-fixture-seed';

/**
 * Full cross-linked Israel–Gaza prototype dataset implementing all nine template view-model
 * contracts (`Topic`, `Claim`, `Event`, `NewsStory`, `Source`, `Post`, `Debate`, `Timeline`,
 * `SourceLibrary`).
 */

export const GAZA_COMMUNITIES: readonly CommunityDefinition[] = [
  { id: 'pp', name: 'Pro-Palestinian', shortName: 'Pro-Palestinian', color: '#6833ff', memberCount: 4812 },
  { id: 'pi', name: 'Pro-Israel', shortName: 'Pro-Israel', color: '#3963fe', memberCount: 4377 },
];

export type GazaFixtureRoute =
  | { kind: 'topic' }
  | { kind: 'claim'; id: string }
  | { kind: 'event'; id: string }
  | { kind: 'news-story'; id: string }
  | { kind: 'source'; id: string }
  | { kind: 'post'; id: string }
  | { kind: 'debate'; id: string }
  | { kind: 'timeline' }
  | { kind: 'sources' };

const TOPIC_LEDE_BY_COMMUNITY: Record<string, string> = {
  all: 'A Hamas-led attack on 7 October 2023 killed about 1,200 people in Israel and took 251 hostages. Israel’s war in Gaza has since killed more than 70,000 Palestinians, by the Gaza Health Ministry’s count; in January 2026 an Israeli military official accepted the total as it stood then, about 71,000. A ceasefire has held in name since October 2025: every hostage is home, but strikes continue, Israel holds more than half of Gaza, and Hamas hasn’t disarmed.',
  pp: 'As the Pro-Palestinian community puts it: Israel has killed more than 70,000 Palestinians, most of them women, children and older people, destroyed 82% of Gaza’s buildings and, by cutting off aid, caused famine. A UN commission found genocide and says it continued after the ceasefire, while Israel’s zone inside Gaza keeps growing.',
  pi: 'As the Pro-Israel community puts it: Hamas started this war with the worst massacre of Jews since the Holocaust and held hostages for over two years. It fought from hospitals, schools and tunnels, which is why so many civilians died. Every hostage is now home, and Israel won’t leave Gaza until Hamas gives up its weapons.',
};

interface SeedSource {
  id: string;
  title: string;
  publisher: string;
  date: string;
  sourceType: string;
  mediaType: SourceMediaKind;
  summary: string;
  quotes?: readonly SourceQuoteModel[];
  duration?: string;
  authorHandle?: string;
  pickTag?: string;
  url?: string;
}

const SEED_SOURCES: readonly SeedSource[] = [
  {
    id: 's-coi',
    title: 'UN Commission of Inquiry: legal analysis of Israel’s conduct in Gaza',
    publisher: 'UN Human Rights Council',
    date: '16 Sep 2025',
    sourceType: 'Report',
    mediaType: 'document',
    summary:
      'The commission, mandated by the UN Human Rights Council, concluded that Israeli authorities and forces committed four of the five acts defined as genocide in the Genocide Convention. Israel rejected the report and the commission’s mandate.',
    quotes: [
      {
        id: 'q-coi-1',
        text: 'The Commission concludes that Israeli authorities and security forces have committed four of the five genocidal acts defined under the 1948 Convention, including killing and inflicting conditions of life calculated to bring about physical destruction.',
        speaker: 'UN Independent International Commission of Inquiry',
        location: 'Report A/HRC/60, §142',
      },
    ],
    url: 'https://www.ohchr.org',
  },
  {
    id: 's-icj',
    title: 'ICJ order in South Africa v. Israel',
    publisher: 'International Court of Justice',
    date: '26 Jan 2024',
    sourceType: 'Court document',
    mediaType: 'document',
    summary:
      'The court’s provisional measures order directed Israel to take all measures within its power to prevent acts of genocide and enable humanitarian aid. It did not rule on the merits; a final ruling is expected around 2029.',
    quotes: [
      {
        id: 'q-icj-1',
        text: 'The State of Israel shall, in accordance with its obligations under the Convention on the Prevention and Punishment of the Crime of Genocide, take all measures within its power to prevent the commission of all acts within the scope of Article II.',
        speaker: 'International Court of Justice',
        location: 'Provisional Measures Order, §86(1)',
      },
      {
        id: 'q-icj-2',
        text: 'At the present stage of the proceedings, the Court is not called upon to determine definitively whether the rights which South Africa wishes to see protected exist.',
        speaker: 'International Court of Justice',
        location: 'Provisional Measures Order, §30',
      },
    ],
    url: 'https://www.icj-cij.org',
  },
  {
    id: 's-il-icj',
    title: 'Israel’s oral arguments at the ICJ',
    publisher: 'Government of Israel · ICJ Hearing',
    date: '12 Jan 2024',
    sourceType: 'Video hearing',
    mediaType: 'video',
    duration: '18:40',
    summary:
      'Israel’s legal team argued it is fighting Hamas in self-defence rather than targeting the Palestinian people, and asked the court to dismiss South Africa’s application.',
    quotes: [
      {
        id: 'q-il-icj-1',
        text: 'The key component of genocide—the intention to destroy a people, in whole or in part—is totally lacking. What Israel seeks by operating in Gaza is not to destroy a people, but to protect a people, its own people.',
        speaker: 'Tal Becker, Legal Adviser',
        location: 'ICJ Oral Proceedings, 07:12',
      },
    ],
    url: 'https://www.icj-cij.org',
  },
  {
    id: 's-unosat',
    title: 'UNOSAT satellite damage assessment',
    publisher: 'UN Satellite Centre (UNOSAT)',
    date: 'Jun 2026',
    sourceType: 'Dataset',
    mediaType: 'dataset',
    summary:
      'Compares satellite imagery from before the war with mid-2026 and finds about 82% of Gaza’s structures damaged or destroyed. It records physical damage without attributing responsibility.',
    quotes: [
      {
        id: 'q-unosat-1',
        text: 'Satellite-detected damage analysis indicates approximately 82 per cent of all structures across the Gaza Strip have been destroyed, severely damaged, or moderately affected relative to pre-October 2023 baseline imagery.',
        speaker: 'UNOSAT Damage Assessment',
        location: 'Executive Summary, Jun 2026',
      },
    ],
    url: 'https://unosat.org',
  },
  {
    id: 's-moh',
    title: 'Gaza Health Ministry casualty reports',
    publisher: 'Gaza Health Ministry',
    date: '15 Nov 2026',
    sourceType: 'Dataset',
    mediaType: 'dataset',
    summary:
      'The Hamas-run ministry’s running count of people killed, listed by name, age, and sex without distinguishing combatants: 74,702 by mid-November 2026. An IDF official accepted the January 2026 total of about 71,000.',
    quotes: [
      {
        id: 'q-moh-1',
        text: 'Identified fatalities recorded in hospital morgues and verified family submissions stand at 74,702, excluding missing persons believed buried beneath collapsed structures.',
        speaker: 'Gaza Health Ministry',
        location: 'Monthly Registry Update, Nov 2026',
      },
    ],
  },
  {
    id: 's-hostages',
    title: 'IDF and AP hostage records',
    publisher: 'Israel Defense Forces and AP',
    date: 'Jan 2026',
    sourceType: 'Dataset',
    mediaType: 'dataset',
    summary:
      'Records of each of the 251 people taken hostage on 7 October and their outcomes, compiled from IDF announcements and AP reporting. The last remains were returned on 26 January 2026.',
    quotes: [
      {
        id: 'q-hostages-1',
        text: 'With the recovery and identification of the final remains on 26 January 2026, all 251 individuals abducted during the 7 October attack have been accounted for.',
        speaker: 'IDF & AP Joint Tally',
        location: 'Jan 2026',
      },
    ],
  },
  {
    id: 's-plan',
    title: 'US 20-point plan for Gaza',
    publisher: 'White House',
    date: '29 Sep 2025',
    sourceType: 'Primary document',
    mediaType: 'document',
    summary:
      'The US framework behind the October 2025 ceasefire: hostages released within 72 hours, phased Israeli withdrawal to agreed lines, Hamas disarmament, and an international stabilisation force.',
    quotes: [
      {
        id: 'q-plan-1',
        text: 'Within 72 hours of Israel publicly accepting this agreement, all hostages—alive and deceased—will be returned, followed by phased redeployment to agreed perimeter lines tied to verified demilitarisation.',
        speaker: 'White House',
        location: '20-Point Framework, Points 4–7',
      },
    ],
  },
  {
    id: 's-afp',
    title: 'AFP 7 October victim tally',
    publisher: 'AFP',
    date: '2024',
    sourceType: 'Dataset',
    mediaType: 'dataset',
    summary:
      'Victim-by-victim tally compiled from Israeli official figures putting the 7 October death toll at about 1,200 people, most of them civilians.',
    quotes: [
      {
        id: 'q-afp-1',
        text: 'An AFP tally based on official Israeli figures records 1,195 people killed in the 7 October attack, including 815 civilians.',
        speaker: 'Agence France-Presse',
        location: 'Verified Casualty Tally',
      },
    ],
  },
  {
    id: 's-idf-est',
    title: 'IDF estimate of fighters killed in Gaza',
    publisher: 'Israel Defense Forces',
    date: 'Jan 2026',
    sourceType: 'Official post',
    mediaType: 'tweet',
    authorHandle: '@IDF',
    summary:
      'Military estimate that 24,000–25,000 fighters were killed in Gaza. The IDF has not published a full methodology or named list.',
    quotes: [
      {
        id: 'q-idf-1',
        text: 'Our operational assessments indicate approximately 24,000 to 25,000 Hamas and allied operatives have been eliminated across Gaza since October 2023.',
        speaker: 'IDF Spokesperson',
        location: 'Jan 2026 briefing',
      },
    ],
  },
  {
    id: 's-ipc',
    title: 'IPC Famine Review: Gaza Governorate',
    publisher: 'IPC',
    date: '22 Aug 2025',
    sourceType: 'Report',
    mediaType: 'article',
    summary:
      'Confirmed famine (Phase 5) in Gaza Governorate following the spring 2025 aid cutoff, before conditions eased in December 2025 under the ceasefire.',
    quotes: [
      {
        id: 'q-ipc-1',
        text: 'The Famine Review Committee determines that thresholds for IPC Phase 5 (Famine) have been surpassed in Gaza Governorate following prolonged disruption of food, water, and medical supplies.',
        speaker: 'IPC Famine Review Committee',
        location: 'Special Snapshot, Aug 2025',
      },
    ],
    pickTag: 'Pro-Palestinian pick for Pro-Israel readers',
  },
];

const SOURCE_BY_ID: Readonly<Record<string, SeedSource>> = Object.fromEntries(SEED_SOURCES.map(s => [s.id, s]));

interface SeedEvent {
  id: string;
  when: string;
  title: string;
  summary: string;
  claimIds: readonly string[];
  storyIds: readonly string[];
  sourceIds: readonly string[];
}

const SEED_EVENTS: readonly SeedEvent[] = [
  {
    id: 'e7oct',
    when: '7 Oct 2023',
    title: 'Hamas-led attack on Israel',
    summary:
      'Hamas-led gunmen broke through the Gaza fence and attacked towns, military posts, and the Nova music festival in southern Israel. About 1,200 people were killed, most of them civilians, and 251 were taken hostage.',
    claimIds: ['oct7', 'hostages'],
    storyIds: ['st-afp-oct7'],
    sourceIds: ['s-afp', 's-hostages'],
  },
  {
    id: 'eicj',
    when: '26 Jan 2024',
    title: 'ICJ orders Israel to prevent genocidal acts',
    summary:
      'In South Africa’s genocide case, the International Court of Justice ordered provisional measures requiring Israel to prevent genocidal acts and enable aid into Gaza, without ruling on the merits.',
    claimIds: ['gen', 'aid', 'icc'],
    storyIds: ['st-npr-icj'],
    sourceIds: ['s-icj', 's-il-icj'],
  },
  {
    id: 'erafah',
    when: '6 May 2024',
    title: 'Israeli forces launch ground operation in Rafah',
    summary:
      'Israeli troops seized the Gaza side of the Rafah crossing and entered southern Gaza’s last major refuge, displacing more than 800,000 people and halting primary aid corridors.',
    claimIds: ['aid', 'shields', 'us-arms'],
    storyIds: [],
    sourceIds: ['s-ipc', 's-unosat'],
  },
  {
    id: 'eicc',
    when: '21 Nov 2024',
    title: 'ICC issues arrest warrants for Netanyahu, Gallant, and Deif',
    summary:
      'The International Criminal Court issued arrest warrants alleging war crimes and crimes against humanity for Israeli Prime Minister Benjamin Netanyahu, former defense minister Yoav Gallant, and Hamas commander Mohammed Deif.',
    claimIds: ['icc', 'gen'],
    storyIds: [],
    sourceIds: ['s-icj', 's-il-icj'],
  },
  {
    id: 'ecf',
    when: '10–13 Oct 2025',
    title: 'Ceasefire; all living hostages freed',
    summary:
      'A ceasefire under the US 20-point plan took effect on 10 October 2025 as Israel pulled back to the Yellow Line. On 13 October all 20 living hostages were freed alongside roughly 2,000 Palestinian prisoners and detainees.',
    claimIds: ['hostages', 'cf'],
    storyIds: ['st-toi-cf'],
    sourceIds: ['s-plan', 's-hostages'],
  },
  {
    id: 'e71k',
    when: '29 Jan 2026',
    title: 'An Israeli military official accepts about 71,000 killed',
    summary:
      'An Israeli military official accepted the Gaza Health Ministry’s figure of about 71,000 Palestinians killed as of January 2026, while noting that the combatant-to-civilian breakdown remained under analysis.',
    claimIds: ['k70', 'civ'],
    storyIds: ['st-haaretz-71k'],
    sourceIds: ['s-moh', 's-idf-est'],
  },
  {
    id: 'edis',
    when: '30 Jul 2026',
    title: 'Disarmament deadlock: phased handover vs disarm first',
    summary:
      'US mediators announced a 15-point phased disarmament roadmap. Israel stated it never agreed and will not withdraw further until Hamas fully disarms.',
    claimIds: ['gov'],
    storyIds: ['st-cnn-disarm'],
    sourceIds: ['s-plan'],
  },
  {
    id: 'ecoi',
    when: '26 Oct 2026',
    title: 'UN inquiry says genocidal acts continued after the ceasefire',
    summary:
      'The UN Commission of Inquiry issued a follow-up report covering the year since the October 2025 ceasefire. Israel dismissed it as a propaganda document.',
    claimIds: ['gen'],
    storyIds: ['st-abc-coi'],
    sourceIds: ['s-coi', 's-icj'],
  },
];

const EVENT_BY_ID: Readonly<Record<string, SeedEvent>> = Object.fromEntries(SEED_EVENTS.map(e => [e.id, e]));

interface SeedStory {
  id: string;
  eventId: string;
  outlet: string;
  date: string;
  headline: string;
  summary: string;
  claimId: string;
  accPp: number;
  accPi: number;
  sourceIds: readonly string[];
  url: string;
}

const SEED_STORIES: readonly SeedStory[] = [
  {
    id: 'st-afp-oct7',
    eventId: 'e7oct',
    outlet: 'AFP',
    date: '2024',
    headline: 'How many died on 7 October: AFP’s count of the victims',
    summary:
      'AFP’s tally, built from Israeli official figures, puts the toll at about 1,200 people, most of them civilians, including hostages later killed in captivity.',
    claimId: 'oct7',
    accPp: 84,
    accPi: 98,
    sourceIds: ['s-afp'],
    url: 'https://www.afp.com',
  },
  {
    id: 'st-npr-icj',
    eventId: 'eicj',
    outlet: 'NPR',
    date: '26 Jan 2024',
    headline: 'World court orders Israel to prevent genocidal acts in Gaza but stops short of ordering a ceasefire',
    summary:
      'The court granted most provisional measures requested by South Africa, directing Israel to prevent genocidal acts, enable humanitarian aid, and report back.',
    claimId: 'gen',
    accPp: 90,
    accPi: 95,
    sourceIds: ['s-icj'],
    url: 'https://www.npr.org',
  },
  {
    id: 'st-toi-cf',
    eventId: 'ecf',
    outlet: 'Times of Israel',
    date: '10 Oct 2025',
    headline: 'Ceasefire takes effect as troops pull back to the Yellow Line',
    summary:
      'Under phase one of the US plan, Israeli forces pulled back to lines leaving roughly 53% of Gaza under Israeli control while leaving disarmament to later phases.',
    claimId: 'cf',
    accPp: 90,
    accPi: 94,
    sourceIds: ['s-plan'],
    url: 'https://www.timesofisrael.com',
  },
  {
    id: 'st-haaretz-71k',
    eventId: 'e71k',
    outlet: 'Haaretz',
    date: '29 Jan 2026',
    headline: 'IDF accepts Gaza Health Ministry estimate of over 70,000 Palestinians killed in the war',
    summary:
      'A senior military official accepted the overall tally previously disputed by Israeli officials, while maintaining that the civilian–combatant ratio is still being assessed.',
    claimId: 'k70',
    accPp: 95,
    accPi: 80,
    sourceIds: ['s-moh', 's-idf-est'],
    url: 'https://www.haaretz.com',
  },
  {
    id: 'st-cnn-disarm',
    eventId: 'edis',
    outlet: 'CNN',
    date: '31 Jul 2026',
    headline: 'US says Hamas accepted a phased disarmament plan; Israel says it never agreed',
    summary:
      'Mediators proposed transferring weapons to a Palestinian technocratic committee in stages tied to Israeli pullback; Israel insisted on full disarmament first.',
    claimId: 'gov',
    accPp: 88,
    accPi: 72,
    sourceIds: ['s-plan'],
    url: 'https://www.cnn.com',
  },
  {
    id: 'st-abc-coi',
    eventId: 'ecoi',
    outlet: 'ABC News (Australia)',
    date: '27 Oct 2026',
    headline: 'UN commission finds Israel continued Gaza genocide after truce',
    summary:
      'The commission’s follow-up report examined the year since the ceasefire; Israel rejected the report and questioned the panel’s mandate.',
    claimId: 'gen',
    accPp: 90,
    accPi: 40,
    sourceIds: ['s-coi'],
    url: 'https://www.abc.net.au',
  },
];

const STORY_BY_ID: Readonly<Record<string, SeedStory>> = Object.fromEntries(SEED_STORIES.map(s => [s.id, s]));

interface SeedPost {
  id: string;
  authorName: string;
  authorHandle: string;
  platform: string;
  viewsLabel: string;
  when: string;
  body: string;
  engagement: readonly { label: string; value: string }[];
  claims: readonly { claimId: string; stanceLabel: string }[];
  notes: readonly {
    id: string;
    tag: string;
    by: 'pp' | 'pi';
    text: string;
    sourceIds: readonly string[];
    ppHelp: number;
    piHelp: number;
    ratingCount: string;
    shown: boolean;
  }[];
  suggestedEvidence: readonly PostSuggestedEvidenceModel[];
  eventIds: readonly string[];
}

const SEED_POSTS: readonly SeedPost[] = [
  {
    id: 'p-camps',
    authorName: 'Free Voices',
    authorHandle: '@freevoices_now',
    platform: 'X',
    viewsLabel: '4.1M views',
    when: '2 days ago',
    body: 'They are bombing the camps again tonight. The world is silent.',
    engagement: [
      { label: 'Replies', value: '18.2K' },
      { label: 'Reposts', value: '96.4K' },
      { label: 'Likes', value: '312K' },
    ],
    claims: [{ claimId: 'cf', stanceLabel: 'Post says false' }],
    notes: [
      {
        id: 'n-aleppo',
        tag: 'Old footage',
        by: 'pi',
        text: 'This clip is from Aleppo, Syria, in 2016, not Gaza. The original upload and reverse image search match are linked below.',
        sourceIds: ['s-unosat'],
        ppHelp: 61,
        piHelp: 96,
        ratingCount: '2,140 ratings',
        shown: true,
      },
    ],
    suggestedEvidence: [
      {
        id: 'ev-aleppo-yt',
        title: 'Original upload: Aleppo hospital, 2016',
        meta: 'YouTube · 2016',
        mediaType: 'video',
      },
      { id: 'ev-lens', title: 'Reverse image search match', meta: 'Google Lens', mediaType: 'document' },
      {
        id: 'ev-bellingcat',
        title: 'Syrian war images reused in Gaza coverage',
        meta: 'Bellingcat · Dec 2023',
        mediaType: 'article',
      },
    ],
    eventIds: ['ecf'],
  },
  {
    id: 'p-toll',
    authorName: 'Truth Ledger',
    authorHandle: '@truthledger_il',
    platform: 'X',
    viewsLabel: '2.7M views',
    when: '3 days ago',
    body: 'The Gaza death toll is invented by Hamas. Every number you see is fake.',
    engagement: [
      { label: 'Replies', value: '9,412' },
      { label: 'Reposts', value: '31.7K' },
      { label: 'Likes', value: '88.1K' },
    ],
    claims: [
      { claimId: 'k70', stanceLabel: 'Post says false' },
      { claimId: 'civ', stanceLabel: 'Post says false' },
    ],
    notes: [
      {
        id: 'n-71k',
        tag: 'Missing context',
        by: 'pp',
        text: 'An Israeli military official accepted the ministry’s total of about 71,000 in January 2026. The real dispute is how many were fighters: the IDF estimates 24,000–25,000.',
        sourceIds: ['s-moh', 's-idf-est'],
        ppHelp: 94,
        piHelp: 58,
        ratingCount: '1,680 ratings',
        shown: true,
      },
      {
        id: 'n-lancet',
        tag: 'Disputed figure',
        by: 'pp',
        text: '“Every number is fake” goes further than any dataset. Even the IDF’s own estimates put total casualties in the tens of thousands.',
        sourceIds: ['s-moh'],
        ppHelp: 92,
        piHelp: 24,
        ratingCount: '640 ratings',
        shown: false,
      },
    ],
    suggestedEvidence: [
      {
        id: 'ev-haaretz',
        title: 'IDF official accepts about 71,000 killed',
        meta: 'Haaretz · Jan 2026',
        mediaType: 'article',
      },
      {
        id: 'ev-moh',
        title: 'Gaza Health Ministry named casualty list',
        meta: 'Gaza Health Ministry · Nov 2026',
        mediaType: 'dataset',
      },
    ],
    eventIds: ['e71k'],
  },
  {
    id: 'p-aid',
    authorName: 'Mideast Unfiltered',
    authorHandle: '@mideast_unfiltered',
    platform: 'Instagram',
    viewsLabel: '880k views',
    when: '5 hours ago',
    body: 'Not one aid truck has entered Gaza this month. Not one.',
    engagement: [
      { label: 'Comments', value: '3,208' },
      { label: 'Shares', value: '21.5K' },
      { label: 'Likes', value: '64.1K' },
    ],
    claims: [{ claimId: 'cf', stanceLabel: 'Post says false' }],
    notes: [],
    suggestedEvidence: [
      {
        id: 'ev-ocha',
        title: 'Humanitarian situation report: Kerem Shalom crossings',
        meta: 'UN OCHA · Sep 2026',
        mediaType: 'document',
      },
      { id: 'ev-cogat', title: 'Daily aid truck crossings log', meta: 'COGAT · 2026', mediaType: 'dataset' },
      {
        id: 'ev-ri',
        title: 'Six months into the ceasefire: the record on aid',
        meta: 'Refugees International · 2026',
        mediaType: 'article',
      },
    ],
    eventIds: ['ecf'],
  },
];

const POST_BY_ID: Readonly<Record<string, SeedPost>> = Object.fromEntries(SEED_POSTS.map(p => [p.id, p]));

interface SeedClaim {
  id: string;
  title: string;
  kind: ClaimKind;
  pp: number;
  pi: number;
  all: number;
  npp: number;
  npi: number;
  nall: number;
  debatesCount: number;
  badgeLabel?: string;
  basisSummary?: string;
  agreedBasis?: { summary: string; sourceIds: readonly string[] };
  splitNextIds?: readonly string[];
  subClaims?: readonly {
    id: string;
    title: string;
    kind?: ClaimKind;
    stance?: ClaimStance;
    pp: number;
    pi: number;
    stat: string;
    sourceIds: readonly string[];
  }[];
  cases?: readonly {
    communityId: 'pp' | 'pi';
    title: string;
    points: readonly string[];
    concede: string;
    sourceIds: readonly string[];
  }[];
  sourceIds: readonly string[];
  eventIds: readonly string[];
  storyIds: readonly string[];
}

const SEED_CLAIMS: readonly SeedClaim[] = [
  {
    id: 'gen',
    title: 'Israel is committing genocide in Gaza',
    kind: 'judgment',
    pp: 93,
    pi: 5,
    all: 47,
    npp: 1180,
    npi: 1090,
    nall: 18240,
    debatesCount: 11,
    badgeLabel: 'Most divided',
    subClaims: [
      {
        id: 'f-coi',
        title: 'The UN Commission of Inquiry concluded Israel committed four of the five acts of genocide',
        kind: 'fact',
        stance: 'supports',
        pp: 96,
        pi: 58,
        stat: 'Mandated by the UN Human Rights Council; follow-up report published Oct 2026.',
        sourceIds: ['s-coi'],
      },
      {
        id: 'f-scale',
        title:
          'The scale of killing, structural destruction, and spring 2025 aid halt meets the Genocide Convention threshold',
        kind: 'judgment',
        stance: 'supports',
        pp: 94,
        pi: 7,
        stat: 'Cites 70,000+ fatalities, 82% of structures damaged or destroyed, and confirmed IPC Phase 5 famine.',
        sourceIds: ['s-unosat', 's-ipc', 's-coi'],
      },
      {
        id: 'f-icj',
        title: 'No court has yet ruled on whether genocide occurred',
        kind: 'fact',
        stance: 'opposes',
        pp: 71,
        pi: 98,
        stat: 'The ICJ issued provisional measures in Jan 2024; a merits ruling is expected around 2029.',
        sourceIds: ['s-icj'],
      },
      {
        id: 'f-embedded',
        title:
          'Urban warfare against fighters embedded in tunnels and civilian sites does not establish genocidal intent',
        kind: 'judgment',
        stance: 'opposes',
        pp: 9,
        pi: 94,
        stat: 'Israel argued at the ICJ that evacuation warnings and aid corridors contradict dolus specialis.',
        sourceIds: ['s-il-icj', 's-icj'],
      },
      {
        id: 'f-intent',
        title: 'Specific intent (dolus specialis) under the 1948 Convention can be inferred from patterns of conduct',
        kind: 'judgment',
        stance: 'addresses',
        pp: 89,
        pi: 18,
        stat: 'International law scholars disagree on how broadly the ICJ’s “only reasonable inference” standard applies in urban warfare.',
        sourceIds: ['s-icj', 's-coi'],
      },
    ],
    cases: [
      {
        communityId: 'pp',
        title: 'Pro-Palestinian case: Scale of killing, destruction, and aid cutoffs meet the convention',
        points: [
          'Over 70,000 killed, 82% of structures damaged or destroyed, and confirmed famine after an 11-week aid halt.',
          'UN Commission of Inquiry, Amnesty International, and B’Tselem concluded genocidal acts occurred.',
        ],
        concede: 'The ICJ has not issued a final merits ruling yet, and Hamas committed atrocities on 7 October.',
        sourceIds: ['s-coi', 's-unosat', 's-ipc'],
      },
      {
        communityId: 'pi',
        title: 'Pro-Israel case: Urban war against an embedded enemy lacks genocidal intent',
        points: [
          'Israel issued evacuation orders, allowed aid corridors, and targeted Hamas fighters embedded in tunnels and civilian sites.',
          'South Africa’s claim has not been proven at the ICJ; high civilian tolls do not establish dolus specialis.',
        ],
        concede:
          'Civilian suffering and destruction in Gaza have been severe, and some officials made reckless statements.',
        sourceIds: ['s-il-icj', 's-icj'],
      },
    ],
    sourceIds: ['s-coi', 's-icj', 's-il-icj'],
    eventIds: ['eicj', 'ecoi'],
    storyIds: ['st-npr-icj', 'st-abc-coi'],
  },
  {
    id: 'cf',
    title: 'The ceasefire is being honoured',
    kind: 'judgment',
    pp: 4,
    pi: 61,
    all: 34,
    npp: 1088,
    npi: 1042,
    nall: 5120,
    debatesCount: 3,
    badgeLabel: 'New this week',
    sourceIds: ['s-plan', 's-moh'],
    eventIds: ['ecf'],
    storyIds: ['st-toi-cf'],
  },
  {
    id: 'civ',
    title: 'Most of the 70,000+ killed in Gaza were civilians',
    kind: 'fact',
    pp: 98,
    pi: 24,
    all: 63,
    npp: 1120,
    npi: 1064,
    nall: 6910,
    debatesCount: 3,
    sourceIds: ['s-moh', 's-idf-est'],
    eventIds: ['e71k'],
    storyIds: ['st-haaretz-71k'],
  },
  {
    id: 'gov',
    title: 'Hamas should fully disarm before Israel withdraws further',
    kind: 'value-judgment',
    pp: 12,
    pi: 95,
    all: 52,
    npp: 1044,
    npi: 1110,
    nall: 6214,
    debatesCount: 7,
    sourceIds: ['s-plan'],
    eventIds: ['edis'],
    storyIds: ['st-cnn-disarm'],
  },
  {
    id: 'aid',
    title: 'Israel deliberately restricted humanitarian aid into Gaza as a weapon of war',
    kind: 'judgment',
    pp: 95,
    pi: 11,
    all: 54,
    npp: 1140,
    npi: 1030,
    nall: 9420,
    debatesCount: 6,
    sourceIds: ['s-ipc', 's-coi', 's-il-icj'],
    eventIds: ['erafah', 'eicj'],
    storyIds: [],
  },
  {
    id: 'shields',
    title: 'Hamas’s use of civilian infrastructure is the primary cause of Gaza’s civilian death toll',
    kind: 'judgment',
    pp: 9,
    pi: 92,
    all: 49,
    npp: 1090,
    npi: 1160,
    nall: 8740,
    debatesCount: 8,
    sourceIds: ['s-il-icj', 's-idf-est', 's-unosat'],
    eventIds: ['e71k', 'erafah'],
    storyIds: [],
  },
  {
    id: 'unrwa',
    title: 'UNRWA should be replaced rather than remain the primary aid agency in Gaza',
    kind: 'value-judgment',
    pp: 11,
    pi: 91,
    all: 50,
    npp: 980,
    npi: 1070,
    nall: 5830,
    debatesCount: 5,
    sourceIds: ['s-plan', 's-ipc'],
    eventIds: ['erafah'],
    storyIds: [],
  },
  {
    id: 'two-state',
    title: 'An independent Palestinian state alongside Israel is the only viable path to lasting security',
    kind: 'value-judgment',
    pp: 68,
    pi: 23,
    all: 48,
    npp: 1110,
    npi: 1050,
    nall: 7650,
    debatesCount: 9,
    sourceIds: ['s-plan'],
    eventIds: ['edis', 'ecf'],
    storyIds: [],
  },
  {
    id: 'icc',
    title: 'The ICC arrest warrants against Israeli leaders are legally justified',
    kind: 'judgment',
    pp: 94,
    pi: 8,
    all: 52,
    npp: 1060,
    npi: 1090,
    nall: 7190,
    debatesCount: 6,
    sourceIds: ['s-icj', 's-il-icj', 's-coi'],
    eventIds: ['eicc', 'eicj'],
    storyIds: [],
  },
  {
    id: 'us-arms',
    title: 'The United States should condition military aid to Israel on humanitarian and ceasefire benchmarks',
    kind: 'value-judgment',
    pp: 91,
    pi: 18,
    all: 56,
    npp: 1020,
    npi: 1040,
    nall: 6480,
    debatesCount: 4,
    sourceIds: ['s-plan', 's-ipc'],
    eventIds: ['erafah', 'ecf'],
    storyIds: [],
  },
  {
    id: 'hostages',
    title: 'Every hostage taken on 7 October has now been returned, alive or dead',
    kind: 'fact',
    pp: 94,
    pi: 100,
    all: 97,
    npp: 1090,
    npi: 1140,
    nall: 4320,
    debatesCount: 0,
    basisSummary: 'IDF, AP · Jan 2026',
    agreedBasis: {
      summary:
        'All 251 people taken on 7 October are accounted for in the hostage records both communities accept. The last remains came home on 26 January 2026.',
      sourceIds: ['s-hostages'],
    },
    splitNextIds: ['cf', 'gov'],
    sourceIds: ['s-hostages'],
    eventIds: ['ecf', 'e7oct'],
    storyIds: [],
  },
  {
    id: 'build',
    title: 'Most of Gaza’s buildings are damaged or destroyed',
    kind: 'fact',
    pp: 99,
    pi: 86,
    all: 93,
    npp: 1052,
    npi: 1020,
    nall: 3890,
    debatesCount: 0,
    basisSummary: 'UNOSAT: 82%, Jun 2026',
    agreedBasis: {
      summary:
        'Both communities accept the UN satellite count: about 82% of Gaza’s structures damaged or destroyed by June 2026. They split on who is responsible.',
      sourceIds: ['s-unosat'],
    },
    splitNextIds: ['gen', 'civ'],
    sourceIds: ['s-unosat'],
    eventIds: [],
    storyIds: [],
  },
  {
    id: 'oct7',
    title: 'Hamas-led attackers killed about 1,200 people in Israel on 7 October, most of them civilians',
    kind: 'fact',
    pp: 80,
    pi: 99,
    all: 90,
    npp: 1102,
    npi: 1150,
    nall: 4910,
    debatesCount: 0,
    basisSummary: 'Israeli government, AFP tally',
    agreedBasis: {
      summary:
        'Both communities accept a toll of about 1,200, most of them civilians, from Israel’s revised count and AFP’s victim-by-victim tally.',
      sourceIds: ['s-afp'],
    },
    splitNextIds: ['gen', 'gov'],
    sourceIds: ['s-afp'],
    eventIds: ['e7oct'],
    storyIds: ['st-afp-oct7'],
  },
  {
    id: 'k70',
    title: 'More than 70,000 people have been killed in Gaza',
    kind: 'fact',
    pp: 99,
    pi: 72,
    all: 86,
    npp: 1130,
    npi: 1080,
    nall: 5410,
    debatesCount: 0,
    basisSummary: 'Gaza Health Ministry; accepted by an IDF official, Jan 2026',
    agreedBasis: {
      summary:
        'Both accept the scale of the toll: the ministry counts 74,702 by mid-November 2026, and an IDF official accepted the January 2026 total of about 71,000.',
      sourceIds: ['s-moh', 's-idf-est'],
    },
    splitNextIds: ['civ', 'gen'],
    sourceIds: ['s-moh', 's-idf-est'],
    eventIds: ['e71k'],
    storyIds: ['st-haaretz-71k'],
  },
];

const CLAIM_BY_ID: Readonly<Record<string, SeedClaim>> = Object.fromEntries(SEED_CLAIMS.map(c => [c.id, c]));

const ACCEPTED_CLAIM_IDS: readonly string[] = ['hostages', 'build', 'oct7', 'k70'];

const PIN_ORDER: Record<string, readonly string[]> = {
  all: ['gen', 'aid', 'shields', 'two-state', 'icc', 'civ', 'us-arms', 'gov', 'unrwa', 'cf'],
  pp: ['gen', 'aid', 'civ', 'icc', 'us-arms', 'two-state', 'cf', 'gov', 'shields', 'unrwa'],
  pi: ['gov', 'shields', 'unrwa', 'cf', 'civ', 'two-state', 'us-arms', 'aid', 'icc', 'gen'],
};

const SEED_ENTITY_CONTEXT: Readonly<Record<string, EntityContextDataModel>> = {
  gen: {
    triples: [
      {
        id: 't-gen-status',
        predicate: 'Legal status',
        values: [
          { id: 'v-gen-icj', label: 'ICJ provisional measures (Jan 2024)' },
          { id: 'v-gen-merits', label: 'Merits ruling pending (~2029)' },
        ],
      },
      {
        id: 't-gen-supporting',
        predicate: 'Supporting reports',
        values: [
          { id: 'v-gen-coi', label: 'UN Commission of Inquiry' },
          { id: 'v-gen-amnesty', label: 'Amnesty International' },
          { id: 'v-gen-btselem', label: 'B’Tselem' },
        ],
      },
      {
        id: 't-gen-actors',
        predicate: 'Related actors',
        values: [
          { id: 'v-gen-court', label: 'International Court of Justice' },
          { id: 'v-gen-il', label: 'Israel’s government' },
          { id: 'v-gen-sa', label: 'South Africa' },
        ],
      },
    ],
    flags: [
      {
        id: 'flg-gen-1',
        reason: 'Missing framing',
        body: 'Legal scholars split on whether the high threshold of specific intent (dolus specialis) under the 1948 Convention is established alongside military objectives.',
        helpfulPercent: 84,
        bridging: true,
      },
    ],
  },
  civ: {
    triples: [
      {
        id: 't-civ-sources',
        predicate: 'Datasets cited',
        values: [
          { id: 'v-civ-moh', label: 'Gaza Health Ministry (74,702)' },
          { id: 'v-civ-idf', label: 'IDF fighter estimate (24k–25k)' },
        ],
      },
      {
        id: 't-civ-ratio',
        predicate: 'Implied ratio',
        values: [{ id: 'v-civ-two-thirds', label: '~65–70% civilians using IDF upper bound' }],
      },
    ],
  },
  cf: {
    triples: [
      {
        id: 't-cf-framework',
        predicate: 'Framework',
        values: [
          { id: 'v-cf-plan', label: 'US 20-point plan' },
          { id: 'v-cf-line', label: 'Yellow Line perimeter' },
        ],
      },
    ],
    flags: [
      {
        id: 'flg-cf-1',
        reason: 'Disputed fact',
        body: 'Both sides accuse the other of repeated ceasefire violations since October 2025, with hundreds killed in strikes near the Yellow Line.',
        helpfulPercent: 88,
        bridging: true,
      },
    ],
  },
  'd-gen': {
    triples: [
      {
        id: 't-dgen-refs',
        predicate: 'Sources cited',
        values: [
          { id: 'v-dgen-icj', label: 'ICJ Order (Jan 2024)' },
          { id: 'v-dgen-coi', label: 'UN Commission of Inquiry' },
        ],
      },
      {
        id: 't-dgen-context',
        predicate: 'Recorded after',
        values: [{ id: 'v-dgen-ev', label: 'UN inquiry follow-up (Oct 2026)' }],
      },
    ],
  },
  e71k: {
    triples: [
      {
        id: 't-e71k-actors',
        predicate: 'Actors',
        values: [
          { id: 'v-e71k-idf', label: 'Israel Defense Forces' },
          { id: 'v-e71k-moh', label: 'Gaza Health Ministry' },
        ],
      },
      {
        id: 't-e71k-clarif',
        predicate: 'Clarifications',
        values: [
          { id: 'v-e71k-1', label: 'Not an official army count (IDF spokesperson)' },
          { id: 'v-e71k-2', label: 'Combatant breakdown under analysis' },
        ],
      },
    ],
  },
  ecoi: {
    triples: [
      {
        id: 't-ecoi-body',
        predicate: 'Mandated by',
        values: [{ id: 'v-ecoi-hrc', label: 'UN Human Rights Council' }],
      },
      {
        id: 't-ecoi-scope',
        predicate: 'Period covered',
        values: [{ id: 'v-ecoi-yr', label: 'Oct 2025 – Oct 2026 (post-ceasefire)' }],
      },
    ],
    flags: [
      {
        id: 'flg-ecoi-1',
        reason: 'Missing framing',
        body: 'Israel declined to cooperate with the Commission of Inquiry and rejected the report as politically biased.',
        helpfulPercent: 82,
        bridging: true,
      },
    ],
  },
  's-il-icj': {
    triples: [
      {
        id: 't-sil-speaker',
        predicate: 'Speaker',
        values: [{ id: 'v-sil-becker', label: 'Tal Becker (Legal Adviser)' }],
      },
      {
        id: 't-sil-proc',
        predicate: 'Proceeding',
        values: [
          { id: 'v-sil-case', label: 'South Africa v. Israel' },
          { id: 'v-sil-court', label: 'International Court of Justice' },
        ],
      },
      {
        id: 't-sil-outcome',
        predicate: 'Outcome',
        values: [
          { id: 'v-sil-dismiss', label: 'Court declined dismissal' },
          { id: 'v-sil-pm', label: 'Provisional measures ordered (26 Jan 2024)' },
        ],
      },
    ],
  },
  's-idf-est': {
    triples: [
      {
        id: 't-sidf-pub',
        predicate: 'Published by',
        values: [{ id: 'v-sidf-idf', label: 'Israel Defense Forces (@IDF)' }],
      },
      {
        id: 't-sidf-fig',
        predicate: 'Figures',
        values: [
          { id: 'v-sidf-f1', label: '24,000–25,000 fighters estimated' },
          { id: 'v-sidf-f2', label: '~71,000 overall toll accepted (Jan 2026)' },
        ],
      },
      {
        id: 't-sidf-method',
        predicate: 'Methodology',
        values: [{ id: 'v-sidf-m', label: 'No named list or methodology published' }],
      },
    ],
    flags: [
      {
        id: 'flg-sidf-1',
        reason: 'Missing methodology',
        body: 'The IDF has not released a named list or methodology distinguishing Hamas fighters from police, civil defence personnel, or military-age civilians.',
        helpfulPercent: 86,
        bridging: true,
      },
    ],
  },
  's-coi': {
    triples: [
      {
        id: 't-scoi-mandate',
        predicate: 'Mandated by',
        values: [{ id: 'v-scoi-hrc', label: 'UN Human Rights Council' }],
      },
      {
        id: 't-scoi-finding',
        predicate: 'Findings',
        values: [
          { id: 'v-scoi-f1', label: '4 of 5 Genocide Convention acts' },
          { id: 'v-scoi-f2', label: 'Follow-up report (Oct 2026)' },
        ],
      },
      {
        id: 't-scoi-disputed',
        predicate: 'Disputed by',
        values: [
          { id: 'v-scoi-il', label: 'Israel’s government' },
          { id: 'v-scoi-scholars', label: 'Legal scholars (intent standard)' },
        ],
      },
    ],
    flags: [
      {
        id: 'flg-scoi-1',
        reason: 'Disputed mandate',
        body: 'Israel and several Western legal scholars dispute the Commission’s open-ended mandate and argue its legal standard for genocidal intent departs from ICJ precedent.',
        helpfulPercent: 79,
        bridging: true,
      },
    ],
  },
  's-unosat': {
    triples: [
      {
        id: 't-sunosat-method',
        predicate: 'Method',
        values: [
          { id: 'v-sunosat-m1', label: 'Pre-war vs Jun 2026 satellite imagery' },
          { id: 'v-sunosat-m2', label: 'Roof & facade damage detection' },
        ],
      },
      {
        id: 't-sunosat-limit',
        predicate: 'Limitations',
        values: [{ id: 'v-sunosat-l1', label: 'Records physical damage without attributing cause' }],
      },
    ],
  },
  'q-icj-1': {
    triples: [
      {
        id: 't-qicj-court',
        predicate: 'Issued by',
        values: [{ id: 'v-qicj-c', label: 'International Court of Justice' }],
      },
      {
        id: 't-qicj-effect',
        predicate: 'Legal effect',
        values: [
          { id: 'v-qicj-e1', label: 'Binding under Article 41' },
          { id: 'v-qicj-e2', label: 'Does not prejudge final merits' },
        ],
      },
    ],
  },
};

const WEEK_LABELS = [
  '5 Jan',
  '19 Jan',
  '2 Feb',
  '16 Feb',
  '2 Mar',
  '16 Mar',
  '30 Mar',
  '13 Apr',
  '27 Apr',
  '11 May',
  '25 May',
  '8 Jun',
  '22 Jun',
  '6 Jul',
  '20 Jul',
  '3 Aug',
  '17 Aug',
  '31 Aug',
  '14 Sep',
  '28 Sep',
  '12 Oct',
  '26 Oct',
  '9 Nov',
];

function computeEffectiveSplit(
  ppBase: number,
  piBase: number,
  allBase: number,
  npp: number,
  npi: number,
  nall: number,
  userVote: VoteChoice,
  joinedCommunityId: 'pp' | 'pi' | null,
  includeEveryone: boolean
): { split: SplitBreakdown; overallPercent: number; totalVotes: number; impactNote?: string } {
  const agreedNum = userVote === 'agree' ? 1 : 0;
  const ppVoted = Boolean(userVote && joinedCommunityId === 'pp');
  const piVoted = Boolean(userVote && joinedCommunityId === 'pi');

  const ppVotes = npp + (ppVoted ? 1 : 0);
  const piVotes = npi + (piVoted ? 1 : 0);
  const ppPct = ppVoted ? ((ppBase * npp) / 100 + agreedNum) / (ppVotes / 100) : ppBase;
  const piPct = piVoted ? ((piBase * npi) / 100 + agreedNum) / (piVotes / 100) : piBase;

  const totalVotes = nall + (userVote ? 1 : 0);
  const allPct = userVote ? ((allBase * nall) / 100 + agreedNum) / (totalVotes / 100) : allBase;

  const rows = [
    ...(includeEveryone
      ? [
          {
            id: 'world-affairs',
            label: 'World affairs',
            color: '#202020',
            percent: allPct,
            voterCount: totalVotes,
            isEveryone: true,
          },
        ]
      : []),
    {
      id: 'pp',
      label: 'Pro-Palestinian',
      color: '#6833ff',
      percent: ppPct,
      voterCount: ppVotes,
      isSubspace: includeEveryone,
    },
    {
      id: 'pi',
      label: 'Pro-Israel',
      color: '#3963fe',
      percent: piPct,
      voterCount: piVotes,
      isSubspace: includeEveryone,
    },
  ];

  const gapPoints = computeSplitGap(rows);
  const impactNote = !userVote
    ? undefined
    : joinedCommunityId
      ? `Counted in ${joinedCommunityId === 'pp' ? 'Pro-Palestinian' : 'Pro-Israel'} and World affairs (${formatCompactCount(totalVotes)} votes).`
      : `Counted in World affairs (${formatCompactCount(totalVotes)} votes).`;

  return {
    split: { rows, gapPoints, isSplit: isClaimSplit(gapPoints), totalVotes },
    overallPercent: Math.round(allPct),
    totalVotes,
    impactNote,
  };
}

export type GazaPeekTarget =
  | { kind: 'source'; id: string }
  | { kind: 'entity'; id: string }
  | { kind: 'event'; id: string }
  | { kind: 'news-story'; id: string }
  | { kind: 'claim'; id: string };

export interface GazaFixtureController {
  activeRoute: GazaFixtureRoute;
  navigate: (route: GazaFixtureRoute) => void;
  openTopic: () => void;
  openClaim: (id: string) => void;
  openEvent: (id: string) => void;
  openStory: (id: string) => void;
  openSource: (id: string) => void;
  openPost: (id: string) => void;
  openDebate: (id: string) => void;
  openTimeline: () => void;
  openSources: () => void;
  peekItem: ContextPeekItemModel | null;
  canPeekGoBack: boolean;
  peekBackLabel?: string;
  popPeek: () => void;
  closePeek: () => void;
  topicSource: TemplateDataSource<TopicTemplateModel>;
  claimSource: TemplateDataSource<ClaimTemplateModel>;
  eventSource: TemplateDataSource<EventTemplateModel>;
  storySource: TemplateDataSource<NewsStoryTemplateModel>;
  sourceSource: TemplateDataSource<SourceTemplateModel>;
  postSource: TemplateDataSource<PostTemplateModel>;
  debateSource: TemplateDataSource<DebateTemplateModel>;
  timelineSource: TemplateDataSource<TimelineTemplateModel>;
  sourceLibrarySource: TemplateDataSource<SourceLibraryTemplateModel>;
  joinedCommunityId: 'pp' | 'pi' | null;
  setJoinedCommunityId: (id: 'pp' | 'pi' | null) => void;
}

/**
 * Interactive fixture controller producing live-updating `TemplateDataSource` objects for all nine
 * templates (`Topic`, `Claim`, `Event`, `NewsStory`, `Source`, `Post`, `Debate`, `Timeline`,
 * `SourceLibrary`) plus the slide-over `ContextPeekDrawer` state.
 */
export function useGazaFixtureTemplates(): GazaFixtureController {
  const [activeRoute, setActiveRoute] = React.useState<GazaFixtureRoute>({ kind: 'topic' });
  const [activeCommunityId, setActiveCommunityId] = React.useState<string | 'all'>('all');
  const [joinedCommunityId, setJoinedCommunityId] = React.useState<'pp' | 'pi' | null>(null);
  const [votes, setVotes] = React.useState<Record<string, VoteChoice>>({});
  const [noteRatings, setNoteRatings] = React.useState<Record<string, 'helpful' | 'not-helpful' | null>>({});
  const [userNotes, setUserNotes] = React.useState<Record<string, PostContextNoteModel[]>>({});
  const [rankingSuggestions, setRankingSuggestions] = React.useState<Record<string, TopicRankingItemModel[]>>({});
  const [userSources, setUserSources] = React.useState<SourceLibraryItemModel[]>([]);
  const [peekStack, setPeekStack] = React.useState<GazaPeekTarget[]>([]);

  const pushPeek = React.useCallback((target: GazaPeekTarget) => {
    setPeekStack(prev => [...prev.slice(-7), target]);
  }, []);
  const popPeek = React.useCallback(() => {
    setPeekStack(prev => prev.slice(0, -1));
  }, []);
  const closePeek = React.useCallback(() => setPeekStack([]), []);

  const navigate = React.useCallback((route: GazaFixtureRoute) => {
    setPeekStack([]);
    setActiveRoute(route);
  }, []);
  const openTopic = React.useCallback(() => {
    setPeekStack([]);
    setActiveRoute({ kind: 'topic' });
  }, []);
  const openClaim = React.useCallback((id: string) => {
    if (CLAIM_BY_ID[id]) {
      setPeekStack([]);
      setActiveRoute({ kind: 'claim', id });
    }
  }, []);
  const openEvent = React.useCallback((id: string) => {
    if (EVENT_BY_ID[id]) {
      setPeekStack([]);
      setActiveRoute({ kind: 'event', id });
    }
  }, []);
  const openStory = React.useCallback((id: string) => {
    if (STORY_BY_ID[id]) {
      setPeekStack([]);
      setActiveRoute({ kind: 'news-story', id });
    }
  }, []);
  const openSource = React.useCallback((id: string) => {
    if (SOURCE_BY_ID[id]) {
      setPeekStack([]);
      setActiveRoute({ kind: 'source', id });
    }
  }, []);
  const openPost = React.useCallback((id: string) => {
    if (POST_BY_ID[id]) {
      setPeekStack([]);
      setActiveRoute({ kind: 'post', id });
    }
  }, []);
  const openDebate = React.useCallback((id: string) => {
    if (DEBATE_BY_ID[id]) {
      setPeekStack([]);
      setActiveRoute({ kind: 'debate', id });
    }
  }, []);
  const openTimeline = React.useCallback(() => {
    setPeekStack([]);
    setActiveRoute({ kind: 'timeline' });
  }, []);
  const openSources = React.useCallback(() => {
    setPeekStack([]);
    setActiveRoute({ kind: 'sources' });
  }, []);

  const toSourceChips = React.useCallback(
    (ids: readonly string[]) =>
      ids
        .map(id => SOURCE_BY_ID[id])
        .filter((s): s is SeedSource => Boolean(s))
        .map((s, index) => ({
          id: s.id,
          index: index + 1,
          title: `${s.title} (${s.date})`,
          mediaType: s.mediaType,
          onSelect: () => pushPeek({ kind: 'source', id: s.id }),
        })),
    [pushPeek]
  );

  const toRichSourceCard = React.useCallback(
    (s: SeedSource) => ({
      id: s.id,
      kind: 'source' as const,
      kindLabel: s.sourceType,
      title: s.title,
      mediaType: s.mediaType,
      publisher: s.publisher,
      date: s.date,
      excerpt: s.summary,
      quotes: s.quotes,
      duration: s.duration,
      authorHandle: s.authorHandle,
      meta: `${s.publisher} · ${s.date} · ${s.sourceType}`,
      onSelect: () => openSource(s.id),
    }),
    [openSource]
  );

  const toSummary = React.useCallback(
    (claim: SeedClaim): ClaimSummaryModel => {
      const userVote = votes[claim.id] ?? null;
      const eff = computeEffectiveSplit(
        claim.pp,
        claim.pi,
        claim.all,
        claim.npp,
        claim.npi,
        claim.nall,
        userVote,
        joinedCommunityId,
        true
      );
      const matchingDebate = SEED_DEBATES.find(debate => debate.claimId === claim.id);
      return {
        id: claim.id,
        title: claim.title,
        kind: claim.kind,
        split: eff.split,
        overallPercent: eff.overallPercent,
        basisSummary: claim.basisSummary,
        badgeLabel: claim.badgeLabel,
        meta: [`${formatCompactCount(eff.totalVotes)} votes`],
        debateCount: claim.debatesCount > 0 ? claim.debatesCount : undefined,
        onOpenDebates:
          claim.debatesCount > 0
            ? () => (matchingDebate ? openDebate(matchingDebate.id) : openClaim(claim.id))
            : undefined,
        userVote,
        onVote: choice => setVotes(prev => ({ ...prev, [claim.id]: choice })),
        onClearVote: () => setVotes(prev => ({ ...prev, [claim.id]: null })),
        onSelect: () => openClaim(claim.id),
      };
    },
    [joinedCommunityId, openClaim, openDebate, votes]
  );

  const trends: TopicTrendsModel = React.useMemo(
    () => ({
      weekLabels: WEEK_LABELS,
      monthTicks: [
        { weekIndex: 0, label: 'Jan' },
        { weekIndex: 4, label: 'Mar' },
        { weekIndex: 9, label: 'May' },
        { weekIndex: 13, label: 'Jul' },
        { weekIndex: 18, label: 'Sep' },
        { weekIndex: 21, label: 'Nov' },
      ],
      markers: [
        { weekIndex: 1, label: '29 Jan: IDF official accepts ~71,000 killed', onSelect: () => openEvent('e71k') },
        { weekIndex: 14, label: '30 Jul: disarmament deadlock', onSelect: () => openEvent('edis') },
        { weekIndex: 21, label: '26 Oct: UN inquiry follow-up report', onSelect: () => openEvent('ecoi') },
      ],
      coverageThemes: [
        {
          id: 'cf',
          name: 'Ceasefire & strikes',
          color: '#202020',
          weeklyCounts: [16, 18, 12, 10, 8, 11, 16, 15, 14, 15, 12, 14, 12, 14, 22, 14, 13, 10, 12, 10, 15, 16, 24],
        },
        {
          id: 'aid',
          name: 'Aid & famine',
          color: '#3963fe',
          weeklyCounts: [11, 7, 10, 8, 5, 7, 8, 9, 9, 12, 9, 7, 15, 9, 12, 7, 12, 5, 11, 9, 9, 12, 11],
        },
        {
          id: 'law',
          name: 'Courts & UN',
          color: '#6833ff',
          weeklyCounts: [5, 8, 7, 8, 4, 4, 4, 3, 2, 8, 5, 4, 13, 10, 7, 4, 3, 5, 8, 4, 9, 26, 7],
        },
        {
          id: 'pol',
          name: 'Politics & governance',
          color: '#b6b6b6',
          weeklyCounts: [8, 5, 8, 4, 3, 4, 5, 6, 5, 13, 3, 8, 8, 19, 12, 10, 7, 7, 9, 6, 9, 21, 14],
        },
      ],
      agreementSeries: [
        {
          id: 'gen',
          name: 'Genocide',
          color: '#6833ff',
          group: 'split',
          communityAWeekly: [
            92, 91, 93, 90, 92, 91, 93, 94, 93, 92, 94, 93, 95, 94, 93, 93, 94, 93, 92, 94, 93, 94, 93,
          ],
          communityBWeekly: [9, 6, 6, 5, 6, 5, 6, 5, 7, 6, 7, 6, 7, 6, 7, 6, 5, 6, 6, 6, 5, 5, 5],
        },
        {
          id: 'cf',
          name: 'Ceasefire honoured',
          color: '#202020',
          group: 'split',
          communityAWeekly: [11, 9, 7, 8, 6, 5, 6, 4, 4, 6, 5, 6, 5, 5, 5, 6, 5, 4, 4, 5, 6, 5, 4],
          communityBWeekly: [
            82, 77, 75, 78, 76, 71, 74, 75, 73, 68, 71, 67, 70, 68, 66, 63, 64, 66, 64, 65, 63, 62, 61,
          ],
        },
        {
          id: 'k70',
          name: 'More than 70,000 killed',
          color: '#6833ff',
          group: 'common',
          communityAWeekly: [
            99, 99, 99, 99, 99, 99, 98, 99, 99, 98, 98, 99, 98, 99, 99, 98, 98, 99, 99, 99, 99, 98, 99,
          ],
          communityBWeekly: [
            46, 55, 62, 66, 67, 68, 72, 70, 66, 72, 70, 71, 69, 68, 69, 71, 70, 72, 74, 72, 71, 72, 72,
          ],
        },
        {
          id: 'hostages',
          name: 'Every hostage returned',
          color: '#202020',
          group: 'common',
          communityAWeekly: [
            88, 91, 92, 91, 93, 92, 94, 95, 96, 94, 95, 92, 93, 93, 94, 93, 94, 94, 93, 95, 95, 94, 94,
          ],
          communityBWeekly: [
            98, 98, 98, 98, 99, 99, 99, 99, 99, 99, 98, 99, 99, 99, 99, 99, 99, 99, 100, 99, 100, 100, 100,
          ],
        },
      ],
      communityALabel: 'Pro-Palestinian',
      communityAColor: '#6833ff',
      communityBLabel: 'Pro-Israel',
      communityBColor: '#3963fe',
    }),
    [openEvent]
  );

  const rankings = React.useMemo<readonly TopicRankingModel[]>(() => {
    const appendSuggestions = (rankingId: string, base: readonly TopicRankingItemModel[]) => [
      ...base,
      ...(rankingSuggestions[rankingId] ?? []),
    ];

    const addSuggestion = (rankingId: string, title: string) => {
      setRankingSuggestions(prev => ({
        ...prev,
        [rankingId]: [
          ...(prev[rankingId] ?? []),
          {
            id: `sug-${Date.now()}`,
            rank: 0,
            title,
            subtitle: 'Your suggestion · in review until members of both communities rank it',
            rankDelta: 'new',
          },
        ],
      }));
    };

    const bestReads: TopicRankingModel = {
      id: 'read',
      title: 'Best reads',
      subtitle: 'Primary documents and reporting ranked by everyone and by each community.',
      suggestPlaceholder: 'Paste a link or type a source’s title',
      onSuggestItem: value => addSuggestion('read', value),
      itemsByCommunity: {
        all: appendSuggestions('read', [
          {
            id: 'r-icj',
            rank: 1,
            title: SOURCE_BY_ID['s-icj'].title,
            subtitle: 'International Court of Justice · 26 Jan 2024',
            metric: '92% worth reading',
            onSelect: () => openSource('s-icj'),
          },
          {
            id: 'r-unosat',
            rank: 2,
            title: SOURCE_BY_ID['s-unosat'].title,
            subtitle: 'UNOSAT · Jun 2026',
            metric: '89% worth reading',
            onSelect: () => openSource('s-unosat'),
          },
          {
            id: 'r-haaretz',
            rank: 3,
            title: STORY_BY_ID['st-haaretz-71k'].headline,
            subtitle: 'Haaretz · 29 Jan 2026',
            metric: '86% worth reading',
            onSelect: () => openStory('st-haaretz-71k'),
          },
        ]),
        pp: appendSuggestions('read', [
          {
            id: 'r-pp-coi',
            rank: 1,
            title: SOURCE_BY_ID['s-coi'].title,
            subtitle: 'UN Human Rights Council · 16 Sep 2025',
            rankDelta: '▲ 4',
            metric: '97% Pro-Palestinian',
            onSelect: () => openSource('s-coi'),
          },
          {
            id: 'r-pp-ipc',
            rank: 2,
            title: SOURCE_BY_ID['s-ipc'].title,
            subtitle: 'IPC · 22 Aug 2025',
            rankDelta: 'new',
            metric: '95% Pro-Palestinian',
            onSelect: () => openSource('s-ipc'),
          },
          {
            id: 'r-pp-icj',
            rank: 3,
            title: SOURCE_BY_ID['s-icj'].title,
            subtitle: 'International Court of Justice · 26 Jan 2024',
            rankDelta: '▼ 2',
            metric: '91% Pro-Palestinian',
            onSelect: () => openSource('s-icj'),
          },
        ]),
        pi: appendSuggestions('read', [
          {
            id: 'r-pi-il',
            rank: 1,
            title: SOURCE_BY_ID['s-il-icj'].title,
            subtitle: 'Government of Israel · 12 Jan 2024',
            rankDelta: 'new',
            metric: '95% Pro-Israel',
            onSelect: () => openSource('s-il-icj'),
          },
          {
            id: 'r-pi-afp',
            rank: 2,
            title: SOURCE_BY_ID['s-afp'].title,
            subtitle: 'AFP · 2024',
            rankDelta: '▲ 2',
            metric: '94% Pro-Israel',
            onSelect: () => openSource('s-afp'),
          },
        ]),
      },
    };

    const bestDebates: TopicRankingModel = {
      id: 'debates',
      title: 'Best debates',
      subtitle: 'Timed debates pairing one Pro-Palestinian and one Pro-Israel member, ranked by both communities.',
      suggestPlaceholder: 'Paste a link to a debate on Geo',
      onSuggestItem: value => addSuggestion('debates', value),
      itemsByCommunity: {
        all: appendSuggestions(
          'debates',
          ['d-gen', 'd-cf', 'd-civ', 'd-gov'].map((id, index) => {
            const debate = DEBATE_BY_ID[id];
            const claim = CLAIM_BY_ID[debate.claimId];
            return {
              id: debate.id,
              rank: index + 1,
              title: claim.title,
              subtitle: `${debate.ppDebater} vs ${debate.piDebater} · ${debate.duration}`,
              metric: debate.votesLabel,
              onSelect: () => openDebate(debate.id),
            };
          })
        ),
      },
    };

    const bridging: TopicRankingModel = {
      id: 'bridging',
      title: 'Bridging picks',
      subtitle: 'Sources one community recommends that the other community rated fair.',
      itemsByCommunity: {
        all: [
          {
            id: 'b-ipc',
            rank: 1,
            title: SOURCE_BY_ID['s-ipc'].title,
            subtitle: 'IPC · 22 Aug 2025',
            tag: 'Rated fair across communities',
            onSelect: () => openSource('s-ipc'),
          },
          {
            id: 'b-hostages',
            rank: 2,
            title: SOURCE_BY_ID['s-hostages'].title,
            subtitle: 'IDF and AP · Jan 2026',
            tag: 'Rated fair across communities',
            onSelect: () => openSource('s-hostages'),
          },
        ],
      },
    };

    return [bestReads, bestDebates, bridging];
  }, [openDebate, openSource, openStory, rankingSuggestions]);

  const viralPosts: readonly TopicViralPostPreviewModel[] = React.useMemo(
    () =>
      SEED_POSTS.map(post => {
        const extra = userNotes[post.id] ?? [];
        const shown = post.notes.find(n => n.shown);
        const pendingCount = post.notes.filter(n => !n.shown).length + extra.length;
        return {
          id: post.id,
          authorName: post.authorName,
          authorHandle: post.authorHandle,
          platform: post.platform,
          viewsLabel: post.viewsLabel,
          when: post.when,
          body: post.body,
          topNote: shown ? { tag: shown.tag, status: 'shown', text: shown.text } : undefined,
          noteCount: post.notes.length + extra.length,
          needsContext: !shown,
          waitingForRatings: pendingCount > 0,
          onSelect: () => openPost(post.id),
        };
      }),
    [openPost, userNotes]
  );

  const buildClaimModel = React.useCallback(
    (seed: SeedClaim): ClaimTemplateModel => {
      const userVote = votes[seed.id] ?? null;
      const eff = computeEffectiveSplit(
        seed.pp,
        seed.pi,
        seed.all,
        seed.npp,
        seed.npi,
        seed.nall,
        userVote,
        joinedCommunityId,
        true
      );

      const subClaims: SubClaimModel[] | undefined = seed.subClaims?.map(subClaim => {
        const gap = Math.abs(subClaim.pp - subClaim.pi);
        const worldAffairsPct = Math.round((subClaim.pp + subClaim.pi) / 2);
        return {
          id: subClaim.id,
          title: subClaim.title,
          kind: subClaim.kind,
          stance: subClaim.stance,
          stat: subClaim.stat,
          split: {
            isSplit: isClaimSplit(gap),
            gapPoints: gap,
            rows: [
              {
                id: 'world-affairs',
                label: 'World affairs',
                color: '#202020',
                percent: worldAffairsPct,
                isEveryone: true,
              },
              { id: 'pp', label: 'Pro-Palestinian', color: '#6833ff', percent: subClaim.pp, isSubspace: true },
              { id: 'pi', label: 'Pro-Israel', color: '#3963fe', percent: subClaim.pi, isSubspace: true },
            ],
          },
          sources: toSourceChips(subClaim.sourceIds),
        };
      });

      const sections: EntityListSectionModel[] = [];

      if (seed.splitNextIds && seed.splitNextIds.length > 0) {
        sections.push({
          id: 'split-next',
          title: 'Disputed next',
          items: seed.splitNextIds
            .map(id => CLAIM_BY_ID[id])
            .filter((item): item is SeedClaim => Boolean(item))
            .map(item => ({
              id: item.id,
              kind: 'claim',
              kindLabel: 'Claim',
              title: item.title,
              meta: `Pro-Palestinian ${item.pp}% · Pro-Israel ${item.pi}% agree`,
              onSelect: () => openClaim(item.id),
            })),
        });
      }

      if (seed.eventIds.length > 0) {
        sections.push({
          id: 'events',
          title: 'Events',
          items: seed.eventIds
            .map(id => EVENT_BY_ID[id])
            .filter((ev): ev is SeedEvent => Boolean(ev))
            .map(ev => ({
              id: ev.id,
              kind: 'event',
              kindLabel: 'Event',
              title: ev.title,
              meta: `${ev.when} · ${ev.storyIds.length} ${ev.storyIds.length === 1 ? 'news story' : 'news stories'}`,
              onSelect: () => openEvent(ev.id),
            })),
        });
      }

      if (seed.storyIds.length > 0) {
        sections.push({
          id: 'stories',
          title: 'In the news',
          items: seed.storyIds
            .map(id => STORY_BY_ID[id])
            .filter((st): st is SeedStory => Boolean(st))
            .map(st => ({
              id: st.id,
              kind: 'news-story',
              kindLabel: 'News',
              title: st.headline,
              meta: `${st.outlet} · ${st.date}`,
              onSelect: () => openStory(st.id),
            })),
        });
      }

      const claimDebates = SEED_DEBATES.filter(d => d.claimId === seed.id);

      sections.push({
        id: 'sources',
        title: 'Sources',
        layout: 'cards',
        items: seed.sourceIds
          .map(id => SOURCE_BY_ID[id])
          .filter((s): s is SeedSource => Boolean(s))
          .map(toRichSourceCard),
        emptyText: 'No sources linked yet.',
      });

      if (claimDebates.length > 0) {
        sections.push({
          id: 'debates',
          title: claimDebates.length > 1 ? 'Debates on this claim' : 'Debate on this claim',
          items: claimDebates.map(debate => ({
            id: debate.id,
            kind: 'debate',
            kindLabel: 'Debate',
            title: `${debate.ppDebater} vs ${debate.piDebater}`,
            meta: `${debate.date} · ${debate.duration} · ${debate.votesLabel}`,
            onSelect: () => openDebate(debate.id),
          })),
        });
      }

      const relatedActors = SEED_GRAPH_NODES.filter(node => node.claimIds?.includes(seed.id));
      const seededTriples = SEED_ENTITY_CONTEXT[seed.id]?.triples ?? [];
      const hasSeededActors = seededTriples.some(t => /actor/i.test(t.predicate));

      // Keep Context focused on non-sectioned graph triples (avoid duplicating Events & Sources
      // which already render as full structured sections below on the Claim page).
      const graphConnections: GraphConnectionGroupModel[] = [
        ...seededTriples.map(triple => ({
          predicate: triple.predicate,
          items: triple.values.map(val => {
            const matchedActor = SEED_GRAPH_NODES.find(n => n.name.toLowerCase() === val.label.toLowerCase());
            return {
              id: val.id,
              label: val.label,
              kind: 'entity' as const,
              onSelect: matchedActor ? () => pushPeek({ kind: 'entity', id: matchedActor.id }) : undefined,
            };
          }),
        })),
        ...(!hasSeededActors && relatedActors.length > 0
          ? [
              {
                predicate: 'Actors',
                items: relatedActors.map(node => ({
                  id: `actor-${node.id}`,
                  label: node.name,
                  kind: 'entity' as const,
                  onSelect: () => pushPeek({ kind: 'entity', id: node.id }),
                })),
              },
            ]
          : []),
      ];

      return {
        id: seed.id,
        title: seed.title,
        breadcrumbs: [
          { id: 'topic', label: 'Israel–Gaza war', onSelect: openTopic },
          { id: seed.id, label: seed.title },
        ],
        kind: seed.kind,
        split: eff.split,
        debateCount: seed.debatesCount,
        onOpenDebates: claimDebates[0] ? () => openDebate(claimDebates[0].id) : undefined,
        graphConnections: graphConnections.length > 0 ? graphConnections : undefined,
        voteBox: {
          userVote,
          countSummary: `${formatCompactCount(eff.totalVotes)} votes`,
          impactNote: eff.impactNote,
          onVote: choice => setVotes(prev => ({ ...prev, [seed.id]: choice })),
          onClear: () => setVotes(prev => ({ ...prev, [seed.id]: null })),
        },
        agreedBasis: seed.agreedBasis
          ? {
              summary: seed.agreedBasis.summary,
              settlingSources: toSourceChips(seed.agreedBasis.sourceIds),
            }
          : undefined,
        subClaims,
        contextByEntityId: SEED_ENTITY_CONTEXT,
        sections,
      };
    },
    [
      joinedCommunityId,
      openClaim,
      openDebate,
      openEvent,
      openStory,
      openTopic,
      pushPeek,
      toRichSourceCard,
      toSourceChips,
      votes,
    ]
  );

  const claimDetailsById = React.useMemo<Readonly<Record<string, ClaimTemplateModel>>>(
    () => Object.fromEntries(SEED_CLAIMS.map(seed => [seed.id, buildClaimModel(seed)])),
    [buildClaimModel]
  );

  const topicModel: TopicTemplateModel = React.useMemo(() => {
    const order = PIN_ORDER[activeCommunityId] ?? PIN_ORDER.all;
    const toTopicClaimRow = (claim: SeedClaim): ClaimSummaryModel => ({
      ...toSummary(claim),
      onSelect: () => pushPeek({ kind: 'claim', id: claim.id }),
    });
    // One list in the order shown: the community's pinned claims, then the settled ones.
    const claimIds = [...order, ...ACCEPTED_CLAIM_IDS];
    const claims = claimIds.map(id => toTopicClaimRow(CLAIM_BY_ID[id]));

    return {
      id: 'israel-gaza-war',
      title: 'Israel–Gaza war',
      coverUrl: '/images/gaza-topic-cover.svg',
      lede: TOPIC_LEDE_BY_COMMUNITY[activeCommunityId] ?? TOPIC_LEDE_BY_COMMUNITY.all,
      tags: ['Prototype sample data'],
      stats: [
        { label: 'Disputed claims', value: String(order.length) },
        { label: 'Accepted', value: String(ACCEPTED_CLAIM_IDS.length) },
        { label: 'Members in communities', value: (9189 + (joinedCommunityId ? 1 : 0)).toLocaleString('en-US') },
        { label: 'Sources linked', value: String(SEED_SOURCES.length) },
      ],
      communities: GAZA_COMMUNITIES.map(c => ({
        ...c,
        memberCount: (c.memberCount ?? 0) + (joinedCommunityId === c.id ? 1 : 0),
      })),
      activeCommunityId,
      onSelectCommunity: setActiveCommunityId,
      claims,
      claimDetailsById,
      recentDebates: SEED_DEBATES.map(debate => {
        const claim = CLAIM_BY_ID[debate.claimId] ?? SEED_CLAIMS[0];
        return {
          id: debate.id,
          claimId: claim.id,
          claimTitle: claim.title,
          date: debate.date,
          duration: debate.duration,
          votesLabel: debate.votesLabel,
          participants: [
            { name: debate.ppDebater, position: debate.ppPosition, communityColor: '#6833ff' },
            { name: debate.piDebater, position: debate.piPosition, communityColor: '#3963fe' },
          ] as const,
          onSelect: () => openDebate(debate.id),
        };
      }),
      communityCases: [
        {
          community: { ...GAZA_COMMUNITIES[0], memberCount: 4812 + (joinedCommunityId === 'pp' ? 1 : 0) },
          summary: TOPIC_LEDE_BY_COMMUNITY.pp,
          concede:
            'Hamas’s 7 October attack killed civilians and took hostages, and the ICJ has not issued a final merits ruling.',
          sources: toSourceChips(['s-moh', 's-unosat', 's-ipc']),
          isMember: joinedCommunityId === 'pp',
          onToggleMembership: () => setJoinedCommunityId(prev => (prev === 'pp' ? null : 'pp')),
        },
        {
          community: { ...GAZA_COMMUNITIES[1], memberCount: 4377 + (joinedCommunityId === 'pi' ? 1 : 0) },
          summary: TOPIC_LEDE_BY_COMMUNITY.pi,
          concede:
            'Civilian casualties and damage in Gaza have been immense, and aid delivery fell sharply during the 2025 cutoff.',
          sources: toSourceChips(['s-afp', 's-hostages', 's-il-icj']),
          isMember: joinedCommunityId === 'pi',
          onToggleMembership: () => setJoinedCommunityId(prev => (prev === 'pi' ? null : 'pi')),
        },
      ],
      trends,
      timelineHighlights: ['ecoi', 'edis', 'e71k', 'ecf', 'eicc', 'erafah', 'eicj', 'e7oct'].map(id => {
        const ev = EVENT_BY_ID[id];
        return {
          id: ev.id,
          when: ev.when,
          title: ev.title,
          summary: ev.summary,
          onSelect: () => openEvent(ev.id),
        };
      }),
      onOpenTimeline: openTimeline,
      rankings,
      viralPosts,
      onOpenSources: openSources,
      contextByEntityId: SEED_ENTITY_CONTEXT,
      sections: [
        {
          id: 'topic-sources',
          title: 'Sources',
          layout: 'cards',
          items: ['s-il-icj', 's-idf-est', 's-coi', 's-unosat']
            .map(id => SOURCE_BY_ID[id])
            .filter((s): s is SeedSource => Boolean(s))
            .map(toRichSourceCard),
          action: {
            label: `Browse all ${SEED_SOURCES.length} sources`,
            onClick: openSources,
          },
        },
      ],
    };
  }, [
    activeCommunityId,
    claimDetailsById,
    joinedCommunityId,
    openDebate,
    openEvent,
    openSources,
    openTimeline,
    pushPeek,
    rankings,
    toRichSourceCard,
    toSourceChips,
    toSummary,
    trends,
    viralPosts,
  ]);

  const activeClaimId = activeRoute.kind === 'claim' ? activeRoute.id : 'gen';
  const claimModel: ClaimTemplateModel = claimDetailsById[activeClaimId] ?? claimDetailsById.gen;

  const activeEventId = activeRoute.kind === 'event' ? activeRoute.id : 'e71k';
  const eventModel: EventTemplateModel = React.useMemo(() => {
    const idx = Math.max(
      0,
      SEED_EVENTS.findIndex(e => e.id === activeEventId)
    );
    const ev = SEED_EVENTS[idx];
    const prevEv = SEED_EVENTS[idx - 1];
    const nextEv = SEED_EVENTS[idx + 1];

    const sections: EntityListSectionModel[] = [];
    if (ev.storyIds.length > 0) {
      sections.push({
        id: 'coverage',
        title: 'Coverage',
        items: ev.storyIds
          .map(id => STORY_BY_ID[id])
          .filter((st): st is SeedStory => Boolean(st))
          .map(st => ({
            id: st.id,
            kind: 'news-story',
            kindLabel: 'News',
            title: st.headline,
            meta: `${st.outlet} · ${st.date}`,
            onSelect: () => openStory(st.id),
          })),
      });
    }
    sections.push({
      id: 'sources',
      title: 'Sources',
      layout: 'cards',
      items: ev.sourceIds
        .map(id => SOURCE_BY_ID[id])
        .filter((s): s is SeedSource => Boolean(s))
        .map(toRichSourceCard),
    });

    return {
      id: ev.id,
      title: ev.title,
      when: ev.when,
      summary: ev.summary,
      storyCountLabel:
        ev.storyIds.length > 0
          ? `${ev.storyIds.length} ${ev.storyIds.length === 1 ? 'news story' : 'news stories'}`
          : undefined,
      breadcrumbs: [
        { id: 'topic', label: 'Israel–Gaza war', onSelect: openTopic },
        { id: ev.id, label: ev.title },
      ],
      claims: ev.claimIds.map(cid => toSummary(CLAIM_BY_ID[cid])),
      contextByEntityId: SEED_ENTITY_CONTEXT,
      sections,
      previousEvent: prevEv
        ? { id: prevEv.id, title: prevEv.title, when: prevEv.when, onSelect: () => openEvent(prevEv.id) }
        : undefined,
      nextEvent: nextEv
        ? { id: nextEv.id, title: nextEv.title, when: nextEv.when, onSelect: () => openEvent(nextEv.id) }
        : undefined,
    };
  }, [activeEventId, openEvent, openStory, openTopic, toRichSourceCard, toSummary]);

  const activeStoryId = activeRoute.kind === 'news-story' ? activeRoute.id : 'st-haaretz-71k';
  const storyModel: NewsStoryTemplateModel = React.useMemo(() => {
    const st = STORY_BY_ID[activeStoryId] ?? SEED_STORIES[0];
    const ev = EVENT_BY_ID[st.eventId];
    const voteKey = `acc:${st.id}`;
    const userVote = votes[voteKey] ?? null;
    const eff = computeEffectiveSplit(
      st.accPp,
      st.accPi,
      Math.round((st.accPp + st.accPi) / 2),
      840,
      790,
      1920,
      userVote,
      joinedCommunityId,
      true
    );

    return {
      id: st.id,
      headline: st.headline,
      outlet: st.outlet,
      outletInitials: outletInitialsFrom(st.outlet),
      outletColor: outletColorFrom(st.outlet),
      date: st.date,
      summary: st.summary,
      externalUrl: st.url,
      breadcrumbs: [
        { id: 'topic', label: 'Israel–Gaza war', onSelect: openTopic },
        ...(ev ? [{ id: ev.id, label: ev.title, onSelect: () => openEvent(ev.id) }] : []),
        { id: st.id, label: st.outlet },
      ],
      accuracyRating: {
        prompt: 'This is an accurate account of what happened',
        split: eff.split,
        voteBox: {
          userVote,
          countSummary: `${eff.totalVotes.toLocaleString('en-US')} people rated this account`,
          impactNote: eff.impactNote,
          onVote: choice => setVotes(prev => ({ ...prev, [voteKey]: choice })),
          onClear: () => setVotes(prev => ({ ...prev, [voteKey]: null })),
        },
      },
      reportedClaims: [toSummary(CLAIM_BY_ID[st.claimId])],
      contextByEntityId: SEED_ENTITY_CONTEXT,
      sections: [
        ...(ev
          ? [
              {
                id: 'event',
                title: 'Happened during',
                items: [
                  {
                    id: ev.id,
                    kind: 'event' as const,
                    kindLabel: 'Event',
                    title: ev.title,
                    meta: ev.when,
                    onSelect: () => openEvent(ev.id),
                  },
                ],
              },
            ]
          : []),
        {
          id: 'sources',
          title: 'Primary sources',
          layout: 'cards',
          items: st.sourceIds
            .map(id => SOURCE_BY_ID[id])
            .filter((s): s is SeedSource => Boolean(s))
            .map(toRichSourceCard),
        },
      ],
    };
  }, [activeStoryId, joinedCommunityId, openEvent, openTopic, toRichSourceCard, toSummary, votes]);

  const activeSourceId = activeRoute.kind === 'source' ? activeRoute.id : 's-icj';
  const sourceModel: SourceTemplateModel = React.useMemo(() => {
    const src = SOURCE_BY_ID[activeSourceId] ?? SEED_SOURCES[0];
    const supportedClaims = SEED_CLAIMS.filter(c => c.sourceIds.includes(src.id)).map(toSummary);
    const citingEvents = SEED_EVENTS.filter(ev => ev.sourceIds.includes(src.id));
    const citingStories = SEED_STORIES.filter(st => st.sourceIds.includes(src.id));

    const citedByItems = [
      ...citingEvents.map(ev => ({
        id: `ev-${ev.id}`,
        kind: 'event' as const,
        kindLabel: 'Event',
        title: ev.title,
        meta: ev.when,
        onSelect: () => openEvent(ev.id),
      })),
      ...citingStories.map(st => ({
        id: `st-${st.id}`,
        kind: 'news-story' as const,
        kindLabel: 'News',
        title: st.headline,
        meta: `${st.outlet} · ${st.date}`,
        onSelect: () => openStory(st.id),
      })),
    ];

    return {
      id: src.id,
      title: src.title,
      publisher: src.publisher,
      date: src.date,
      sourceType: src.sourceType,
      summary: src.summary,
      quotes: src.quotes,
      externalUrl: src.url,
      tags: src.pickTag ? [src.pickTag] : undefined,
      breadcrumbs: [
        { id: 'topic', label: 'Israel–Gaza war', onSelect: openTopic },
        { id: src.id, label: src.title },
      ],
      metadata: [
        { label: 'Publisher', value: src.publisher },
        { label: 'Date', value: src.date },
        { label: 'Type', value: src.sourceType },
      ],
      supportedClaims,
      contextByEntityId: SEED_ENTITY_CONTEXT,
      sections: citedByItems.length > 0 ? [{ id: 'cited-by', title: 'Cited by', items: citedByItems }] : [],
    };
  }, [activeSourceId, openEvent, openStory, openTopic, toSummary]);

  const activePostId = activeRoute.kind === 'post' ? activeRoute.id : 'p-camps';
  const postModel: PostTemplateModel = React.useMemo(() => {
    const post = POST_BY_ID[activePostId] ?? SEED_POSTS[0];
    const builtNotes: PostContextNoteModel[] = [
      ...post.notes.map(note => {
        const rating = noteRatings[note.id] ?? null;
        return {
          id: note.id,
          tag: note.tag,
          status: note.shown ? ('shown' as const) : ('pending' as const),
          statusLabel: note.shown ? 'Shown to everyone' : 'Needs ratings',
          text: note.text,
          authorLabel: `Written by a ${note.by === 'pp' ? 'Pro-Palestinian' : 'Pro-Israel'} member`,
          authorColor: note.by === 'pp' ? '#6833ff' : '#3963fe',
          sources: toSourceChips(note.sourceIds),
          ratingCountLabel: note.ratingCount,
          helpfulnessSplit: {
            isSplit: false,
            rows: [
              { id: 'pp', label: 'Pro-Palestinian', color: '#6833ff', percent: note.ppHelp, unit: 'helpful' },
              { id: 'pi', label: 'Pro-Israel', color: '#3963fe', percent: note.piHelp, unit: 'helpful' },
            ],
          },
          userRating: rating,
          onRate: (choice: 'helpful' | 'not-helpful') =>
            setNoteRatings(prev => ({ ...prev, [note.id]: prev[note.id] === choice ? null : choice })),
        };
      }),
      ...(userNotes[post.id] ?? []),
    ];

    return {
      id: post.id,
      authorName: post.authorName,
      authorHandle: post.authorHandle,
      platform: post.platform,
      viewsLabel: post.viewsLabel,
      when: post.when,
      body: post.body,
      engagement: post.engagement,
      breadcrumbs: [
        { id: 'topic', label: 'Israel–Gaza war', onSelect: openTopic },
        { id: post.id, label: `${post.authorName} on ${post.platform}` },
      ],
      claims: post.claims.map(c => ({
        claim: toSummary(CLAIM_BY_ID[c.claimId]),
        stanceLabel: c.stanceLabel,
      })),
      notes: builtNotes,
      suggestedEvidence: post.suggestedEvidence,
      bridgingRule:
        'A note shows on the post once most raters in each community find it helpful, so neither community can push one through alone.',
      onAddNote: draft => {
        const pickedEvidenceChips = (draft.selectedEvidenceIds ?? [])
          .map(id => post.suggestedEvidence.find(item => item.id === id))
          .filter((item): item is PostSuggestedEvidenceModel => Boolean(item))
          .map((item, idx) => ({
            id: item.id,
            index: idx + 1,
            title: `${item.title} (${item.meta})`,
            mediaType: item.mediaType,
          }));
        const customChip = draft.sourceUrl
          ? [{ id: 'custom-src', index: pickedEvidenceChips.length + 1, title: draft.sourceUrl, href: draft.sourceUrl }]
          : [];

        const newNote: PostContextNoteModel = {
          id: `mine-${Date.now()}`,
          tag: draft.tag,
          status: 'mine',
          statusLabel: 'Your note · needs ratings',
          text: draft.text,
          authorLabel: joinedCommunityId
            ? `Written by you (${joinedCommunityId === 'pp' ? 'Pro-Palestinian' : 'Pro-Israel'})`
            : 'Written by you (independent)',
          authorColor: joinedCommunityId === 'pp' ? '#6833ff' : joinedCommunityId === 'pi' ? '#3963fe' : '#202020',
          sources: [...pickedEvidenceChips, ...customChip],
          waitReason: 'No ratings yet. It shows on the post once most raters in both communities find it helpful.',
        };
        setUserNotes(prev => ({ ...prev, [post.id]: [...(prev[post.id] ?? []), newNote] }));
      },
      sections:
        post.eventIds.length > 0
          ? [
              {
                id: 'events',
                title: 'Events it’s about',
                items: post.eventIds
                  .map(id => EVENT_BY_ID[id])
                  .filter((ev): ev is SeedEvent => Boolean(ev))
                  .map(ev => ({
                    id: ev.id,
                    kind: 'event',
                    kindLabel: 'Event',
                    title: ev.title,
                    meta: ev.when,
                    onSelect: () => openEvent(ev.id),
                  })),
              },
            ]
          : [],
    };
  }, [activePostId, joinedCommunityId, noteRatings, openEvent, openTopic, toSourceChips, toSummary, userNotes]);

  const activeDebateId = activeRoute.kind === 'debate' ? activeRoute.id : 'd-gen';
  const debateModel: DebateTemplateModel = React.useMemo(() => {
    const debate = DEBATE_BY_ID[activeDebateId] ?? SEED_DEBATES[0];
    const claim = CLAIM_BY_ID[debate.claimId] ?? CLAIM_BY_ID.gen;
    const userVote = votes[claim.id] ?? null;
    const eff = computeEffectiveSplit(
      claim.pp,
      claim.pi,
      claim.all,
      claim.npp,
      claim.npi,
      claim.nall,
      userVote,
      joinedCommunityId,
      true
    );

    const shifts = [
      {
        label: 'World affairs viewers',
        color: '#202020',
        beforePercent: debate.allBeforeAfter[0],
        afterPercent: debate.allBeforeAfter[1],
        deltaPoints: debate.allBeforeAfter[1] - debate.allBeforeAfter[0],
      },
      {
        label: 'Pro-Palestinian viewers',
        color: '#6833ff',
        beforePercent: debate.ppBeforeAfter[0],
        afterPercent: debate.ppBeforeAfter[1],
        deltaPoints: debate.ppBeforeAfter[1] - debate.ppBeforeAfter[0],
      },
      {
        label: 'Pro-Israel viewers',
        color: '#3963fe',
        beforePercent: debate.piBeforeAfter[0],
        afterPercent: debate.piBeforeAfter[1],
        deltaPoints: debate.piBeforeAfter[1] - debate.piBeforeAfter[0],
      },
    ];

    const biggest = [...shifts.slice(1)].sort((a, b) => Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints))[0];
    const shiftVerdict =
      biggest && biggest.deltaPoints !== 0
        ? `Biggest shift: ${biggest.label}, ${Math.abs(biggest.deltaPoints)} pts toward ${biggest.deltaPoints > 0 ? 'Agree' : 'Disagree'}. Counts viewers who voted before and after watching.`
        : 'Neither community’s viewers shifted significantly. Counts viewers who voted before and after watching.';

    const otherDebates = SEED_DEBATES.filter(d => d.id !== debate.id);

    return {
      id: debate.id,
      claimId: claim.id,
      claimTitle: claim.title,
      onOpenClaim: () => openClaim(claim.id),
      date: debate.date,
      duration: debate.duration,
      voteCountLabel: debate.votesLabel,
      summary: `${debate.ppDebater} (Pro-Palestinian) and ${debate.piDebater} (Pro-Israel) debated this claim on camera in timed turns. Viewers voted on the claim before and after.`,
      breadcrumbs: [
        { id: 'topic', label: 'Israel–Gaza war', onSelect: openTopic },
        { id: claim.id, label: claim.title, onSelect: () => openClaim(claim.id) },
        { id: debate.id, label: `${debate.ppDebater} vs ${debate.piDebater}` },
      ],
      participants: [
        {
          name: debate.ppDebater,
          communityLabel: 'Pro-Palestinian member',
          communityColor: '#6833ff',
          positionLabel: `Argued: ${debate.ppPosition}`,
        },
        {
          name: debate.piDebater,
          communityLabel: 'Pro-Israel member',
          communityColor: '#3963fe',
          positionLabel: `Argued: ${debate.piPosition}`,
        },
      ],
      voteBox: {
        userVote,
        countSummary: `${formatCompactCount(eff.totalVotes)} votes`,
        hint: 'Vote on the claim itself. The shift table below counts viewers who voted before and after watching.',
        impactNote: eff.impactNote,
        onVote: choice => setVotes(prev => ({ ...prev, [claim.id]: choice })),
        onClear: () => setVotes(prev => ({ ...prev, [claim.id]: null })),
      },
      shifts,
      shiftVerdict,
      contextByEntityId: SEED_ENTITY_CONTEXT,
      sections:
        otherDebates.length > 0
          ? [
              {
                id: 'more-debates',
                title: 'More debates on this topic',
                items: otherDebates.map(other => {
                  const otherClaim = CLAIM_BY_ID[other.claimId];
                  return {
                    id: other.id,
                    kind: 'debate',
                    kindLabel: 'Debate',
                    title: `${otherClaim.title} (${other.ppDebater} vs ${other.piDebater})`,
                    meta: `${other.date} · ${other.duration} · ${other.votesLabel}`,
                    onSelect: () => openDebate(other.id),
                  };
                }),
              },
            ]
          : [],
    };
  }, [activeDebateId, joinedCommunityId, openClaim, openDebate, openTopic, votes]);

  const timelineModel: TimelineTemplateModel = React.useMemo(
    () => ({
      id: 'gaza-timeline',
      title: 'Israel–Gaza war: Timeline',
      lede: 'Newest first. How far back you start is often the first disagreement, so you choose the era. Where communities tell a turn differently, toggle their framings side by side.',
      breadcrumbs: [
        { id: 'topic', label: 'Israel–Gaza war', onSelect: openTopic },
        { id: 'timeline', label: 'Timeline' },
      ],
      eras: SEED_TIMELINE_ERAS,
      turns: SEED_TIMELINE_TURNS.map(turn => ({
        id: turn.id,
        eraId: turn.eraId,
        when: turn.when,
        title: turn.title,
        why: turn.why,
        isKey: turn.isKey,
        sourceLabel: turn.sourceLabel,
        knownDisputedUnknown: turn.knownDisputedUnknown,
        communityFramings:
          turn.ppFraming && turn.piFraming
            ? [
                {
                  communityId: 'pp',
                  communityName: 'Pro-Palestinian framing',
                  color: '#6833ff',
                  text: turn.ppFraming,
                },
                {
                  communityId: 'pi',
                  communityName: 'Pro-Israel framing',
                  color: '#3963fe',
                  text: turn.piFraming,
                },
              ]
            : undefined,
        claims: turn.claimIds
          ?.map(cid => CLAIM_BY_ID[cid])
          .filter((c): c is SeedClaim => Boolean(c))
          .map(c => ({
            id: c.id,
            title: c.title,
            onSelect: () => openClaim(c.id),
          })),
        onSelect: turn.eventId ? () => openEvent(turn.eventId!) : undefined,
      })),
      keyNumbers: SEED_TIMELINE_NUMBERS,
      onSuggestTurn: () => {},
    }),
    [openClaim, openEvent, openTopic]
  );

  const sourceLibraryModel: SourceLibraryTemplateModel = React.useMemo(() => {
    const baseSources: SourceLibraryItemModel[] = SEED_SOURCES.map(src => {
      const citationCount =
        SEED_CLAIMS.filter(c => c.sourceIds.includes(src.id)).length +
        SEED_EVENTS.filter(ev => ev.sourceIds.includes(src.id)).length +
        SEED_STORIES.filter(st => st.sourceIds.includes(src.id)).length;
      return {
        ...toRichSourceCard(src),
        group: classifySourceLibraryGroup(src.sourceType),
        citationCount,
      };
    });

    const storySources: SourceLibraryItemModel[] = SEED_STORIES.map(story => ({
      id: story.id,
      kind: 'news-story',
      kindLabel: 'News reporting',
      mediaType: 'article',
      title: story.headline,
      publisher: story.outlet,
      date: story.date,
      excerpt: story.summary,
      meta: `${story.outlet} · ${story.date}`,
      group: 'reporting',
      citationCount: 2,
      onSelect: () => openStory(story.id),
    }));

    return {
      id: 'gaza-sources',
      title: 'Sources on the Israel–Gaza war',
      lede: 'Primary documents, court filings, datasets, official statements, and news reporting cited across this topic.',
      totalCountLabel: `${baseSources.length + storySources.length + userSources.length} sources loaded`,
      breadcrumbs: [
        { id: 'topic', label: 'Israel–Gaza war', onSelect: openTopic },
        { id: 'sources', label: 'Source library' },
      ],
      sources: [...baseSources, ...storySources, ...userSources],
      onAddSource: draft => {
        setUserSources(prev => [
          ...prev,
          {
            id: `user-src-${Date.now()}`,
            kind: 'source',
            kindLabel: 'Submitted source',
            mediaType: 'article',
            title: draft.title,
            publisher: 'Community submission',
            date: 'Just added',
            externalUrl: draft.url || undefined,
            group: 'primary',
            citationCount: 1,
          },
        ]);
      },
    };
  }, [openStory, openTopic, toRichSourceCard, userSources]);

  const peekItem = React.useMemo<ContextPeekItemModel | null>(() => {
    const current = peekStack[peekStack.length - 1];
    if (!current) return null;

    if (current.kind === 'source') {
      const src = SOURCE_BY_ID[current.id];
      if (!src) return null;
      const supportedClaims = SEED_CLAIMS.filter(c => c.sourceIds.includes(src.id)).map(toSummary);
      const citingEvents = SEED_EVENTS.filter(ev => ev.sourceIds.includes(src.id));
      return {
        id: src.id,
        kind: 'source',
        kindLabel: src.sourceType,
        title: src.title,
        subtitle: [src.publisher, src.date].filter(Boolean).join(' · '),
        mediaType: src.mediaType,
        tags: src.pickTag ? [src.pickTag] : undefined,
        summary: src.summary,
        quotes: src.quotes,
        metadata: [
          { label: 'Publisher', value: src.publisher },
          { label: 'Date', value: src.date },
          { label: 'Type', value: src.sourceType },
        ],
        externalUrl: src.url,
        externalLabel: 'Open external source',
        claims: supportedClaims,
        relations: citingEvents.map(ev => ({
          id: ev.id,
          predicate: 'Cited by event',
          targetName: ev.title,
          note: ev.when,
          onSelect: () => pushPeek({ kind: 'event', id: ev.id }),
        })),
        flags: SEED_ENTITY_CONTEXT[src.id]?.flags,
        openFullLabel: 'Open full source page',
        onOpenFull: () => openSource(src.id),
      };
    }

    if (current.kind === 'entity') {
      const node = SEED_GRAPH_NODES.find(n => n.id === current.id);
      if (!node) return null;
      const nodeMap = Object.fromEntries(SEED_GRAPH_NODES.map(n => [n.id, n]));
      return {
        id: node.id,
        kind: 'entity',
        kindLabel: node.kind,
        title: node.name,
        tags: node.tags,
        summary: node.summary,
        relations: node.relations
          .filter(rel => Boolean(nodeMap[rel.targetId]))
          .map(rel => ({
            id: rel.targetId,
            predicate: rel.label,
            targetName: nodeMap[rel.targetId].name,
            note: rel.sourceNote,
            onSelect: () => pushPeek({ kind: 'entity', id: rel.targetId }),
          })),
        claims: node.claimIds
          ?.map(cid => CLAIM_BY_ID[cid])
          .filter((c): c is SeedClaim => Boolean(c))
          .map(toSummary),
        openFullLabel: node.eventId ? 'Open related event' : undefined,
        onOpenFull: node.eventId ? () => openEvent(node.eventId!) : undefined,
      };
    }

    if (current.kind === 'event') {
      const ev = EVENT_BY_ID[current.id];
      if (!ev) return null;
      return {
        id: ev.id,
        kind: 'event',
        kindLabel: 'Event',
        title: ev.title,
        subtitle: ev.when,
        summary: ev.summary,
        claims: ev.claimIds.map(cid => toSummary(CLAIM_BY_ID[cid])),
        relations: ev.sourceIds
          .map(id => SOURCE_BY_ID[id])
          .filter((s): s is SeedSource => Boolean(s))
          .map(s => ({
            id: s.id,
            predicate: 'Primary source',
            targetName: s.title,
            note: `${s.publisher} · ${s.date}`,
            onSelect: () => pushPeek({ kind: 'source', id: s.id }),
          })),
        openFullLabel: 'Open full event page',
        onOpenFull: () => openEvent(ev.id),
      };
    }

    if (current.kind === 'news-story') {
      const st = STORY_BY_ID[current.id];
      if (!st) return null;
      return {
        id: st.id,
        kind: 'news-story',
        kindLabel: 'News story',
        title: st.headline,
        subtitle: `${st.outlet} · ${st.date}`,
        mediaType: 'article',
        summary: st.summary,
        externalUrl: st.url,
        externalLabel: `Read on ${st.outlet}`,
        claims: [toSummary(CLAIM_BY_ID[st.claimId])],
        openFullLabel: 'Open full story page',
        onOpenFull: () => openStory(st.id),
      };
    }

    const claimDetail = claimDetailsById[current.id];
    const claim = CLAIM_BY_ID[current.id];
    if (!claim || !claimDetail) return null;

    const relations = (claimDetail.graphConnections ?? []).flatMap(group =>
      group.items.map(entry => ({
        id: entry.id,
        predicate: group.predicate,
        targetName: entry.label,
        onSelect: entry.onSelect,
      }))
    );

    return {
      id: claim.id,
      kind: 'claim',
      kindLabel: 'Claim',
      title: claim.title,
      tags: [formatClaimKindLabel(claimDetail.kind)],
      summary: claimDetail.agreedBasis?.summary,
      settlingSources: claimDetail.agreedBasis?.settlingSources,
      split: claimDetail.split,
      voteBox: claimDetail.voteBox,
      subClaims: claimDetail.subClaims,
      relations: relations.length > 0 ? relations : undefined,
      flags: SEED_ENTITY_CONTEXT[claim.id]?.flags,
      openFullLabel: 'Open full claim page',
      onOpenFull: () => openClaim(claim.id),
    };
  }, [claimDetailsById, openClaim, openEvent, openSource, openStory, peekStack, pushPeek, toSummary]);

  const peekBackLabel = React.useMemo(() => {
    if (peekStack.length < 2) return undefined;
    const prev = peekStack[peekStack.length - 2];
    if (prev.kind === 'source') return SOURCE_BY_ID[prev.id]?.publisher ?? 'source';
    if (prev.kind === 'entity') return SEED_GRAPH_NODES.find(n => n.id === prev.id)?.name;
    if (prev.kind === 'event') return EVENT_BY_ID[prev.id]?.when ?? 'event';
    if (prev.kind === 'news-story') return STORY_BY_ID[prev.id]?.outlet;
    return 'previous';
  }, [peekStack]);

  return {
    activeRoute,
    navigate,
    openTopic,
    openClaim,
    openEvent,
    openStory,
    openSource,
    openPost,
    openDebate,
    openTimeline,
    openSources,
    peekItem,
    canPeekGoBack: peekStack.length > 1,
    peekBackLabel,
    popPeek,
    closePeek,
    topicSource: { data: topicModel, isLoading: false, source: 'fixture' },
    claimSource: { data: claimModel, isLoading: false, source: 'fixture' },
    eventSource: { data: eventModel, isLoading: false, source: 'fixture' },
    storySource: { data: storyModel, isLoading: false, source: 'fixture' },
    sourceSource: { data: sourceModel, isLoading: false, source: 'fixture' },
    postSource: { data: postModel, isLoading: false, source: 'fixture' },
    debateSource: { data: debateModel, isLoading: false, source: 'fixture' },
    timelineSource: { data: timelineModel, isLoading: false, source: 'fixture' },
    sourceLibrarySource: { data: sourceLibraryModel, isLoading: false, source: 'fixture' },
    joinedCommunityId,
    setJoinedCommunityId,
  };
}
