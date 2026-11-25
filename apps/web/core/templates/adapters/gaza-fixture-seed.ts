import type { SourceLibraryGroup, TimelineEraModel } from '../models';

export interface SeedDebate {
  id: string;
  claimId: string;
  date: string;
  duration: string;
  votesLabel: string;
  ppDebater: string;
  piDebater: string;
  ppPosition: 'Agree' | 'Disagree';
  piPosition: 'Agree' | 'Disagree';
  ppBeforeAfter: readonly [number, number];
  piBeforeAfter: readonly [number, number];
  allBeforeAfter: readonly [number, number];
}

export const SEED_DEBATES: readonly SeedDebate[] = [
  {
    id: 'd-gen',
    claimId: 'gen',
    date: '2 Nov 2026',
    duration: '18:40',
    votesLabel: '12.1k votes',
    ppDebater: 'Amira H.',
    piDebater: 'Noam B.',
    ppPosition: 'Agree',
    piPosition: 'Disagree',
    ppBeforeAfter: [90, 92],
    piBeforeAfter: [6, 9],
    allBeforeAfter: [47, 50],
  },
  {
    id: 'd-gen-2',
    claimId: 'gen',
    date: '19 Oct 2026',
    duration: '21:15',
    votesLabel: '6.4k votes',
    ppDebater: 'Rami K.',
    piDebater: 'Shira L.',
    ppPosition: 'Agree',
    piPosition: 'Disagree',
    ppBeforeAfter: [92, 93],
    piBeforeAfter: [5, 6],
    allBeforeAfter: [48, 49],
  },
  {
    id: 'd-cf',
    claimId: 'cf',
    date: '12 Nov 2026',
    duration: '22:05',
    votesLabel: '3.3k votes',
    ppDebater: 'Layla S.',
    piDebater: 'Daniel R.',
    ppPosition: 'Disagree',
    piPosition: 'Agree',
    ppBeforeAfter: [5, 4],
    piBeforeAfter: [63, 58],
    allBeforeAfter: [35, 31],
  },
  {
    id: 'd-civ',
    claimId: 'civ',
    date: '28 Oct 2026',
    duration: '16:25',
    votesLabel: '4.1k votes',
    ppDebater: 'Omar T.',
    piDebater: 'Yael K.',
    ppPosition: 'Agree',
    piPosition: 'Disagree',
    ppBeforeAfter: [97, 98],
    piBeforeAfter: [21, 26],
    allBeforeAfter: [60, 63],
  },
  {
    id: 'd-gov',
    claimId: 'gov',
    date: '5 Nov 2026',
    duration: '19:30',
    votesLabel: '2.9k votes',
    ppDebater: 'Karim A.',
    piDebater: 'Talia W.',
    ppPosition: 'Disagree',
    piPosition: 'Agree',
    ppBeforeAfter: [14, 17],
    piBeforeAfter: [93, 94],
    allBeforeAfter: [51, 54],
  },
  {
    id: 'd-aid',
    claimId: 'aid',
    date: '9 Nov 2026',
    duration: '17:50',
    votesLabel: '5.6k votes',
    ppDebater: 'Nadia M.',
    piDebater: 'Eitan G.',
    ppPosition: 'Agree',
    piPosition: 'Disagree',
    ppBeforeAfter: [93, 95],
    piBeforeAfter: [10, 13],
    allBeforeAfter: [52, 55],
  },
];

export const DEBATE_BY_ID: Readonly<Record<string, SeedDebate>> = Object.fromEntries(SEED_DEBATES.map(d => [d.id, d]));

export interface SeedGraphNode {
  id: string;
  name: string;
  kind: string;
  tags: readonly string[];
  summary: string;
  featured?: boolean;
  eventId?: string;
  claimIds?: readonly string[];
  relations: readonly { targetId: string; label: string; sourceNote?: string }[];
}

