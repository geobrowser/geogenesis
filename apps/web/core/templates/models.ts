/**
 * Data-source-agnostic view-model contracts for Geo entity templates.
 *
 * Every template component renders purely from these models — never directly from GraphQL rows or
 * fixture blobs — so live graph adapters and prototype fixtures are interchangeable behind
 * `TemplateDataSource<TModel>`.
 *
 * Optional modules on page models follow Geo's progressive disclosure rule:
 * "Modules render only when they have something to say."
 */

export type VoteChoice = 'agree' | 'disagree' | null;

/**
 * Stored epistemic property on a Claim (`CLAIM_IS_FACTUAL_PROPERTY_ID`).
 *
 * Distinct from agreement state (`Contested` vs `Common ground`), which is always computed
 * dynamically from community vote splits (`SplitBreakdown.isSplit`), never stored as a type.
 */
export type ClaimKind = 'fact' | 'judgment' | 'value-judgment';

/**
 * Directed stance edge connecting a subclaim to a parent claim
 * (`CLAIM_SUPPORTS_PROPERTY_ID` | `CLAIM_OPPOSES_PROPERTY_ID` | `CLAIM_ADDRESSES_PROPERTY_ID`).
 */
export type ClaimStance = 'supports' | 'opposes' | 'addresses';

export type EntityLinkKind =
  'claim' | 'event' | 'news-story' | 'podcast' | 'episode' | 'source' | 'post' | 'debate' | 'topic' | 'case';

export type SourceMediaKind = 'article' | 'video' | 'tweet' | 'document' | 'dataset';

export interface BreadcrumbItem {
  id: string;
  label: string;
  href?: string;
  onSelect?: () => void;
}

export interface CommunityDefinition {
  id: string;
  name: string;
  shortName: string;
  /** Hex or CSS color used for split bars, pills, and chart series. */
  color: string;
  memberCount?: number;
  avatarUrl?: string;
}

export interface SplitRow {
  /** Community / space ID, or `'all'` / top-level space ID for the combined parent bar. */
  id: string;
  label: string;
  color: string;
  /** 0–100 integer or float; rendered as an integer percentage. */
  percent: number;
  voterCount?: number;
  /** Suffix unit, e.g. `'agree'` (default) or `'helpful'`. */
  unit?: string;
  /** Set when the current user's vote belongs to this row. */
  userLabel?: string;
  /** True for the top-level space / overall aggregate bar rendered above subspaces. */
  isEveryone?: boolean;
  /** True for subspace bars nested visually beneath the top-level space bar. */
  isSubspace?: boolean;
  href?: string;
  onSelect?: () => void;
}

export interface SplitBreakdown {
  rows: readonly SplitRow[];
  /** Absolute percentage-point spread between communities, when multi-community data exists. */
  gapPoints?: number;
  /** True when communities diverge significantly (default threshold: >30 pts). */
  isSplit: boolean;
  totalVotes?: number;
}

export interface VoteControlModel {
  userVote: VoteChoice;
  /** Human-readable vote count summary (e.g. "2,418 votes in all · 2,140 from members"). */
  countSummary: string;
  /** Explanatory hint shown below the controls before or after voting. */
  hint?: string;
  /** Feedback line describing how the user's vote affected community / overall totals. */
  impactNote?: string;
  disabled?: boolean;
  onVote: (choice: Exclude<VoteChoice, null>) => void;
  onClear?: () => void;
}

export interface SourceChipModel {
  id: string;
  index: number;
  title: string;
  mediaType?: SourceMediaKind;
  href?: string;
  onSelect?: () => void;
}

export interface ClaimSummaryModel {
  id: string;
  title: string;
  kind?: ClaimKind;
  split: SplitBreakdown;
  /** Optional headline percentage (e.g. overall % agree) shown on lead contested cards. */
  overallPercent?: number;
  /** Optional explicit Agree / Disagree vote totals for inline vote button counters. */
  agreeCount?: number;
  disagreeCount?: number;
  /** Short source/basis attribution shown on agreed claim cards. */
  basisSummary?: string;
  /** Optional metadata items (e.g. "2,418 votes", "7 debates"). */
  meta?: readonly string[];
  debateCount?: number;
  debatesHref?: string;
  onOpenDebates?: () => void;
  badgeLabel?: string;
  userVote?: VoteChoice;
  /** Optional inline Agree / Disagree voting directly from a claim list row. */
  onVote?: (choice: Exclude<VoteChoice, null>) => void;
  onClearVote?: () => void;
  href?: string;
  onSelect?: () => void;
}

