'use client';

import * as React from 'react';

import {
  type ClaimKind,
  type ClaimSummaryModel,
  type ClaimTemplateModel,
  type CommunityDefinition,
  type EntityListSectionModel,
  type EventTemplateModel,
  type NewsStoryTemplateModel,
  type PostContextNoteModel,
  type PostTemplateModel,
  type SourceTemplateModel,
  type SplitBreakdown,
  type StrongestCaseModel,
  type SubClaimFactModel,
  type TemplateDataSource,
  type TopicRankingModel,
  type TopicTemplateModel,
  type TopicTrendsModel,
  type TopicViralPostPreviewModel,
  type VoteChoice,
  computeSplitGap,
  isClaimSplit,
} from '../models';
import { outletColorFrom, outletInitialsFrom } from '../ontology';

/**
 * Full cross-linked Israel–Gaza option-C prototype dataset implementing all six Phase 1–3
 * template view-model contracts (`Topic`, `Claim`, `Event`, `NewsStory`, `Source`, `Post`).
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
  | { kind: 'post'; id: string };

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
  summary: string;
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
    summary:
      'The commission, mandated by the UN Human Rights Council, concluded that Israeli authorities and forces committed four of the five acts defined as genocide in the Genocide Convention. Israel rejected the report and the commission’s mandate.',
    url: 'https://www.ohchr.org',
  },
  {
    id: 's-icj',
    title: 'ICJ order in South Africa v. Israel',
    publisher: 'International Court of Justice',
    date: '26 Jan 2024',
    sourceType: 'Court document',
    summary:
      'The court’s provisional measures order directed Israel to take all measures within its power to prevent acts of genocide and enable humanitarian aid. It did not rule on the merits; a final ruling is expected around 2029.',
    url: 'https://www.icj-cij.org',
  },
  {
    id: 's-il-icj',
    title: 'Israel’s oral arguments at the ICJ',
    publisher: 'Government of Israel',
    date: '12 Jan 2024',
    sourceType: 'Court document',
    summary:
      'Israel’s legal team argued it is fighting Hamas in self-defence rather than targeting the Palestinian people, and asked the court to dismiss South Africa’s application.',
    url: 'https://www.icj-cij.org',
  },
  {
    id: 's-unosat',
    title: 'UNOSAT satellite damage assessment',
    publisher: 'UN Satellite Centre (UNOSAT)',
    date: 'Jun 2026',
    sourceType: 'Report',
    summary:
      'Compares satellite imagery from before the war with mid-2026 and finds about 82% of Gaza’s structures damaged or destroyed. It records physical damage without attributing responsibility.',
    url: 'https://unosat.org',
  },
  {
    id: 's-moh',
    title: 'Gaza Health Ministry casualty reports',
    publisher: 'Gaza Health Ministry',
    date: '15 Nov 2026',
    sourceType: 'Dataset',
    summary:
      'The Hamas-run ministry’s running count of people killed, listed by name, age, and sex without distinguishing combatants: 74,702 by mid-November 2026. An IDF official accepted the January 2026 total of about 71,000.',
  },
  {
    id: 's-hostages',
    title: 'IDF and AP hostage records',
    publisher: 'Israel Defense Forces and AP',
    date: 'Jan 2026',
    sourceType: 'Dataset',
    summary:
      'Records of each of the 251 people taken hostage on 7 October and their outcomes, compiled from IDF announcements and AP reporting. The last remains were returned on 26 January 2026.',
  },
  {
    id: 's-plan',
    title: 'US 20-point plan for Gaza',
    publisher: 'White House',
    date: '29 Sep 2025',
    sourceType: 'Primary document',
    summary:
      'The US framework behind the October 2025 ceasefire: hostages released within 72 hours, phased Israeli withdrawal to agreed lines, Hamas disarmament, and an international stabilisation force.',
  },
  {
    id: 's-afp',
    title: 'AFP 7 October victim tally',
    publisher: 'AFP',
    date: '2024',
    sourceType: 'Dataset',
    summary:
      'Victim-by-victim tally compiled from Israeli official figures putting the 7 October death toll at about 1,200 people, most of them civilians.',
  },
  {
    id: 's-idf-est',
    title: 'IDF estimate of fighters killed in Gaza',
    publisher: 'Israel Defense Forces, via Times of Israel',
    date: 'Oct 2025–Jan 2026',
    sourceType: 'Official statement',
    summary:
      'Military estimate that 24,000–25,000 fighters were killed in Gaza. The IDF has not published a full methodology or named list.',
  },
  {
    id: 's-ipc',
    title: 'IPC Famine Review: Gaza Governorate',
    publisher: 'IPC',
    date: '22 Aug 2025',
    sourceType: 'Report',
    summary:
      'Confirmed famine (Phase 5) in Gaza Governorate following the spring 2025 aid cutoff, before conditions eased in December 2025 under the ceasefire.',
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
    claimIds: ['gen'],
    storyIds: ['st-npr-icj'],
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
    ],
    eventIds: ['e71k'],
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
        pp: 96,
        pi: 58,
        stat: 'Mandated by the UN Human Rights Council; follow-up report published Oct 2026.',
        sourceIds: ['s-coi'],
      },
      {
        id: 'f-icj',
        title: 'No court has yet ruled on whether genocide occurred',
        pp: 71,
        pi: 98,
        stat: 'The ICJ issued provisional measures in Jan 2024; a merits ruling is expected around 2029.',
        sourceIds: ['s-icj'],
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

const PIN_ORDER: Record<string, readonly string[]> = {
  all: ['gen', 'cf', 'civ', 'gov'],
  pp: ['gen', 'civ', 'cf', 'gov'],
  pi: ['gov', 'civ', 'gen', 'cf'],
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
  const userLabel = userVote ? `You: ${userVote === 'agree' ? 'Agree' : 'Disagree'}` : undefined;

  const rows = [
    {
      id: 'pp',
      label: 'Pro-Palestinian',
      color: '#6833ff',
      percent: ppPct,
      voterCount: ppVotes,
      userLabel: ppVoted ? userLabel : undefined,
    },
    {
      id: 'pi',
      label: 'Pro-Israel',
      color: '#3963fe',
      percent: piPct,
      voterCount: piVotes,
      userLabel: piVoted ? userLabel : undefined,
    },
    ...(includeEveryone
      ? [
          {
            id: 'all',
            label: 'Everyone',
            color: '#202020',
            percent: allPct,
            voterCount: totalVotes,
            isEveryone: true,
            userLabel: userVote && !joinedCommunityId ? userLabel : undefined,
          },
        ]
      : []),
  ];

  const gapPoints = computeSplitGap(rows);
  const impactNote = !userVote
    ? undefined
    : joinedCommunityId
      ? `Counted for ${joinedCommunityId === 'pp' ? 'Pro-Palestinian' : 'Pro-Israel'} and Everyone (${totalVotes.toLocaleString('en-US')} votes).`
      : `Counted in Everyone (${totalVotes.toLocaleString('en-US')} votes). Join a community to count in its split.`;

  return {
    split: { rows, gapPoints, isSplit: isClaimSplit(gapPoints), totalVotes },
    overallPercent: Math.round(allPct),
    totalVotes,
    impactNote,
  };
}

export interface GazaFixtureController {
  activeRoute: GazaFixtureRoute;
  navigate: (route: GazaFixtureRoute) => void;
  openTopic: () => void;
  openClaim: (id: string) => void;
  openEvent: (id: string) => void;
  openStory: (id: string) => void;
  openSource: (id: string) => void;
  openPost: (id: string) => void;
  topicSource: TemplateDataSource<TopicTemplateModel>;
  claimSource: TemplateDataSource<ClaimTemplateModel>;
  eventSource: TemplateDataSource<EventTemplateModel>;
  storySource: TemplateDataSource<NewsStoryTemplateModel>;
  sourceSource: TemplateDataSource<SourceTemplateModel>;
  postSource: TemplateDataSource<PostTemplateModel>;
  joinedCommunityId: 'pp' | 'pi' | null;
  setJoinedCommunityId: (id: 'pp' | 'pi' | null) => void;
}

/**
 * Interactive fixture controller producing live-updating `TemplateDataSource` objects for all six
 * templates (`Topic`, `Claim`, `Event`, `NewsStory`, `Source`, `Post`).
 */
