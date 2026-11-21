'use client';

import * as React from 'react';

import {
  type ClaimKind,
  type ClaimSummaryModel,
  type ClaimTemplateModel,
  type CommunityDefinition,
  type EntityListSectionModel,
  type SplitBreakdown,
  type StrongestCaseModel,
  type SubClaimFactModel,
  type TemplateDataSource,
  type TopicTemplateModel,
  type VoteChoice,
  computeSplitGap,
  isClaimSplit,
} from '../models';

/**
 * Seeded Israel–Gaza option-C prototype dataset implementing the exact Topic & Claim view-model
 * contracts. Used by `/dev/templates` (and tests) to iterate on templates without backend coupling.
 */

export const GAZA_COMMUNITIES: readonly CommunityDefinition[] = [
  { id: 'pp', name: 'Pro-Palestinian', shortName: 'Pro-Palestinian', color: '#e07a1f', memberCount: 4812 },
  { id: 'pi', name: 'Pro-Israel', shortName: 'Pro-Israel', color: '#1f8fa3', memberCount: 4377 },
];

const TOPIC_LEDE_BY_COMMUNITY: Record<string, string> = {
  all: 'A Hamas-led attack on 7 October 2023 killed about 1,200 people in Israel and took 251 hostages. Israel’s war in Gaza has since killed more than 70,000 Palestinians, by the Gaza Health Ministry’s count; in January 2026 an Israeli military official accepted the total as it stood then, about 71,000. A ceasefire has held in name since October 2025: every hostage is home, but strikes continue, Israel holds more than half of Gaza, and Hamas hasn’t disarmed.',
  pp: 'As the Pro-Palestinian community puts it: Israel has killed more than 70,000 Palestinians, most of them women, children and older people, destroyed 82% of Gaza’s buildings and, by cutting off aid, caused famine. A UN commission found genocide and says it continued after the ceasefire, while Israel’s zone inside Gaza keeps growing.',
  pi: 'As the Pro-Israel community puts it: Hamas started this war with the worst massacre of Jews since the Holocaust and held hostages for over two years. It fought from hospitals, schools and tunnels, which is why so many civilians died. Every hostage is now home, and Israel won’t leave Gaza until Hamas gives up its weapons.',
};

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
  agreedBasis?: { summary: string; sources: readonly { id: string; title: string }[] };
  splitNextIds?: readonly string[];
  subClaims?: readonly {
    id: string;
    title: string;
    pp: number;
    pi: number;
    stat: string;
    sources: readonly string[];
  }[];
  cases?: readonly {
    communityId: 'pp' | 'pi';
    title: string;
    points: readonly string[];
    concede: string;
    sources: readonly string[];
  }[];
  sources: readonly { id: string; title: string; meta: string }[];
  events: readonly { id: string; title: string; meta: string }[];
  stories: readonly { id: string; title: string; meta: string }[];
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
        sources: ['UN Commission of Inquiry report (Sep 2025)', 'UN Commission of Inquiry report (Oct 2026)'],
      },
      {
        id: 'f-icj',
        title: 'No court has yet ruled on whether genocide occurred',
        pp: 71,
        pi: 98,
        stat: 'The ICJ issued provisional measures in Jan 2024; a merits ruling is expected around 2029.',
        sources: ['ICJ order in South Africa v. Israel (26 Jan 2024)'],
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
        sources: ['UN Commission of Inquiry report', 'UNOSAT satellite damage assessment', 'IPC Famine Review'],
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
        sources: [
          'Israel’s oral arguments at the ICJ',
          'IDF evacuation orders and warnings',
          'COGAT daily aid crossing figures',
        ],
      },
    ],
    sources: [
      {
        id: 's-coi',
        title: 'UN Commission of Inquiry: legal analysis of Israel’s conduct in Gaza',
        meta: 'UN Human Rights Council · 16 Sep 2025 · Report',
      },
      {
        id: 's-icj',
        title: 'ICJ order in South Africa v. Israel',
        meta: 'International Court of Justice · 26 Jan 2024 · Court document',
      },
      {
        id: 's-il-icj',
        title: 'Israel’s oral arguments at the ICJ',
        meta: 'Government of Israel · 12 Jan 2024 · Court document',
      },
    ],
    events: [
      { id: 'eicj', title: 'ICJ orders Israel to prevent genocidal acts', meta: '26 Jan 2024 · 2 news stories' },
      {
        id: 'ecoi',
        title: 'UN inquiry says genocidal acts continued after the ceasefire',
        meta: '26 Oct 2026 · 2 news stories',
      },
    ],
    stories: [
      {
        id: 'ecoi-a',
        title: 'UN commission finds Israel continued Gaza genocide after truce',
        meta: 'ABC News (Australia) · 27 Oct 2026',
      },
      {
        id: 'ecoi-b',
        title: 'Israel rejects UN inquiry report as a “propaganda document”',
        meta: 'Times of Israel · Oct 2026',
      },
    ],
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
    sources: [
      { id: 's-plan', title: 'US 20-point plan for Gaza', meta: 'White House · 29 Sep 2025 · Primary document' },
      {
        id: 's-moh',
        title: 'Gaza Health Ministry casualty reports',
        meta: 'Gaza Health Ministry · 15 Nov 2026 · Dataset',
      },
    ],
    events: [{ id: 'ecf', title: 'Ceasefire; all living hostages freed', meta: '10–13 Oct 2025 · 2 news stories' }],
    stories: [
      {
        id: 'ecf-b',
        title: 'Ceasefire takes effect as troops pull back to the Yellow Line',
        meta: 'Times of Israel · 10 Oct 2025',
      },
    ],
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
    sources: [
      {
        id: 's-moh',
        title: 'Gaza Health Ministry casualty reports',
        meta: 'Gaza Health Ministry · 15 Nov 2026 · Dataset',
      },
      {
        id: 's-idf-est',
        title: 'IDF estimate of fighters killed in Gaza',
        meta: 'Israel Defense Forces, via Times of Israel · Oct 2025–Jan 2026',
      },
      {
        id: 's-leaked',
        title: 'Leaked IDF database of named fighters',
        meta: 'The Guardian, +972 Magazine, Local Call · Aug 2025',
      },
    ],
    events: [
      {
        id: 'e71k',
        title: 'An Israeli military official accepts about 71,000 killed',
        meta: '29 Jan 2026 · 2 news stories',
      },
    ],
    stories: [
      {
        id: 'e71k-a',
        title: 'IDF accepts Gaza Health Ministry estimate of over 70,000 Palestinians killed',
        meta: 'Haaretz · 29 Jan 2026',
      },
    ],
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
    sources: [
      { id: 's-plan', title: 'US 20-point plan for Gaza', meta: 'White House · 29 Sep 2025 · Primary document' },
    ],
    events: [
      {
        id: 'edis',
        title: 'Disarmament deadlock: phased handover vs disarm first',
        meta: '30 Jul 2026 · 2 news stories',
      },
    ],
    stories: [
      {
        id: 'edis-a',
        title: 'US says Hamas accepted a phased disarmament plan; Israel says it never agreed',
        meta: 'CNN · 31 Jul 2026',
      },
    ],
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
      sources: [{ id: 's-hostages', title: 'IDF and AP hostage records (Jan 2026)' }],
    },
    splitNextIds: ['cf', 'gov'],
    sources: [
      {
        id: 's-hostages',
        title: 'IDF and AP hostage records',
        meta: 'Israel Defense Forces and AP · Jan 2026 · Dataset',
      },
    ],
    events: [{ id: 'ecf', title: 'Ceasefire; all living hostages freed', meta: '10–13 Oct 2025 · 2 news stories' }],
    stories: [],
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
      sources: [{ id: 's-unosat', title: 'UNOSAT satellite damage assessment (Jun 2026)' }],
    },
    splitNextIds: ['gen', 'civ'],
    sources: [
      {
        id: 's-unosat',
        title: 'UNOSAT satellite damage assessment',
        meta: 'UN Satellite Centre (UNOSAT) · Jun 2026 · Report',
      },
    ],
    events: [{ id: 'ewar', title: 'The war: Gaza’s homes and population', meta: 'Oct 2023 → · 2 news stories' }],
    stories: [],
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
      sources: [
        { id: 's-afp', title: 'AFP 7 October victim tally' },
        { id: 's-il-toll', title: 'Israel revises its 7 October death toll to about 1,200' },
      ],
    },
    splitNextIds: ['gen', 'gov'],
    sources: [
      { id: 's-afp', title: 'AFP 7 October victim tally', meta: 'AFP · 2024 · Dataset' },
      {
        id: 's-il-toll',
        title: 'Israel revises its 7 October death toll to about 1,200',
        meta: 'Israel Ministry of Foreign Affairs · 10 Nov 2023',
      },
    ],
    events: [{ id: 'e7oct', title: 'Hamas-led attack on Israel', meta: '7 Oct 2023 · 2 news stories' }],
    stories: [],
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
      sources: [
        { id: 's-moh', title: 'Gaza Health Ministry casualty reports (Nov 2026)' },
        { id: 's-haaretz', title: 'IDF official accepts ~71,000 killed (Haaretz, 29 Jan 2026)' },
      ],
    },
    splitNextIds: ['civ', 'gen'],
    sources: [
      {
        id: 's-moh',
        title: 'Gaza Health Ministry casualty reports',
        meta: 'Gaza Health Ministry · 15 Nov 2026 · Dataset',
      },
    ],
    events: [
      {
        id: 'e71k',
        title: 'An Israeli military official accepts about 71,000 killed',
        meta: '29 Jan 2026 · 2 news stories',
      },
    ],
    stories: [],
  },
];