export interface SourceQuoteModel {
  id: string;
  text: string;
  speaker?: string;
  location?: string;
}

export interface EntityTripleValueModel {
  id: string;
  label: string;
  kind?: EntityLinkKind | 'entity' | 'text';
  href?: string;
  onSelect?: () => void;
  /** Optional link/handler for the relation entity itself (opened from the pill hover toolbar). */
  relationHref?: string;
  onOpenRelation?: () => void;
}

export interface EntityTripleModel {
  id: string;
  /** Property / relation predicate (e.g. "Legal status", "Supporting reports", "Actors"). */
  predicate: string;
  /** One or more values / related entities attached under this property. */
  values: readonly EntityTripleValueModel[];
}

export interface EntityFlagModel {
  id: string;
  reason?: string;
  body: string;
  sourceUrl?: string;
  sourceLabel?: string;
  helpfulPercent?: number;
  bridging?: boolean;
}

export interface EntityContextDataModel {
  triples?: readonly EntityTripleModel[];
  flags?: readonly EntityFlagModel[];
}

/** Optional persistence & live search callbacks for live GRC-20 adapters wired through `TemplateShell`. */
export interface EntityActionCallbacks {
  onAddTriple?: (targetId: string, predicate: string, values: readonly string[]) => void;
  onDeleteTriple?: (targetId: string, valueId: string) => void;
  onAddFlag?: (targetId: string, draft: { reason: string; body: string; sourceUrl?: string }) => void;
  onAddClaim?: (draft: { title: string; kind: ClaimKind; stance?: ClaimStance; note?: string }) => void;
  onAddQuote?: (draft: { text: string; speaker?: string; location?: string }) => void;
  onAddEvent?: (draft: { title: string; when?: string; summary?: string }) => void;
  /** Optional live Geo entity search for `+` relation popovers; falls back to fixture suggestions when omitted. */
  searchEntities?: (query: string) => Promise<readonly { id: string; name: string }[]>;
}

export interface EntityLinkRowModel {
  id: string;
  kind: EntityLinkKind;
  /** Display label for the type pill (only shown when a list contains mixed kinds). */
  kindLabel: string;
  title: string;
  meta?: string;
  /** Optional rich media subtype for tailored Source / Coverage card rendering. */
  mediaType?: SourceMediaKind;
  publisher?: string;
  date?: string;
  excerpt?: string;
  /** Direct verbatim quotes extracted from this source (`QUOTE_TYPE_ID`). */
  quotes?: readonly SourceQuoteModel[];
  duration?: string;
  authorHandle?: string;
  authorAvatarUrl?: string | null;
  thumbnailUrl?: string;
  externalUrl?: string;
  href?: string;
  onSelect?: () => void;
  /** Optional side-by-side avatars (used for debate rows). */
  avatarPair?: readonly [string, string];
  /** Non-interactive row (e.g. "You're watching this one"). */
  plain?: boolean;
}