export function useGazaFixtureTemplates(): GazaFixtureController {
  const [activeRoute, setActiveRoute] = React.useState<GazaFixtureRoute>({ kind: 'topic' });
  const [activeCommunityId, setActiveCommunityId] = React.useState<string | 'all'>('all');
  const [joinedCommunityId, setJoinedCommunityId] = React.useState<'pp' | 'pi' | null>(null);
  const [votes, setVotes] = React.useState<Record<string, VoteChoice>>({});
  const [noteRatings, setNoteRatings] = React.useState<Record<string, 'helpful' | 'not-helpful' | null>>({});
  const [userNotes, setUserNotes] = React.useState<Record<string, PostContextNoteModel[]>>({});

  const navigate = React.useCallback((route: GazaFixtureRoute) => setActiveRoute(route), []);
  const openTopic = React.useCallback(() => setActiveRoute({ kind: 'topic' }), []);
  const openClaim = React.useCallback((id: string) => {
    if (CLAIM_BY_ID[id]) setActiveRoute({ kind: 'claim', id });
  }, []);
  const openEvent = React.useCallback((id: string) => {
    if (EVENT_BY_ID[id]) setActiveRoute({ kind: 'event', id });
  }, []);
  const openStory = React.useCallback((id: string) => {
    if (STORY_BY_ID[id]) setActiveRoute({ kind: 'news-story', id });
  }, []);
  const openSource = React.useCallback((id: string) => {
    if (SOURCE_BY_ID[id]) setActiveRoute({ kind: 'source', id });
  }, []);
  const openPost = React.useCallback((id: string) => {
    if (POST_BY_ID[id]) setActiveRoute({ kind: 'post', id });
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
          onSelect: () => openSource(s.id),
        })),
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
        false
      );
      return {
        id: claim.id,
        title: claim.title,
        kind: claim.kind,
        split: eff.split,
        overallPercent: eff.overallPercent,
        basisSummary: claim.basisSummary,
        badgeLabel: claim.badgeLabel,
        meta: [
          `${eff.totalVotes.toLocaleString('en-US')} votes`,
          ...(claim.debatesCount > 0 ? [`${claim.debatesCount} debates`] : []),
        ],
        userVote,
        onSelect: () => openClaim(claim.id),
      };
    },
    [joinedCommunityId, openClaim, votes]
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
          color: '#fe31c5',
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
          color: '#202020',
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
    const bestReads: TopicRankingModel = {
      id: 'read',
      title: 'Best reads',
      subtitle: 'Primary documents and reporting ranked by everyone and by each community.',
      itemsByCommunity: {
        all: [
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
        ],
        pp: [
          {
            id: 'r-pp-coi',
            rank: 1,
            title: SOURCE_BY_ID['s-coi'].title,
            subtitle: 'UN Human Rights Council · 16 Sep 2025',
            metric: '97% Pro-Palestinian',
            onSelect: () => openSource('s-coi'),
          },
          {
            id: 'r-pp-ipc',
            rank: 2,
            title: SOURCE_BY_ID['s-ipc'].title,
            subtitle: 'IPC · 22 Aug 2025',
            metric: '95% Pro-Palestinian',
            onSelect: () => openSource('s-ipc'),
          },
        ],
        pi: [
          {
            id: 'r-pi-il',
            rank: 1,
            title: SOURCE_BY_ID['s-il-icj'].title,
            subtitle: 'Government of Israel · 12 Jan 2024',
            metric: '95% Pro-Israel',
            onSelect: () => openSource('s-il-icj'),
          },
          {
            id: 'r-pi-afp',
            rank: 2,
            title: SOURCE_BY_ID['s-afp'].title,
            subtitle: 'AFP · 2024',
            metric: '94% Pro-Israel',
            onSelect: () => openSource('s-afp'),
          },
        ],
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
    return [bestReads, bridging];
  }, [openSource, openStory]);

  const viralPosts: readonly TopicViralPostPreviewModel[] = React.useMemo(
    () =>
      SEED_POSTS.map(post => {
        const extra = userNotes[post.id] ?? [];
        const shown = post.notes.find(n => n.shown);
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
          onSelect: () => openPost(post.id),
        };
      }),
    [openPost, userNotes]
  );

  const topicModel: TopicTemplateModel = React.useMemo(() => {
    const order = PIN_ORDER[activeCommunityId] ?? PIN_ORDER.all;
    const contestedClaims = order.map(id => toSummary(CLAIM_BY_ID[id]));
    const agreedClaims = ['hostages', 'build', 'oct7', 'k70'].map(id => toSummary(CLAIM_BY_ID[id]));

    return {
      id: 'israel-gaza-war',
      title: 'Israel–Gaza war',
      lede: TOPIC_LEDE_BY_COMMUNITY[activeCommunityId] ?? TOPIC_LEDE_BY_COMMUNITY.all,
      tags: ['Prototype sample data'],
      stats: [
        { label: 'Contested claims', value: String(contestedClaims.length) },
        { label: 'Common ground', value: String(agreedClaims.length) },
        { label: 'Members in communities', value: (9189 + (joinedCommunityId ? 1 : 0)).toLocaleString('en-US') },
        { label: 'Sources linked', value: String(SEED_SOURCES.length) },
      ],
      communities: GAZA_COMMUNITIES.map(c => ({
        ...c,
        memberCount: (c.memberCount ?? 0) + (joinedCommunityId === c.id ? 1 : 0),
      })),
      activeCommunityId,
      onSelectCommunity: setActiveCommunityId,
      contestedClaims,
      agreedClaims,
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
      timelineHighlights: ['e71k', 'ecf', 'eicj', 'e7oct'].map(id => {
        const ev = EVENT_BY_ID[id];
        return {
          id: ev.id,
          when: ev.when,
          title: ev.title,
          claims: ev.claimIds.map(cid => toSummary(CLAIM_BY_ID[cid])),
          onSelect: () => openEvent(ev.id),
        };
      }),
      rankings,
      viralPosts,
    };
  }, [activeCommunityId, joinedCommunityId, openEvent, rankings, toSourceChips, toSummary, trends, viralPosts]);

  const activeClaimId = activeRoute.kind === 'claim' ? activeRoute.id : 'gen';
  const claimModel: ClaimTemplateModel = React.useMemo(() => {
    const seed = CLAIM_BY_ID[activeClaimId] ?? CLAIM_BY_ID.gen;
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

    const subClaims: SubClaimFactModel[] | undefined = seed.subClaims?.map(fact => {
      const gap = Math.abs(fact.pp - fact.pi);
      return {
        id: fact.id,
        title: fact.title,
        stat: fact.stat,
        split: {
          isSplit: isClaimSplit(gap),
          gapPoints: gap,
          rows: [
            { id: 'pp', label: 'Pro-Palestinian', color: '#6833ff', percent: fact.pp },
            { id: 'pi', label: 'Pro-Israel', color: '#3963fe', percent: fact.pi },
          ],
        },
        sources: toSourceChips(fact.sourceIds),
      };
    });

    const strongestCases: StrongestCaseModel[] | undefined = seed.cases?.map(item => ({
      id: `${seed.id}-${item.communityId}`,
      communityId: item.communityId,
      title: item.title,
      accentColor: item.communityId === 'pp' ? '#6833ff' : '#3963fe',
      points: item.points,
      concede: item.concede,
      sources: toSourceChips(item.sourceIds),
    }));

    const sections: EntityListSectionModel[] = [];

    if (seed.splitNextIds && seed.splitNextIds.length > 0) {
      sections.push({
        id: 'split-next',
        title: 'Where they split next',
        items: seed.splitNextIds
          .map(id => CLAIM_BY_ID[id])
          .filter((item): item is SeedClaim => Boolean(item))
          .map(item => ({
            id: item.id,
            kind: 'claim',
            kindLabel: 'Contested claim',
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

    sections.push({
      id: 'sources',
      title: 'Sources',
      items: seed.sourceIds
        .map(id => SOURCE_BY_ID[id])
        .filter((s): s is SeedSource => Boolean(s))
        .map(s => ({
          id: s.id,
          kind: 'source',
          kindLabel: 'Source',
          title: s.title,
          meta: `${s.publisher} · ${s.date} · ${s.sourceType}`,
          onSelect: () => openSource(s.id),
        })),
      emptyText: 'No sources linked yet.',
    });

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
      voteBox: {
        userVote,
        countSummary: `${eff.totalVotes.toLocaleString('en-US')} votes in all · ${(seed.npp + seed.npi).toLocaleString('en-US')} from community members`,
        hint: joinedCommunityId
          ? `Your vote counts in Everyone and in the ${joinedCommunityId === 'pp' ? 'Pro-Palestinian' : 'Pro-Israel'} split.`
          : 'You haven’t joined a community, so your vote counts in Everyone only.',
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
      strongestCases,
      sections,
    };
  }, [activeClaimId, joinedCommunityId, openClaim, openEvent, openSource, openStory, openTopic, toSourceChips, votes]);

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
      items: ev.sourceIds
        .map(id => SOURCE_BY_ID[id])
        .filter((s): s is SeedSource => Boolean(s))
        .map(s => ({
          id: s.id,
          kind: 'source',
          kindLabel: 'Source',
          title: s.title,
          meta: `${s.publisher} · ${s.date} · ${s.sourceType}`,
          onSelect: () => openSource(s.id),
        })),
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
      sections,
      previousEvent: prevEv
        ? { id: prevEv.id, title: prevEv.title, when: prevEv.when, onSelect: () => openEvent(prevEv.id) }
        : undefined,
      nextEvent: nextEv
        ? { id: nextEv.id, title: nextEv.title, when: nextEv.when, onSelect: () => openEvent(nextEv.id) }
        : undefined,
    };
  }, [activeEventId, openEvent, openSource, openStory, openTopic, toSummary]);

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
          items: st.sourceIds
            .map(id => SOURCE_BY_ID[id])
            .filter((s): s is SeedSource => Boolean(s))
            .map(s => ({
              id: s.id,
              kind: 'source' as const,
              kindLabel: 'Source',
              title: s.title,
              meta: `${s.publisher} · ${s.date}`,
              onSelect: () => openSource(s.id),
            })),
        },
      ],
    };
  }, [activeStoryId, joinedCommunityId, openEvent, openSource, openTopic, toSummary, votes]);

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
      bridgingRule:
        'A note shows on the post once most raters in each community find it helpful, so neither community can push one through alone.',
      onAddNote: draft => {
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
          sources: draft.sourceUrl
            ? [{ id: 'custom-src', index: 1, title: draft.sourceUrl, href: draft.sourceUrl }]
            : [],
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

  return {
    activeRoute,
    navigate,
    openTopic,
    openClaim,
    openEvent,
    openStory,
    openSource,
    openPost,
    topicSource: { data: topicModel, isLoading: false, source: 'fixture' },
    claimSource: { data: claimModel, isLoading: false, source: 'fixture' },
    eventSource: { data: eventModel, isLoading: false, source: 'fixture' },
    storySource: { data: storyModel, isLoading: false, source: 'fixture' },
    sourceSource: { data: sourceModel, isLoading: false, source: 'fixture' },
    postSource: { data: postModel, isLoading: false, source: 'fixture' },
    joinedCommunityId,
    setJoinedCommunityId,
  };
}
