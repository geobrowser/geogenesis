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

export type ClaimKind = 'fact' | 'judgment' | 'value-judgment';

export type EntityLinkKind = 'claim' | 'event' | 'news-story' | 'source' | 'post' | 'debate' | 'topic' | 'case';

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
  /** Community ID, or `'all'` for the combined Everyone bar. */
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
  isEveryone?: boolean;
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
  /** Short source/basis attribution shown on agreed claim cards. */
  basisSummary?: string;
  /** Optional metadata items (e.g. "2,418 votes", "7 debates"). */
  meta?: readonly string[];
  badgeLabel?: string;
  userVote?: VoteChoice;
  href?: string;
  onSelect?: () => void;
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
  duration?: string;
  authorHandle?: string;
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

export interface SubClaimFactModel {
  id: string;
  title: string;
  stat?: string;
  split: SplitBreakdown;
  sources: readonly SourceChipModel[];
  href?: string;
  onSelect?: () => void;
}

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
  metadata?: readonly { label: string; value: string }[];
  externalUrl?: string;
  externalLabel?: string;
  split?: SplitBreakdown;
  voteBox?: VoteControlModel;
  settlingSources?: readonly SourceChipModel[];
  subClaims?: readonly SubClaimFactModel[];
  claims?: readonly ClaimSummaryModel[];
  relations?: readonly {
    id: string;
    predicate: string;
    targetName: string;
    note?: string;
    onSelect?: () => void;
  }[];
  openFullLabel?: string;
  fullHref?: string;
  onOpenFull?: () => void;
}

export interface ClaimTemplateModel {
  id: string;
  title: string;
  breadcrumbs?: readonly BreadcrumbItem[];
  kind: ClaimKind;
  split: SplitBreakdown;
  voteBox: VoteControlModel;
  debateCount?: number;
  debatesHref?: string;
  onOpenDebates?: () => void;
  graphConnections?: readonly GraphConnectionGroupModel[];
  keyStat?: {
    text: string;
    sources: readonly SourceChipModel[];
  };
  subClaims?: readonly SubClaimFactModel[];
  strongestCases?: readonly StrongestCaseModel[];
  agreedBasis?: ClaimAgreedBasisModel;
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
  claims: readonly ClaimSummaryModel[];
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

export interface TopicTemplateModel {
  id: string;
  title: string;
  lede?: string;
  coverUrl?: string | null;
  avatarUrl?: string | null;
  breadcrumbs?: readonly BreadcrumbItem[];
  tags?: readonly string[];
  stats?: readonly TopicStatModel[];
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
  coverUrl?: string | null;
  breadcrumbs?: readonly BreadcrumbItem[];
  storyCountLabel?: string;
  graphConnections?: readonly GraphConnectionGroupModel[];
  claims: readonly ClaimSummaryModel[];
  sections: readonly EntityListSectionModel[];
  previousEvent?: { id: string; title: string; when: string; href?: string; onSelect?: () => void };
  nextEvent?: { id: string; title: string; when: string; href?: string; onSelect?: () => void };
}

export interface NewsStoryTemplateModel {
  id: string;
  headline: string;
  outlet: string;
  outletInitials: string;
  outletColor: string;
  authors?: readonly string[];
  date?: string;
  summary?: string;
  externalUrl?: string;
  archiveUrl?: string;
  breadcrumbs?: readonly BreadcrumbItem[];
  graphConnections?: readonly GraphConnectionGroupModel[];
  accuracyRating?: {
    prompt: string;
    split: SplitBreakdown;
    voteBox: VoteControlModel;
  };
  reportedClaims: readonly ClaimSummaryModel[];
  sections: readonly EntityListSectionModel[];
}

export interface SourceTemplateModel {
  id: string;
  title: string;
  publisher?: string;
  date?: string;
  sourceType?: string;
  summary?: string;
  coverUrl?: string | null;
  externalUrl?: string;
  externalLabel?: string;
  breadcrumbs?: readonly BreadcrumbItem[];
  tags?: readonly string[];
  graphConnections?: readonly GraphConnectionGroupModel[];
  metadata: readonly { label: string; value: string }[];
  supportedClaims: readonly ClaimSummaryModel[];
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
  sections: readonly EntityListSectionModel[];
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

export function formatClaimKindLabel(kind: ClaimKind): string {
  switch (kind) {
    case 'fact':
      return 'Fact';
    case 'judgment':
      return 'Judgment';
    case 'value-judgment':
      return 'Value judgment';
  }
}