export const SEED_GRAPH_NODES: readonly SeedGraphNode[] = [
  {
    id: 'hamas',
    name: 'Hamas',
    kind: 'Armed group · Political movement',
    tags: ['Governing authority'],
    summary:
      'Palestinian Islamist movement. Won the 2006 legislative election, took control of Gaza in 2007, and led the 7 October 2023 attack. Designated a terrorist organisation by the US, EU, and UK.',
    featured: true,
    claimIds: ['gov', 'oct7'],
    relations: [
      { targetId: 'moh', label: 'runs', sourceNote: 'Gaza government structure' },
      { targetId: 'yl', label: 'governs beyond', sourceNote: 'De facto, Oct 2026' },
      { targetId: 'cf-ev', label: 'party to', sourceNote: '20-point plan' },
      { targetId: 'bop', label: 'asked to disarm by', sourceNote: 'Roadmap, Jul 2026' },
      { targetId: 'icc', label: 'commander warrant', sourceNote: 'ICC, Nov 2024' },
    ],
  },
  {
    id: 'idf',
    name: 'Israel Defense Forces',
    kind: 'Military',
    tags: ['State actor'],
    summary: 'Israel’s military. Holds the zone behind the Yellow Line, more than 60% of Gaza by mid-2026.',
    featured: true,
    claimIds: ['k70', 'civ'],
    relations: [
      { targetId: 'yl', label: 'controls', sourceNote: 'Reuters, May 2026' },
      { targetId: 'moh', label: 'accepted ~71,000 count', sourceNote: 'IDF official, Jan 2026' },
      { targetId: 'cogat', label: 'works with', sourceNote: 'Defense Ministry' },
      { targetId: 'isr', label: 'commanded by' },
    ],
  },
  {
    id: 'isr',
    name: 'Israel’s government',
    kind: 'Government',
    tags: ['State actor'],
    summary:
      'Netanyahu remains caretaker prime minister after the 27 October 2026 election; Gadi Eisenkot received the mandate to form a government.',
    featured: true,
    claimIds: ['gen', 'cf'],
    relations: [
      { targetId: 'idf', label: 'commands' },
      { targetId: 'cf-ev', label: 'party to', sourceNote: 'Oct 2025' },
      { targetId: 'coi', label: 'rejects findings of', sourceNote: '“Propaganda document”' },
      { targetId: 'sa', label: 'respondent in', sourceNote: 'ICJ' },
      { targetId: 'icc', label: 'leaders face warrants', sourceNote: 'ICC, Nov 2024' },
    ],
  },
  {
    id: 'moh',
    name: 'Gaza Health Ministry',
    kind: 'Government body',
    tags: ['Data source'],
    summary:
      'Part of the Hamas-run government. Publishes Gaza’s casualty counts by name, age, and sex without separating fighters from civilians.',
    featured: true,
    claimIds: ['k70', 'civ'],
    relations: [
      { targetId: 'hamas', label: 'run by', sourceNote: 'Gaza government structure' },
      { targetId: 'idf', label: 'Jan 2026 total accepted by', sourceNote: 'IDF official, Jan 2026' },
    ],
  },
  {
    id: 'unrwa',
    name: 'UNRWA',
    kind: 'UN agency',
    tags: ['Aid'],
    summary: 'The UN agency for Palestinian refugees and historically the largest aid operation in Gaza.',
    featured: true,
    relations: [
      { targetId: 'isr', label: 'barred from operating by', sourceNote: 'Law in force Jan 2025' },
      { targetId: 'icj', label: 'must be allowed to work, says', sourceNote: 'Advisory opinion, Oct 2025' },
      { targetId: 'bop', label: 'not worked with by', sourceNote: 'Sep 2026' },
    ],
  },
  {
    id: 'cogat',
    name: 'COGAT',
    kind: 'Israeli military unit',
    tags: ['Aid', 'Data source'],
    summary: 'The Israeli Defense Ministry unit that controls cargo and aid crossings into Gaza.',
    featured: true,
    relations: [
      { targetId: 'isr', label: 'part of' },
      { targetId: 'ipc', label: 'disputes famine method', sourceNote: 'Aug 2025' },
      { targetId: 'idf', label: 'works with' },
    ],
  },
  {
    id: 'ipc',
    name: 'IPC',
    kind: 'Food security body',
    tags: ['UN-backed', 'Data source'],
    summary:
      'The UN-backed system that classifies hunger and declared famine (Phase 5) in Gaza Governorate in August 2025.',
    featured: true,
    relations: [
      { targetId: 'cogat', label: 'disputed by', sourceNote: 'Methodology' },
      { targetId: 'cf-ev', label: 'eased after', sourceNote: 'Dec 2025' },
    ],
  },
  {
    id: 'icj',
    name: 'International Court of Justice',
    kind: 'Court',
    tags: ['UN court', 'Legal'],
    summary:
      'The UN’s top court. Ordered provisional measures in South Africa v. Israel in January 2024; a merits ruling is expected around 2029.',
    featured: true,
    eventId: 'eicj',
    claimIds: ['gen'],
    relations: [
      { targetId: 'sa', label: 'hears', sourceNote: 'Merits ~2029' },
      { targetId: 'unrwa', label: 'said Israel must allow', sourceNote: 'Oct 2025' },
      { targetId: 'isr', label: 'ruled on conduct of', sourceNote: 'Provisional measures, Jan 2024' },
    ],
  },
  {
    id: 'icc',
    name: 'International Criminal Court',
    kind: 'Court',
    tags: ['Legal'],
    summary: 'Tries individuals. Issued arrest warrants in November 2024 for Israeli and Hamas leaders.',
    featured: true,
    relations: [
      { targetId: 'isr', label: 'warrants for leaders of', sourceNote: 'Nov 2024' },
      { targetId: 'hamas', label: 'warrant for commander of', sourceNote: 'Nov 2024' },
    ],
  },
  {
    id: 'coi',
    name: 'UN Commission of Inquiry',
    kind: 'UN investigators',
    tags: ['UN-mandated', 'Investigators'],
    summary:
      'Investigators appointed by the UN Human Rights Council. Concluded in September 2025 that Israel committed genocide and in October 2026 that acts continued after the ceasefire.',
    featured: true,
    eventId: 'ecoi',
    claimIds: ['gen'],
    relations: [
      { targetId: 'isr', label: 'found genocide by', sourceNote: 'Sep 2025' },
      { targetId: 'cf-ev', label: 'says acts continued after', sourceNote: 'Oct 2026' },
      { targetId: 'yl', label: 'calls annexation', sourceNote: 'Oct 2026' },
    ],
  },
  {
    id: 'bop',
    name: 'Board of Peace',
    kind: 'Transitional body',
    tags: ['International', 'Governance'],
    summary: 'Set up under the US 20-point plan to oversee Gaza’s transition and stabilisation roadmap.',
    featured: true,
    relations: [
      { targetId: 'ncag', label: 'oversees', sourceNote: 'Jan 2026' },
      { targetId: 'cf-ev', label: 'oversees', sourceNote: 'Oct 2025' },
      { targetId: 'hamas', label: 'issued roadmap to', sourceNote: 'Jul 2026' },
    ],
  },
  {
    id: 'ncag',
    name: 'Gaza administration committee',
    kind: 'Technocratic committee',
    tags: ['Palestinian', 'Governance'],
    summary:
      'The technocratic committee meant to administer Gaza. Based in Cairo and not yet allowed into Gaza as of October 2026.',
    relations: [
      { targetId: 'bop', label: 'overseen by' },
      { targetId: 'hamas', label: 'would receive weapons from', sourceNote: 'Roadmap, Jul 2026' },
      { targetId: 'isr', label: 'not let in by', sourceNote: 'As of Oct 2026' },
    ],
  },
  {
    id: 'yl',
    name: 'Yellow Line area',
    kind: 'Place',
    tags: ['Contested'],
    summary:
      'The part of Gaza behind the line Israel withdrew to under the October 2025 ceasefire: about 53% of Gaza initially, 64%+ by May 2026 according to Reuters.',
    claimIds: ['cf'],
    relations: [
      { targetId: 'idf', label: 'held by' },
      { targetId: 'cf-ev', label: 'set by', sourceNote: 'Oct 2025' },
      { targetId: 'hamas', label: 'Hamas governs beyond' },
      { targetId: 'coi', label: 'called annexation by', sourceNote: 'Oct 2026' },
    ],
  },
  {
    id: 'cf-ev',
    name: 'Ceasefire (October 2025)',
    kind: 'Event',
    tags: ['Ongoing'],
    summary:
      'US-brokered under the 20-point plan; took effect 10 October 2025, and all living hostages were freed on 13 October. Strikes continue and phase two is stalled.',
    eventId: 'ecf',
    claimIds: ['cf', 'hostages'],
    relations: [
      { targetId: 'hamas', label: 'party' },
      { targetId: 'isr', label: 'party' },
      { targetId: 'bop', label: 'overseen by' },
      { targetId: 'yl', label: 'drew' },
    ],
  },
  {
    id: 'sa',
    name: 'South Africa v. Israel',
    kind: 'Court case',
    tags: ['Ongoing'],
    summary:
      'South Africa’s genocide case at the ICJ. Provisional measures were ordered in January 2024; a ruling on the merits is expected around 2029.',
    eventId: 'eicj',
    claimIds: ['gen'],
    relations: [
      { targetId: 'icj', label: 'heard by' },
      { targetId: 'isr', label: 'respondent' },
    ],
  },
];