export interface EntityListSectionModel {
  id: string;
  title: string;
  subtitle?: string;
  /** `'cards'` renders rich format-aware media cards (articles, videos, tweets, datasets). */
  layout?: 'list' | 'cards';
  items: readonly EntityLinkRowModel[];
  emptyText?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

export interface StrongestCaseModel {
  id: string;
  communityId: string;
  title: string;
  accentColor: string;
  points: readonly string[];
  concede?: string;
  sources: readonly SourceChipModel[];
}

/**
 * A child Claim linked via `SUBCLAIMS_PROPERTY_ID` (and optional stance edge `Supports` / `Opposes` / `Addresses`).
 */
export interface SubClaimModel {
  id: string;
  title: string;
  /** Stored epistemic property on the subclaim (`Factual` vs `Judgment`). */
  kind?: ClaimKind;
  /** Optional stance relation to the parent claim (`Supports`, `Opposes`, `Addresses`). */
  stance?: ClaimStance;
  stat?: string;
  split: SplitBreakdown;
  agreeCount?: number;
  disagreeCount?: number;
  debateCount?: number;
  debatesHref?: string;
  userVote?: VoteChoice;
  onVote?: (choice: Exclude<VoteChoice, null>) => void;
  onClearVote?: () => void;
  sources: readonly SourceChipModel[];
  href?: string;
  onSelect?: () => void;
}

/** @deprecated Prefer `SubClaimModel`. Kept as an alias for backwards compatibility. */
export type SubClaimFactModel = SubClaimModel;

export interface ClaimAgreedBasisModel {
  summary: string;
  settlingSources: readonly SourceChipModel[];
}

export interface GraphConnectionItemModel {
  id: string;
  label: string;
  kind: EntityLinkKind | 'entity';
  meta?: string;
  href?: string;
  onSelect?: () => void;
  /** Optional href for the relation entity itself (opened from the pill hover toolbar). */
  relationHref?: string;
}

export interface GraphConnectionGroupModel {
  /** Predicate / relation label (e.g. 'Events', 'Sources', 'Actors', 'Debates', 'Subclaims'). */
  predicate: string;
  items: readonly GraphConnectionItemModel[];
}

export interface ContextPeekItemModel {
  id: string;
  kind: 'source' | 'entity' | 'event' | 'news-story' | 'claim';
  kindLabel: string;
  title: string;
  subtitle?: string;
  mediaType?: SourceMediaKind;
  tags?: readonly string[];
  summary?: string;
  quotes?: readonly SourceQuoteModel[];
  metadata?: readonly { label: string; value: string }[];
  externalUrl?: string;
  externalLabel?: string;
  split?: SplitBreakdown;
  voteBox?: VoteControlModel;
  settlingSources?: readonly SourceChipModel[];
  subClaims?: readonly SubClaimModel[];
  claims?: readonly ClaimSummaryModel[];
  relations?: readonly {
    id: string;
    predicate: string;
    targetName: string;
    note?: string;
    onSelect?: () => void;
  }[];
  flags?: readonly EntityFlagModel[];
  openFullLabel?: string;
  fullHref?: string;
  onOpenFull?: () => void;
}

export interface ClaimTopicPillModel {
  id: string;
  label: string;
  imageUrl?: string | null;
  href?: string;
  onSelect?: () => void;
}

export interface ClaimTemplateModel {
  id: string;
  title: string;
  coverUrl?: string | null;
  breadcrumbs?: readonly BreadcrumbItem[];
  kind: ClaimKind;
  split: SplitBreakdown;
  voteBox: VoteControlModel;
  debateCount?: number;
  debatesHref?: string;
  onOpenDebates?: () => void;
  /** Horizontal gallery row of debate cards on this claim. */
  debates?: readonly TopicRecentDebateModel[];
  /** Topics rendered as rounded pills with circular thumbnail images. */
  topics?: readonly ClaimTopicPillModel[];
  graphConnections?: readonly GraphConnectionGroupModel[];
  keyStat?: {
    text: string;
    sources: readonly SourceChipModel[];
  };
  subClaims?: readonly SubClaimModel[];
  strongestCases?: readonly StrongestCaseModel[];
  agreedBasis?: ClaimAgreedBasisModel;
  /** Seeded context triples and flags keyed by entity ID for inline / drawer Context menus. */
  contextByEntityId?: Readonly<Record<string, EntityContextDataModel>>;
  sections: readonly EntityListSectionModel[];
}

export interface TopicStatModel {
  label: string;
  value: string;
}

export interface TopicTimelineHighlightModel {
  id: string;
  when: string;
  title: string;
  summary?: string;
  href?: string;
  onSelect?: () => void;
}

export interface TopicCommunityCaseModel {
  community: CommunityDefinition;
  summary: string;
  concede?: string;
  sources: readonly SourceChipModel[];
  isMember?: boolean;
  onToggleMembership?: () => void;
}

export interface TopicTrendMarkerModel {
  weekIndex: number;
  label: string;
  eventId?: string;
  href?: string;
  onSelect?: () => void;
}

export interface TopicCoverageThemeModel {
  id: string;
  name: string;
  color: string;
  /** Weekly story counts, aligned across all themes. */
  weeklyCounts: readonly number[];
}

export interface TopicAgreementSeriesModel {
  id: string;
  name: string;
  color: string;
  group: 'split' | 'common';
  /** Weekly percentage agree (0–100) for each of the two primary communities. */
  communityAWeekly: readonly number[];
  communityBWeekly: readonly number[];
  /** Optional weekly voter counts for vote-volume bars and confidence shading. */
  communityAVotes?: readonly number[];
  communityBVotes?: readonly number[];
}

export interface TopicTrendsModel {
  weekLabels: readonly string[];
  monthTicks: readonly { weekIndex: number; label: string }[];
  markers: readonly TopicTrendMarkerModel[];
  coverageThemes: readonly TopicCoverageThemeModel[];
  coverageCaption?: string;
  agreementSeries?: readonly TopicAgreementSeriesModel[];
  communityALabel?: string;
  communityAColor?: string;
  communityBLabel?: string;
  communityBColor?: string;
}

export interface TopicRankingItemModel {
  id: string;
  rank: number;
  title: string;
  subtitle?: string;
  tag?: string;
  metric?: string;
  /** Optional rank movement relative to Everyone's ranking (e.g. '▲ 4', '▼ 2', 'new'). */
  rankDelta?: string;
  href?: string;
  onSelect?: () => void;
}

export interface TopicRankingModel {
  id: string;
  title: string;
  subtitle: string;
  itemsByCommunity: Readonly<Record<string, readonly TopicRankingItemModel[]>>;
  suggestPlaceholder?: string;
  onSuggestItem?: (input: string) => void;
}

export interface TopicGraphRelationModel {
  targetId: string;
  label: string;
  sourceNote?: string;
}

export interface TopicGraphNodeModel {
  id: string;
  name: string;
  kind: string;
  tags?: readonly string[];
  summary: string;
  featured?: boolean;
  relations: readonly TopicGraphRelationModel[];
  claims?: readonly ClaimSummaryModel[];
  href?: string;
  onSelect?: () => void;
}

export interface TopicEntityGraphModel {
  title?: string;
  subtitle?: string;
  initialNodeId?: string;
  nodes: readonly TopicGraphNodeModel[];
}

export interface TopicViralPostPreviewModel {
  id: string;
  authorName: string;
  authorHandle?: string;
  platform: string;
  viewsLabel?: string;
  when?: string;
  body: string;
  topNote?: {
    tag: string;
    status: 'shown' | 'pending';
    text: string;
  };
  noteCount: number;
  needsContext?: boolean;
  waitingForRatings?: boolean;
  href?: string;
  onSelect?: () => void;
}

export interface TopicRecentDebateParticipantModel {
  name: string;
  position: 'Agree' | 'Disagree';
  communityColor: string;
  /** Video still frame (`speaker_still_slot_1|2`) rendered across the 480:289 speaker tile. */
  avatarUrl?: string;
  /** Circular profile avatar photo rendered inside the speaker badge and as still-unavailable fallback. */
  profileAvatarUrl?: string | null;
}

export interface TopicRecentDebateModel {
  id: string;
  claimId: string;
  claimTitle: string;
  date: string;
  duration: string;
  votesLabel: string;
  participants: readonly [TopicRecentDebateParticipantModel, TopicRecentDebateParticipantModel];
  /** Optional community agreement percentages shown in the card's summary band. */
  split?: SplitBreakdown;
  agreeCount?: number;
  disagreeCount?: number;
  userVote?: VoteChoice;
  onVote?: (choice: Exclude<VoteChoice, null>) => void;
  onClearVote?: () => void;
  href?: string;
  onSelect?: () => void;
}

export interface TopicTemplateModel {
  id: string;
  title: string;
  lede?: string;
  coverUrl?: string | null;
  avatarUrl?: string | null;
  breadcrumbs?: readonly BreadcrumbItem[];
  tags?: readonly string[];
  stats?: readonly TopicStatModel[];
  /** Compact subtopic navigation chips rendered cleanly beneath the Topic header/lede. */
  subtopics?: readonly { id: string; label: string; href?: string; onSelect?: () => void }[];
  communities?: readonly CommunityDefinition[];
  activeCommunityId?: string | 'all';
  onSelectCommunity?: (communityId: string | 'all') => void;
  contestedClaims?: readonly ClaimSummaryModel[];
  agreedClaims?: readonly ClaimSummaryModel[];
  /**
   * Optional rich per-claim detail models powering the inline master–detail Claim Explorer
   * (allowing voting, fact inspection, strongest cases, and source verification without leaving the topic).
   */
  claimDetailsById?: Readonly<Record<string, ClaimTemplateModel>>;
  recentDebates?: readonly TopicRecentDebateModel[];
  communityCases?: readonly TopicCommunityCaseModel[];
  trends?: TopicTrendsModel;
  timelineHighlights?: readonly TopicTimelineHighlightModel[];
  entityGraph?: TopicEntityGraphModel;
  rankings?: readonly TopicRankingModel[];
  viralPosts?: readonly TopicViralPostPreviewModel[];
  timelineHref?: string;
  onOpenTimeline?: () => void;
  sourcesHref?: string;
  onOpenSources?: () => void;
  /** Attached knowledge graph triples & flags keyed by entity ID (claim, source, quote, event, debate). */
  contextByEntityId?: Readonly<Record<string, EntityContextDataModel>>;
  /** Non-sectioned outgoing graph relations displayed in the Topic's Context section. */
  graphConnections?: readonly GraphConnectionGroupModel[];
  /** Additional structured sections (coverage, rankings, debates, etc.). */
  sections?: readonly EntityListSectionModel[];
}

export interface TimelineEraModel {
  id: string;
  years: string;
  name: string;
  blurb: string;
}

export interface TimelineTurnModel {
  id: string;
  eraId: string;
  when: string;
  title: string;
  why: string;
  isKey?: boolean;
  sourceLabel?: string;
  communityFramings?: readonly {
    communityId: string;
    communityName: string;
    color: string;
    text: string;
  }[];
  knownDisputedUnknown?: {
    known: string;
    disputed: string;
    unknown: string;
  };
  claims?: readonly {
    id: string;
    title: string;
    href?: string;
    onSelect?: () => void;
  }[];
  href?: string;
  onSelect?: () => void;
}

export interface TimelineTemplateModel {
  id: string;
  title: string;
  lede?: string;
  breadcrumbs?: readonly BreadcrumbItem[];
  eras: readonly TimelineEraModel[];
  turns: readonly TimelineTurnModel[];
  keyNumbers?: readonly {
    label: string;
    value: string;
    attribution: string;
  }[];
  onSuggestTurn?: (draft: { date: string; summary: string; source: string }) => void;
}

export type SourceLibraryGroup = 'primary' | 'reporting' | 'data' | 'statement';

export interface SourceLibraryItemModel extends EntityLinkRowModel {
  group: SourceLibraryGroup;
  citationCount?: number;
}

export interface SourceLibraryTemplateModel {
  id: string;
  title: string;
  lede?: string;
  totalCountLabel?: string;
  breadcrumbs?: readonly BreadcrumbItem[];
  sources: readonly SourceLibraryItemModel[];
  onAddSource?: (draft: { title: string; url: string }) => void;
}

export interface EventTemplateModel {
  id: string;
  title: string;
  when: string;
  summary?: string;
  quotes?: readonly SourceQuoteModel[];
  coverUrl?: string | null;
  breadcrumbs?: readonly BreadcrumbItem[];
  storyCountLabel?: string;
  graphConnections?: readonly GraphConnectionGroupModel[];
  claims: readonly ClaimSummaryModel[];
  contextByEntityId?: Readonly<Record<string, EntityContextDataModel>>;
  sections: readonly EntityListSectionModel[];
  previousEvent?: { id: string; title: string; when: string; href?: string; onSelect?: () => void };
  nextEvent?: { id: string; title: string; when: string; href?: string; onSelect?: () => void };
}

export interface NewsStoryClaimGroupModel {
  id: string;
  title: string;
  description?: string;
  claims: readonly ClaimSummaryModel[];
}

export interface NewsStorySourceModel {
  id: string;
  title: string;
  publication?: string;
  date?: string;
  url?: string;
  excerpt?: string;
  thumbnailUrl?: string | null;
  href?: string;
  onSelect?: () => void;
}

export interface NewsStoryTemplateModel {
  id: string;
  headline: string;
  /** Optional single-outlet attribution (present for single-publisher stories; omitted for aggregated Geo News stories). */
  outlet?: string;
  outletInitials?: string;
  outletColor?: string;
  authors?: readonly string[];
  date?: string;
  summary?: string;
  coverUrl?: string | null;
  externalUrl?: string;
  archiveUrl?: string;
  breadcrumbs?: readonly BreadcrumbItem[];
  associatedTimelines?: readonly { id: string; title: string; href?: string }[];
  /** Linked Topics rendered as rounded pills with circular thumbnail images. */
  topics?: readonly ClaimTopicPillModel[];
  /** Ordered narrative claim sections (`Blocks` / `Perspectives`) rendered in Geo News bulleted reading style. */
  claimGroups?: readonly NewsStoryClaimGroupModel[];
  /** Rich aggregated source articles (`Sources` with publication, date, cover, excerpt, and external link). */
  sources?: readonly NewsStorySourceModel[];
  graphConnections?: readonly GraphConnectionGroupModel[];
  accuracyRating?: {
    prompt: string;
    split: SplitBreakdown;
    voteBox: VoteControlModel;
  };
  reportedClaims: readonly ClaimSummaryModel[];
  contextByEntityId?: Readonly<Record<string, EntityContextDataModel>>;
  sections: readonly EntityListSectionModel[];
}

export interface SourceTemplateModel {
  id: string;
  title: string;
  publisher?: string;
  date?: string;
  sourceType?: string;
  summary?: string;
  quotes?: readonly SourceQuoteModel[];
  coverUrl?: string | null;
  externalUrl?: string;
  externalLabel?: string;
  breadcrumbs?: readonly BreadcrumbItem[];
  tags?: readonly string[];
  graphConnections?: readonly GraphConnectionGroupModel[];
  metadata: readonly { label: string; value: string }[];
  supportedClaims: readonly ClaimSummaryModel[];
  contextByEntityId?: Readonly<Record<string, EntityContextDataModel>>;
  sections: readonly EntityListSectionModel[];
}

export interface DebateTemplateModel {
  id: string;
  claimId: string;
  claimTitle: string;
  claimHref?: string;
  onOpenClaim?: () => void;
  date?: string;
  duration?: string;
  voteCountLabel?: string;
  summary?: string;
  breadcrumbs?: readonly BreadcrumbItem[];
  participants: readonly {
    name: string;
    avatarUrl?: string;
    communityLabel: string;
    communityColor: string;
    positionLabel: string;
  }[];
  voteBox: VoteControlModel;
  shifts?: readonly {
    label: string;
    color: string;
    beforePercent: number;
    afterPercent: number;
    deltaPoints: number;
  }[];
  shiftVerdict?: string;
  contextByEntityId?: Readonly<Record<string, EntityContextDataModel>>;
  sections: readonly EntityListSectionModel[];
}

export interface PostContextNoteModel {
  id: string;
  tag: string;
  status: 'shown' | 'pending' | 'mine';
  statusLabel: string;
  text: string;
  authorLabel?: string;
  authorColor?: string;
  sources: readonly SourceChipModel[];
  ratingCountLabel?: string;
  helpfulnessSplit?: SplitBreakdown;
  waitReason?: string;
  userRating?: 'helpful' | 'not-helpful' | null;
  onRate?: (rating: 'helpful' | 'not-helpful') => void;
}

export interface PostSuggestedEvidenceModel {
  id: string;
  title: string;
  meta: string;
  mediaType?: SourceMediaKind;
}

export interface PostTemplateModel {
  id: string;
  /** Optional headline when the post has its own title (e.g. a blog post or policy statement). */
  title?: string;
  authorName: string;
  authorHandle?: string;
  platform: string;
  viewsLabel?: string;
  when?: string;
  body: string;
  externalUrl?: string;
  mediaUrl?: string | null;
  mediaAlt?: string;
  engagement?: readonly { label: string; value: string }[];
  breadcrumbs?: readonly BreadcrumbItem[];
  claims: readonly {
    claim: ClaimSummaryModel;
    stanceLabel: string;
  }[];
  notes: readonly PostContextNoteModel[];
  suggestedEvidence?: readonly PostSuggestedEvidenceModel[];
  bridgingRule?: string;
  onAddNote?: (draft: {
    tag: string;
    text: string;
    sourceUrl: string;
    selectedEvidenceIds?: readonly string[];
  }) => void;
  graphConnections?: readonly GraphConnectionGroupModel[];
  contextByEntityId?: Readonly<Record<string, EntityContextDataModel>>;
  sections: readonly EntityListSectionModel[];
}

export interface PodcastPlatformLinkModel {
  id: string;
  name: string;
  url: string;
}

export interface PodcastPersonModel {
  id: string;
  name: string;
  avatarUrl?: string | null;
  role?: 'Host' | 'Guest' | 'Contributor';
  href?: string;
  onSelect?: () => void;
}

export interface PodcastEpisodeSummaryModel {
  id: string;
  title: string;
  showName?: string;
  description?: string;
  airDate?: string;
  airDateTs?: number;
  durationLabel?: string;
  episodeNumber?: number;
  artworkUrl?: string | null;
  href?: string;
  onSelect?: () => void;
}

export interface PodcastTopicChipModel {
  id: string;
  label: string;
  href?: string;
  onSelect?: () => void;
}

export interface PodcastShowTemplateModel {
  id: string;
  title: string;
  artworkUrl?: string | null;
  breadcrumbs?: readonly BreadcrumbItem[];
  description?: string;
  episodeCount: number;
  dateRange?: string;
  rssFeedUrl?: string;
  topics: readonly PodcastTopicChipModel[];
  episodes: readonly PodcastEpisodeSummaryModel[];
  hasMoreEpisodes?: boolean;
  isLoadingMoreEpisodes?: boolean;
  onLoadMoreEpisodes?: () => void;
  hosts: readonly PodcastPersonModel[];
  listenOn: readonly PodcastPlatformLinkModel[];
  graphConnections?: readonly GraphConnectionGroupModel[];
  contextByEntityId?: Readonly<Record<string, EntityContextDataModel>>;
}

export interface PodcastEpisodeTemplateModel {
  id: string;
  title: string;
  artworkUrl?: string | null;
  breadcrumbs?: readonly BreadcrumbItem[];
  show?: {
    id: string;
    name: string;
    artworkUrl?: string | null;
    href?: string;
    onSelect?: () => void;
  };
  airDate?: string;
  durationLabel?: string;
  episodeNumber?: number;
  audioUrl?: string;
  description?: string;
  topics: readonly PodcastTopicChipModel[];
  claims: readonly ClaimSummaryModel[];
  quotes: readonly SourceQuoteModel[];
  hosts: readonly PodcastPersonModel[];
  guests: readonly PodcastPersonModel[];
  contributors?: readonly PodcastPersonModel[];
  listenOn: readonly PodcastPlatformLinkModel[];
  graphConnections?: readonly GraphConnectionGroupModel[];
  contextByEntityId?: Readonly<Record<string, EntityContextDataModel>>;
}

/**
 * Uniform async data contract consumed by every entity template.
 * Keeps UI templates decoupled from whether data came from live GraphQL/store queries or fixtures.
 */
export interface TemplateDataSource<TModel> {
  data: TModel | null;
  isLoading: boolean;
  error?: Error | null;
  source: 'live' | 'fixture';
  actionCallbacks?: EntityActionCallbacks;
}

export type TemplateAdapter<TInput, TModel> = (input: TInput) => TemplateDataSource<TModel>;

export const CLAIM_SPLIT_THRESHOLD_POINTS = 30;

export function computeSplitGap(rows: readonly Pick<SplitRow, 'percent' | 'isEveryone'>[]): number | undefined {
  const communityPercents = rows.filter(row => !row.isEveryone).map(row => Math.round(row.percent));
  if (communityPercents.length < 2) return undefined;
  return Math.max(...communityPercents) - Math.min(...communityPercents);
}

export function isClaimSplit(gapPoints: number | undefined, threshold = CLAIM_SPLIT_THRESHOLD_POINTS): boolean {
  return gapPoints !== undefined && gapPoints > threshold;
}

export function formatPercentInt(value: number): string {
  return `${Math.round(Math.max(0, Math.min(100, value)))}%`;
}

export function formatCompactCount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const formatted = (value / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${formatted}M`;
  }
  if (abs >= 1_000) {
    const formatted = (value / 1_000).toFixed(1).replace(/\.0$/, '');
    return `${formatted}k`;
  }
  return value.toLocaleString('en-US');
}

export function formatClaimKindLabel(kind: ClaimKind): string {
  switch (kind) {
    case 'fact':
      return 'Factual';
    case 'judgment':
      return 'Judgment';
    case 'value-judgment':
      return 'Value judgment';
  }
}

export function formatClaimStanceLabel(stance: ClaimStance): string {
  switch (stance) {
    case 'supports':
      return 'Supports';
    case 'opposes':
      return 'Opposes';
    case 'addresses':
      return 'Addresses';
  }
}