const SEED_BY_ID: Readonly<Record<string, SeedClaim>> = Object.fromEntries(SEED_CLAIMS.map(c => [c.id, c]));

const PIN_ORDER: Record<string, readonly string[]> = {
  all: ['gen', 'cf', 'civ', 'gov'],
  pp: ['gen', 'civ', 'cf', 'gov'],
  pi: ['gov', 'civ', 'gen', 'cf'],
};

function computeEffectiveSplit(
  claim: SeedClaim,
  userVote: VoteChoice,
  joinedCommunityId: 'pp' | 'pi' | null,
  includeEveryone: boolean
): { split: SplitBreakdown; overallPercent: number; totalVotes: number; impactNote?: string } {
  const agreedNum = userVote === 'agree' ? 1 : 0;
  const ppVoted = userVote && joinedCommunityId === 'pp';
  const piVoted = userVote && joinedCommunityId === 'pi';

  const ppVotes = claim.npp + (ppVoted ? 1 : 0);
  const piVotes = claim.npi + (piVoted ? 1 : 0);
  const ppPct = ppVoted ? ((claim.pp * claim.npp) / 100 + agreedNum) / (ppVotes / 100) : claim.pp;
  const piPct = piVoted ? ((claim.pi * claim.npi) / 100 + agreedNum) / (piVotes / 100) : claim.pi;

  const totalVotes = claim.nall + (userVote ? 1 : 0);
  const allPct = userVote ? ((claim.all * claim.nall) / 100 + agreedNum) / (totalVotes / 100) : claim.all;
  const userLabel = userVote ? `You: ${userVote === 'agree' ? 'Agree' : 'Disagree'}` : undefined;

  const rows = [
    {
      id: 'pp',
      label: 'Pro-Palestinian',
      color: '#e07a1f',
      percent: ppPct,
      voterCount: ppVotes,
      userLabel: ppVoted ? userLabel : undefined,
    },
    {
      id: 'pi',
      label: 'Pro-Israel',
      color: '#1f8fa3',
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
  activeRoute: { kind: 'topic' } | { kind: 'claim'; id: string };
  openTopic: () => void;
  openClaim: (id: string) => void;
  topicSource: TemplateDataSource<TopicTemplateModel>;
  claimSource: TemplateDataSource<ClaimTemplateModel>;
  joinedCommunityId: 'pp' | 'pi' | null;
  setJoinedCommunityId: (id: 'pp' | 'pi' | null) => void;
}

/**
 * Interactive fixture controller producing live-updating `TemplateDataSource` objects for
 * `TopicTemplate` and `ClaimTemplate`.
 */
export function useGazaFixtureTemplates(): GazaFixtureController {
  const [activeRoute, setActiveRoute] = React.useState<{ kind: 'topic' } | { kind: 'claim'; id: string }>({
    kind: 'topic',
  });
  const [activeCommunityId, setActiveCommunityId] = React.useState<string | 'all'>('all');
  const [joinedCommunityId, setJoinedCommunityId] = React.useState<'pp' | 'pi' | null>(null);
  const [votes, setVotes] = React.useState<Record<string, VoteChoice>>({});

  const openTopic = React.useCallback(() => setActiveRoute({ kind: 'topic' }), []);
  const openClaim = React.useCallback((id: string) => {
    if (SEED_BY_ID[id]) setActiveRoute({ kind: 'claim', id });
  }, []);

  const toSummary = React.useCallback(
    (claim: SeedClaim): ClaimSummaryModel => {
      const userVote = votes[claim.id] ?? null;
      const eff = computeEffectiveSplit(claim, userVote, joinedCommunityId, false);
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

  const topicModel: TopicTemplateModel = React.useMemo(() => {
    const order = PIN_ORDER[activeCommunityId] ?? PIN_ORDER.all;
    const contestedClaims = order.map(id => toSummary(SEED_BY_ID[id]));
    const agreedClaims = ['hostages', 'build', 'oct7', 'k70'].map(id => toSummary(SEED_BY_ID[id]));

    return {
      id: 'israel-gaza-war',
      title: 'Israel–Gaza war',
      lede: TOPIC_LEDE_BY_COMMUNITY[activeCommunityId] ?? TOPIC_LEDE_BY_COMMUNITY.all,
      tags: ['Prototype sample data'],
      stats: [
        { label: 'Contested claims', value: String(contestedClaims.length) },
        { label: 'Common ground', value: String(agreedClaims.length) },
        { label: 'Members in communities', value: (9189 + (joinedCommunityId ? 1 : 0)).toLocaleString('en-US') },
        { label: 'Sources linked', value: '69' },
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
          sources: [
            { id: 'c-moh', index: 1, title: 'Gaza Health Ministry · Nov 2026' },
            { id: 'c-unosat', index: 2, title: 'UNOSAT damage survey · Jun 2026' },
            { id: 'c-ipc', index: 3, title: 'IPC Famine Review · Aug 2025' },
          ],
          isMember: joinedCommunityId === 'pp',
          onToggleMembership: () => setJoinedCommunityId(prev => (prev === 'pp' ? null : 'pp')),
        },
        {
          community: { ...GAZA_COMMUNITIES[1], memberCount: 4377 + (joinedCommunityId === 'pi' ? 1 : 0) },
          summary: TOPIC_LEDE_BY_COMMUNITY.pi,
          concede:
            'Civilian casualties and damage in Gaza have been immense, and aid delivery fell sharply during the 2025 cutoff.',
          sources: [
            { id: 'c-afp', index: 1, title: 'AFP 7 October victim tally' },
            { id: 'c-hos', index: 2, title: 'IDF and AP hostage records · Jan 2026' },
            { id: 'c-cogat', index: 3, title: 'COGAT aid data · 2026' },
          ],
          isMember: joinedCommunityId === 'pi',
          onToggleMembership: () => setJoinedCommunityId(prev => (prev === 'pi' ? null : 'pi')),
        },
      ],
      timelineHighlights: [
        {
          id: 'e71k',
          when: '29 Jan 2026',
          title: 'An Israeli military official accepts about 71,000 killed',
          claims: [toSummary(SEED_BY_ID.k70), toSummary(SEED_BY_ID.civ)],
        },
        {
          id: 'ecf',
          when: '10–13 Oct 2025',
          title: 'Ceasefire; all living hostages freed',
          claims: [toSummary(SEED_BY_ID.hostages), toSummary(SEED_BY_ID.cf)],
        },
      ],
    };
  }, [activeCommunityId, joinedCommunityId, toSummary]);

  const activeClaimId = activeRoute.kind === 'claim' ? activeRoute.id : 'gen';
  const claimModel: ClaimTemplateModel = React.useMemo(() => {
    const seed = SEED_BY_ID[activeClaimId] ?? SEED_BY_ID.gen;
    const userVote = votes[seed.id] ?? null;
    const eff = computeEffectiveSplit(seed, userVote, joinedCommunityId, true);

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
            { id: 'pp', label: 'Pro-Palestinian', color: '#e07a1f', percent: fact.pp },
            { id: 'pi', label: 'Pro-Israel', color: '#1f8fa3', percent: fact.pi },
          ],
        },
        sources: fact.sources.map((title, index) => ({ id: `${fact.id}-s-${index}`, index: index + 1, title })),
      };
    });

    const strongestCases: StrongestCaseModel[] | undefined = seed.cases?.map(item => ({
      id: `${seed.id}-${item.communityId}`,
      communityId: item.communityId,
      title: item.title,
      accentColor: item.communityId === 'pp' ? '#e07a1f' : '#1f8fa3',
      points: item.points,
      concede: item.concede,
      sources: item.sources.map((title, index) => ({
        id: `${seed.id}-${item.communityId}-${index}`,
        index: index + 1,
        title,
      })),
    }));

    const sections: EntityListSectionModel[] = [];

    if (seed.splitNextIds && seed.splitNextIds.length > 0) {
      sections.push({
        id: 'split-next',
        title: 'Where they split next',
        items: seed.splitNextIds
          .map(id => SEED_BY_ID[id])
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

    if (seed.events.length > 0) {
      sections.push({
        id: 'events',
        title: 'Events',
        items: seed.events.map(ev => ({
          id: ev.id,
          kind: 'event',
          kindLabel: 'Event',
          title: ev.title,
          meta: ev.meta,
        })),
      });
    }

    if (seed.stories.length > 0) {
      sections.push({
        id: 'stories',
        title: 'In the news',
        items: seed.stories.map(st => ({
          id: st.id,
          kind: 'news-story',
          kindLabel: 'News',
          title: st.title,
          meta: st.meta,
        })),
      });
    }

    sections.push({
      id: 'sources',
      title: 'Sources',
      items: seed.sources.map(src => ({
        id: src.id,
        kind: 'source',
        kindLabel: 'Source',
        title: src.title,
        meta: src.meta,
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
            settlingSources: seed.agreedBasis.sources.map((src, index) => ({
              id: src.id,
              index: index + 1,
              title: src.title,
            })),
          }
        : undefined,
      subClaims,
      strongestCases,
      sections,
    };
  }, [activeClaimId, joinedCommunityId, openClaim, openTopic, votes]);

  return {
    activeRoute,
    openTopic,
    openClaim,
    topicSource: { data: topicModel, isLoading: false, source: 'fixture' },
    claimSource: { data: claimModel, isLoading: false, source: 'fixture' },
    joinedCommunityId,
    setJoinedCommunityId,
  };
}