export const SEED_TIMELINE_ERAS: readonly TimelineEraModel[] = [
  {
    id: 'era-1948',
    years: '1947–2004',
    name: 'Roots',
    blurb: 'Israel’s founding, the refugees, occupation, and the failed peace process.',
  },
  {
    id: 'era-2005',
    years: '2005–Oct 2023',
    name: 'Gaza under Hamas',
    blurb: 'Israel leaves Gaza, Hamas takes over, a blockade, and four rounds of war.',
  },
  {
    id: 'era-2023',
    years: '7 Oct 2023–2024',
    name: 'The attack and the war',
    blurb: 'The deadliest day in Israel’s history, and the longest and deadliest war in Gaza.',
  },
  {
    id: 'era-2025',
    years: '2025',
    name: 'Truce, famine, ceasefire',
    blurb: 'A truce collapses, aid is cut off, famine is declared, and a US plan ends major fighting.',
  },
  {
    id: 'era-2026',
    years: '2026',
    name: 'The ceasefire in practice',
    blurb: 'Every hostage is home. Strikes continue, Israel holds more of Gaza, and disarmament is stuck.',
  },
];

export interface SeedTimelineTurn {
  id: string;
  eraId: string;
  when: string;
  title: string;
  why: string;
  isKey?: boolean;
  sourceLabel?: string;
  ppFraming?: string;
  piFraming?: string;
  knownDisputedUnknown?: { known: string; disputed: string; unknown: string };
  eventId?: string;
  claimIds?: readonly string[];
}

export const SEED_TIMELINE_TURNS: readonly SeedTimelineTurn[] = [
  {
    id: 't-1948',
    eraId: 'era-1948',
    when: '1947–49',
    title: 'Partition, war, and Israel’s founding; about 700,000 Palestinians flee or are expelled',
    why: 'Most Gazans today descend from these refugees. Gaza falls under Egyptian administration.',
    isKey: true,
    ppFraming: 'The Nakba: an ethnic cleansing that has never been undone.',
    piFraming:
      'A war of independence after Arab states rejected partition and invaded; flight was driven largely by war.',
  },
  {
    id: 't-1967',
    eraId: 'era-1948',
    when: 'Jun 1967',
    title: 'Six-Day War: Israel captures Gaza, the West Bank, and East Jerusalem',
    why: 'Begins the occupation at the centre of the ICJ’s 2024 advisory opinion.',
    isKey: true,
    ppFraming: 'The start of an occupation that still hasn’t ended.',
    piFraming: 'A defensive war; the territories are disputed, not occupied.',
  },
  {
    id: 't-2005',
    eraId: 'era-2005',
    when: 'Aug 2005',
    title: 'Israel withdraws all settlers and troops from Gaza',
    why: 'Israel keeps control of airspace, sea, and most crossings, fuelling the dispute over whether Gaza stayed occupied.',
    isKey: true,
    ppFraming: 'The occupation continued from outside; Gaza was sealed, not freed.',
    piFraming: 'A full withdrawal that brought rockets in return.',
  },
  {
    id: 't-2007',
    eraId: 'era-2005',
    when: 'Jun 2007',
    title: 'Hamas seizes Gaza from Fatah; Israel and Egypt tighten a blockade',
    why: 'Sixteen years of split Palestinian rule and closure begin.',
    isKey: true,
    ppFraming: 'Collective punishment of two million people: an open-air prison.',
    piFraming: 'A lawful blockade to stop weapons reaching a group sworn to destroy Israel.',
  },
  {
    id: 't-oct7',
    eraId: 'era-2023',
    when: '7 Oct 2023',
    title: 'Hamas-led attack on southern Israel: about 1,200 killed, 251 taken hostage',
    why: 'Most of those killed were civilians. It triggered the war and was the deadliest day for Jews since the Holocaust.',
    isKey: true,
    sourceLabel: 'AFP tally, Israeli government',
    ppFraming: 'A war crime that many condemn, in a conflict that did not start on 7 October.',
    piFraming: 'A genocidal massacre, and the reason for everything that followed.',
    eventId: 'e7oct',
    claimIds: ['oct7', 'hostages'],
  },
  {
    id: 't-ahli',
    eraId: 'era-2023',
    when: '17 Oct 2023',
    title: 'Explosion at al-Ahli hospital',
    why: 'Gaza officials blamed an Israeli strike and said about 500 died. Israel blamed a misfired rocket. It was the war’s first major information fight.',
    isKey: true,
    sourceLabel: 'Human Rights Watch, Nov 2023',
    knownDisputedUnknown: {
      known: 'A deadly explosion hit the hospital’s courtyard on 17 October 2023.',
      disputed:
        'Who fired. Human Rights Watch found evidence pointing to a misfired rocket of the kind Palestinian armed groups use.',
      unknown:
        'The exact death toll. The initial figure of about 500 was never verified; US intelligence estimated 100–300.',
    },
  },
  {
    id: 't-icj',
    eraId: 'era-2023',
    when: '26 Jan 2024',
    title: 'ICJ orders Israel to prevent genocidal acts and let aid in',
    why: 'In South Africa’s case. Not a final ruling on whether genocide happened.',
    isKey: true,
    sourceLabel: 'International Court of Justice',
    ppFraming: 'The world court found a genocide case plausible.',
    piFraming: 'No finding of genocide; Israel and the US call the case baseless.',
    eventId: 'eicj',
    claimIds: ['gen'],
  },
  {
    id: 't-icc',
    eraId: 'era-2023',
    when: '21 Nov 2024',
    title: 'ICC issues arrest warrants for Netanyahu, Gallant, and Hamas’s Deif',
    why: 'Charges include starvation as a method of war and crimes against humanity.',
    isKey: false,
    sourceLabel: 'International Criminal Court',
    ppFraming: 'Overdue international accountability.',
    piFraming: 'No jurisdiction, and a political attack on Israel.',
  },
  {
    id: 't-halt',
    eraId: 'era-2025',
    when: '2 Mar 2025',
    title: 'Israel halts all aid into Gaza for 11 weeks',
    why: 'The cutoff lasted until mid-May 2025 and preceded the IPC famine finding.',
    isKey: true,
    sourceLabel: 'NRC, UN',
    ppFraming: 'Starvation used as a weapon of war.',
    piFraming: 'Pressure on Hamas to free hostages, because Hamas diverted aid.',
  },
  {
    id: 't-fam',
    eraId: 'era-2025',
    when: '22 Aug 2025',
    title: 'Famine confirmed in Gaza Governorate',
    why: 'The first IPC Phase 5 famine confirmation in the Middle East; eased after the ceasefire.',
    isKey: true,
    sourceLabel: 'IPC',
    ppFraming: 'Proof of deliberate starvation.',
    piFraming: 'Flawed data; Israel’s COGAT rejected the methodology.',
  },
  {
    id: 't-cf',
    eraId: 'era-2025',
    when: '10–13 Oct 2025',
    title: 'US-brokered ceasefire; all 20 living hostages freed',
    why: 'Israel pulled back to the Yellow Line (~53% of Gaza); roughly 2,000 Palestinian prisoners and detainees were freed.',
    isKey: true,
    sourceLabel: '20-point plan, Times of Israel',
    eventId: 'ecf',
    claimIds: ['hostages', 'cf'],
  },
  {
    id: 't-71k',
    eraId: 'era-2026',
    when: '29 Jan 2026',
    title: 'An Israeli military official accepts about 71,000 killed in Gaza',
    why: 'Matching the Gaza Health Ministry’s total at that point; the civilian–fighter split remains sharply disputed.',
    isKey: true,
    sourceLabel: 'Haaretz, Times of Israel',
    eventId: 'e71k',
    claimIds: ['k70', 'civ'],
  },
  {
    id: 't-yl',
    eraId: 'era-2026',
    when: 'Apr–May 2026',
    title: 'Israel’s zone behind the Yellow Line grows past 60% of Gaza',
    why: 'Reuters mapped Israeli-held territory expanding from ~53% at the ceasefire baseline to 64%+.',
    isKey: false,
    sourceLabel: 'Reuters',
    ppFraming: 'Annexation by bulldozer under a ceasefire.',
    piFraming: 'A security buffer until Hamas disarms.',
    claimIds: ['cf', 'gov'],
  },
  {
    id: 't-disarm',
    eraId: 'era-2026',
    when: '30 Jul 2026',
    title: 'Disarmament deadlock: phased handover vs disarm first',
    why: 'US mediators proposed phased disarmament tied to pullback; Israel stated it never agreed and requires disarmament first.',
    isKey: true,
    sourceLabel: 'CNN, Israel Policy Forum',
    eventId: 'edis',
    claimIds: ['gov'],
  },
  {
    id: 't-coi',
    eraId: 'era-2026',
    when: '26 Oct 2026',
    title: 'UN Commission of Inquiry says genocidal acts continued after the ceasefire',
    why: 'Follow-up report examining the year since October 2025. Israel rejected it as a propaganda document.',
    isKey: false,
    sourceLabel: 'UN COI',
    eventId: 'ecoi',
    claimIds: ['gen'],
  },
];

export const SEED_TIMELINE_NUMBERS = [
  { label: 'Killed in Israel on 7 Oct 2023', value: '~1,200', attribution: 'Israeli government, AFP tally' },
  { label: 'Hostages taken / freed alive / held', value: '251 / 168 / 0', attribution: 'IDF and AP, Jan 2026' },
  { label: 'Killed in Gaza (mid-Nov 2026)', value: '74,702', attribution: 'Gaza Health Ministry' },
  { label: 'Ministry total accepted by IDF official', value: '~71,000', attribution: 'IDF official, Jan 2026' },
  { label: 'Fighters among the dead', value: '24k–25k', attribution: 'IDF claim; no method published' },
  { label: 'Buildings damaged or destroyed', value: '82%', attribution: 'UNOSAT survey, Jun 2026' },
  { label: 'Aid trucks/day since ceasefire', value: '~600 vs ~110–227', attribution: 'COGAT vs IPC & RI' },
] as const;

export function classifySourceLibraryGroup(sourceType: string): SourceLibraryGroup {
  if (/Dataset/i.test(sourceType)) return 'data';
  if (/News|Report/i.test(sourceType) && !/Court|Primary/i.test(sourceType)) return 'reporting';
  if (/statement|post|hearing|video/i.test(sourceType)) return 'statement';
  return 'primary';
}
