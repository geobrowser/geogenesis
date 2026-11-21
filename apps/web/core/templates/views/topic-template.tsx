'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type {
  TopicCommunityCaseModel,
  TopicRankingModel,
  TopicTemplateModel,
  TopicTimelineHighlightModel,
  TopicViralPostPreviewModel,
} from '../models';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  ClaimExplorer,
  RelatedListSection,
  SourceChipList,
  SplitBars,
  TEMPLATE_CARD_SURFACE,
  TEMPLATE_INTERACTIVE_CARD_SURFACE,
  TemplateBadge,
  TemplateShell,
  TopicTrendsChart,
  TweetIcon,
} from '../primitives';

export interface TopicTemplateProps {
  model: TopicTemplateModel;
  /** Optional header actions slot (e.g. Follow button, overflow menu on live Geo pages). */
  headerActions?: React.ReactNode;
  /** Optional footer slot (e.g. edit-mode property sheet & backlinks). */
  footer?: React.ReactNode;
  className?: string;
}

/**
 * Pure, data-driven Topic page template.
 *
 * Clean, spacious white/black Geo layout sized to Calibre typography with restrained blue/purple touches.
 */
export function TopicTemplate({ model, headerActions, footer, className }: TopicTemplateProps) {
  const contested = model.contestedClaims ?? [];
  const agreed = model.agreedClaims ?? [];

  const communities = model.communities ?? [];
  const activeCommunityId = model.activeCommunityId ?? 'all';

  const inlineStats = model.stats?.filter(stat => Boolean(stat.value)) ?? [];

  return (
    <TemplateShell maxWidth={1120} breadcrumbs={model.breadcrumbs} className={className}>
      {/* Hero header */}
      <header className="flex flex-col gap-5">
        {model.coverUrl && (
          <div className={cx('overflow-hidden', TEMPLATE_CARD_SURFACE)}>
            <img src={model.coverUrl} alt={model.title} className="max-h-[280px] w-full object-cover" />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <TemplateBadge tone="neutral">Topic</TemplateBadge>
            {model.tags?.map(tag => (
              <TemplateBadge key={tag} tone="neutral">
                {tag}
              </TemplateBadge>
            ))}
            {inlineStats.length > 0 && (
              <span className="text-[14px] text-grey-04">
                {inlineStats.map(stat => `${stat.value} ${stat.label.toLowerCase()}`).join(' · ')}
              </span>
            )}
          </div>
          {headerActions}
        </div>

        <h1 className="m-0 text-entityTitle text-pretty text-text">{model.title}</h1>

        {model.lede && <p className="m-0 max-w-[780px] text-[16.5px] leading-[25px] text-text/85">{model.lede}</p>}

        {/* In each community's own words — placed right up top so the page immediately frames both perspectives */}
        {model.communityCases && model.communityCases.length > 0 && (
          <section id="cases" aria-label="In each community’s own words" className="mt-2 flex flex-col gap-3">
            <span className="text-[13px] font-semibold tracking-[0.04em] text-grey-04 uppercase">
              In each community’s own words
            </span>
            <div className="grid grid-cols-1 gap-4 @[680px]:grid-cols-2">
              {model.communityCases.map(item => (
                <CommunityCaseCard key={item.community.id} item={item} />
              ))}
            </div>
          </section>
        )}
      </header>

      {/* Community perspective filter bar */}
      {communities.length > 0 && (
        <section aria-label="Community view" className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={activeCommunityId === 'all'}
            onClick={() => model.onSelectCommunity?.('all')}
            className={cx(
              'inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border px-4 text-[15px] font-medium whitespace-nowrap transition-colors',
              activeCommunityId === 'all'
                ? 'border-text bg-text text-white'
                : 'border-grey-02 bg-white text-text hover:border-text'
            )}
          >
            <span>Everyone</span>
          </button>

          {communities.map(community => {
            const isSelected = activeCommunityId === community.id;
            return (
              <button
                key={community.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => model.onSelectCommunity?.(community.id)}
                className={cx(
                  'inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border px-4 text-[15px] font-medium whitespace-nowrap transition-colors',
                  isSelected ? 'border-text bg-text text-white' : 'border-grey-02 bg-white text-text hover:border-text'
                )}
              >
                <span
                  aria-hidden
                  className="inline-block size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: community.color }}
                />
                <span>{community.name}</span>
                {community.memberCount !== undefined && (
                  <span className={cx('text-[14px] tabular-nums', isSelected ? 'text-grey-03' : 'text-grey-04')}>
                    {community.memberCount.toLocaleString('en-US')}
                  </span>
                )}
              </button>
            );
          })}
        </section>
      )}

      {/* Calm single-column Claims list with 2-tab switch (Where they split | Common ground) */}
      {(contested.length > 0 || agreed.length > 0) && (
        <ClaimExplorer contestedClaims={contested} agreedClaims={agreed} title="Claims" />
      )}

      {/* Timeline (rendered open directly on the page, above trends) */}
      {model.timelineHighlights && model.timelineHighlights.length > 0 && (
        <section id="timeline" aria-label="Timeline" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="m-0 text-mediumTitle font-semibold text-text">Timeline</h2>
            {model.timelineHref ? (
              <Link
                href={model.timelineHref}
                className="inline-flex items-center gap-1.5 text-[15px] font-medium text-ctaPrimary no-underline hover:text-ctaHover"
              >
                <span>Full timeline</span>
                <ArrowRightIcon className="size-4" />
              </Link>
            ) : model.onOpenTimeline ? (
              <button
                type="button"
                onClick={model.onOpenTimeline}
                className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[15px] font-medium text-ctaPrimary hover:text-ctaHover"
              >
                <span>Full timeline</span>
                <ArrowRightIcon className="size-4" />
              </button>
            ) : null}
          </div>
          <ol className="m-0 flex list-none flex-col p-0">
            {model.timelineHighlights.map((turn, idx) => (
              <TimelineHighlightRow
                key={turn.id}
                turn={turn}
                isFirst={idx === 0}
                isLast={idx === (model.timelineHighlights?.length ?? 0) - 1}
              />
            ))}
          </ol>
        </section>
      )}

      {/* Sources & evidence (and additional structured sections) */}
      {model.sections && model.sections.length > 0 && (
        <div id="sources-section" className="flex flex-col gap-8">
          {model.sections.map(section => (
            <RelatedListSection key={section.id} section={section} />
          ))}
        </div>
      )}

      {/* Trends chart (Coverage & Agreement over time) */}
      {model.trends && (
        <div id="trends">
          <TopicTrendsChart trends={model.trends} />
        </div>
      )}

      {/* Rankings (Best reads, Best debates, Bridging picks) */}
      {model.rankings && model.rankings.length > 0 && (
        <TopicRankingsSection rankings={model.rankings} communities={communities} />
      )}

      {/* What's spreading (viral posts with bridging context notes) */}
      {model.viralPosts && model.viralPosts.length > 0 && <ViralPostsSection posts={model.viralPosts} />}

      {footer}
    </TemplateShell>
  );
}

function CommunityCaseCard({ item }: { item: TopicCommunityCaseModel }) {
  const [sourcesOpen, setSourcesOpen] = React.useState(false);

  return (
    <article
      className={cx(
        'relative flex flex-col justify-between gap-4 overflow-hidden p-5 @[560px]:p-6',
        TEMPLATE_CARD_SURFACE
      )}
    >
      {/* Subtle 2.5px top accent bar */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ backgroundColor: item.community.color }}
      />

      <div className="flex flex-col gap-3.5 pt-0.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="inline-block size-3 shrink-0 rounded-full"
              style={{ backgroundColor: item.community.color }}
            />
            <h3 className="m-0 text-[19px] leading-[24px] font-semibold text-text">{item.community.name}</h3>
            {item.community.memberCount !== undefined && (
              <span className="text-[14px] text-grey-04 tabular-nums">
                {item.community.memberCount.toLocaleString('en-US')}
                {item.isMember ? ', including you' : ''}
              </span>
            )}
          </div>

          {item.onToggleMembership && (
            <button
              type="button"
              onClick={item.onToggleMembership}
              className={cx(
                'inline-flex h-9 cursor-pointer items-center rounded-full border px-4 text-[14px] font-medium transition-colors',
                item.isMember
                  ? 'border-grey-02 bg-white text-text hover:border-text'
                  : 'border-text bg-text text-white hover:opacity-90'
              )}
            >
              {item.isMember ? 'Leave' : `Join ${item.community.shortName}`}
            </button>
          )}
        </div>

        <p className="m-0 text-[15px] leading-[23px] text-text/85">{item.summary}</p>
      </div>

      <div className="flex flex-col gap-3">
        {item.sources.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              aria-expanded={sourcesOpen}
              onClick={() => setSourcesOpen(prev => !prev)}
              className="cursor-pointer self-start border-0 bg-transparent p-0 text-[14px] font-medium text-ctaPrimary hover:text-ctaHover"
            >
              {sourcesOpen ? 'Hide sources' : `Sources this case cites (${item.sources.length})`}
            </button>
            {sourcesOpen && <SourceChipList sources={item.sources} />}
          </div>
        )}

        {item.concede && (
          <div className="flex flex-col gap-1 rounded-lg bg-grey-01/80 px-4 py-3 text-[14.5px] leading-[21px] text-text/85">
            <span className="text-[12px] font-semibold tracking-[0.04em] text-grey-04 uppercase">They’d concede</span>
            <span>{item.concede}</span>
          </div>
        )}
      </div>
    </article>
  );
}

function TimelineHighlightRow({
  turn,
  isFirst,
  isLast,
}: {
  turn: TopicTimelineHighlightModel;
  isFirst: boolean;
  isLast: boolean;
}) {
  const titleNode = <span className="text-[17px] leading-[23px] font-semibold text-text">{turn.title}</span>;

  return (
    <li className="grid grid-cols-1 gap-2 @[680px]:grid-cols-[118px_28px_minmax(0,1fr)] @[680px]:gap-4">
      {/* Left date */}
      <div className="pt-4 text-[14px] font-semibold text-grey-04 @[680px]:pt-5 @[680px]:text-right">{turn.when}</div>

      {/* Continuous vertical timeline spine directly on page */}
      <div className="relative hidden justify-center @[680px]:flex">
        {!isFirst && <span aria-hidden className="absolute top-0 h-[26px] w-[2px] bg-grey-02/80" />}
        {!isLast && <span aria-hidden className="absolute top-[26px] bottom-0 w-[2px] bg-grey-02/80" />}
        <span
          aria-hidden
          className="relative z-10 mt-[21px] inline-block size-3 shrink-0 rounded-full bg-text ring-4 ring-white"
        />
      </div>

      {/* Right: event title + clean stacked claim rows with aligned right bars */}
      <div className={cx('flex min-w-0 flex-col gap-3 py-4 @[680px]:py-5', !isLast && 'border-b border-divider/90')}>
        {turn.href ? (
          <Link href={turn.href} className="text-text no-underline hover:text-ctaPrimary">
            {titleNode}
          </Link>
        ) : turn.onSelect ? (
          <button
            type="button"
            onClick={turn.onSelect}
            className="cursor-pointer border-0 bg-transparent p-0 text-left text-text hover:text-ctaPrimary"
          >
            {titleNode}
          </button>
        ) : (
          titleNode
        )}

        {turn.claims.length > 0 && (
          <div className="flex flex-col divide-y divide-divider/80">
            {turn.claims.map(claim => {
              const isAgreed = !claim.split.isSplit;
              return (
                <div
                  key={claim.id}
                  className="grid grid-cols-1 items-center gap-2.5 py-2.5 first:pt-0.5 last:pb-0 @[740px]:grid-cols-[minmax(0,1fr)_270px] @[740px]:gap-5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {claim.href ? (
                      <Link
                        href={claim.href}
                        className="text-[15.5px] leading-[22px] font-medium text-text no-underline hover:text-ctaPrimary"
                      >
                        {claim.title}
                      </Link>
                    ) : claim.onSelect ? (
                      <button
                        type="button"
                        onClick={claim.onSelect}
                        className="cursor-pointer border-0 bg-transparent p-0 text-left text-[15.5px] leading-[22px] font-medium text-text hover:text-ctaPrimary"
                      >
                        {claim.title}
                      </button>
                    ) : (
                      <span className="text-[15.5px] leading-[22px] font-medium text-text">{claim.title}</span>
                    )}
                    {isAgreed ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-ctaTertiary px-2 py-0.5 text-[12.5px] font-medium text-ctaPrimary">
                        <CheckCircleIcon className="size-3.5" />
                        <span>Both agree</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-purple-tint/70 px-2 py-0.5 text-[12.5px] font-medium text-purple">
                        Communities split
                      </span>
                    )}
                  </div>
                  <SplitBars rows={claim.split.rows} density="compact" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </li>
  );
}

function TopicRankingsSection({
  rankings,
  communities,
}: {
  rankings: readonly TopicRankingModel[];
  communities: NonNullable<TopicTemplateModel['communities']>;
}) {
  const [activeRankingId, setActiveRankingId] = React.useState(rankings[0]?.id ?? '');
  const [activeScope, setActiveScope] = React.useState<string>('all');
  const [suggestOpen, setSuggestOpen] = React.useState(false);
  const [suggestText, setSuggestText] = React.useState('');

  const ranking = rankings.find(item => item.id === activeRankingId) ?? rankings[0];
  if (!ranking) return null;

  const availableScopes = Object.keys(ranking.itemsByCommunity);
  const effectiveScope = availableScopes.includes(activeScope) ? activeScope : (availableScopes[0] ?? 'all');
  const items = ranking.itemsByCommunity[effectiveScope] ?? [];
  const showScopePills = availableScopes.length > 1;

  const handleSuggestSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (suggestText.trim().length < 3) return;
    ranking.onSuggestItem?.(suggestText.trim());
    setSuggestText('');
    setSuggestOpen(false);
  };

  return (
    <section id="rankings" aria-label="Rankings" className="flex flex-col gap-4">
      <h2 className="m-0 text-mediumTitle font-semibold text-text">Rankings</h2>

      {/* 3-across visual ranking deck selector cards */}
      {rankings.length > 1 && (
        <div className="grid grid-cols-1 gap-3.5 @[680px]:grid-cols-3">
          {rankings.map(item => {
            const isActive = item.id === ranking.id;
            const totalItems = item.itemsByCommunity.all?.length ?? 0;
            const isMulti = Object.keys(item.itemsByCommunity).length > 1;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => {
                  setActiveRankingId(item.id);
                  setActiveScope('all');
                  setSuggestOpen(false);
                }}
                className={cx(
                  'flex cursor-pointer flex-col justify-between gap-2.5 p-4 text-left transition-all',
                  isActive
                    ? 'rounded-xl border border-black/[0.14] bg-white shadow-[0_14px_38px_-6px_rgba(0,0,0,0.1),0_3px_10px_-2px_rgba(0,0,0,0.04)]'
                    : TEMPLATE_INTERACTIVE_CARD_SURFACE
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <TemplateBadge tone={isActive ? 'dark' : 'neutral'}>{item.title}</TemplateBadge>
                  <span className="text-[13.5px] font-medium text-grey-04 tabular-nums">{totalItems} items</span>
                </div>
                <p className="m-0 line-clamp-2 text-[14.5px] leading-[20px] text-grey-04">{item.subtitle}</p>
                <span className="text-[13px] font-medium text-text/70">
                  {isMulti ? 'Everyone & by community' : 'Ranked across communities'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected ranking panel */}
      <div className={cx('flex flex-col overflow-hidden', TEMPLATE_CARD_SURFACE)}>
        {(showScopePills || ranking.onSuggestItem) && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider px-5 py-3.5">
            <div className="flex flex-wrap items-center gap-2">
              {showScopePills &&
                availableScopes.map(scopeKey => {
                  const community = communities.find(c => c.id === scopeKey);
                  const label = scopeKey === 'all' ? 'Everyone' : (community?.name ?? scopeKey);
                  return (
                    <button
                      key={scopeKey}
                      type="button"
                      aria-pressed={effectiveScope === scopeKey}
                      onClick={() => setActiveScope(scopeKey)}
                      className={cx(
                        'inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-[14px] font-medium transition-colors',
                        effectiveScope === scopeKey
                          ? 'border-text bg-text text-white'
                          : 'border-grey-02 bg-white text-text hover:border-text'
                      )}
                    >
                      {community && (
                        <span
                          aria-hidden
                          className="inline-block size-2 rounded-full"
                          style={{ backgroundColor: community.color }}
                        />
                      )}
                      {label}
                    </button>
                  );
                })}
            </div>

            {ranking.onSuggestItem && !suggestOpen && (
              <button
                type="button"
                onClick={() => setSuggestOpen(true)}
                className="inline-flex h-9 cursor-pointer items-center rounded-full border border-text bg-text px-4 text-[14px] font-medium text-white hover:opacity-90"
              >
                + Add to this ranking
              </button>
            )}
          </div>
        )}

        {suggestOpen && ranking.onSuggestItem && (
          <form
            onSubmit={handleSuggestSubmit}
            className="flex flex-col gap-2.5 border-b border-divider bg-bg px-5 py-4 @[560px]:flex-row @[560px]:items-center"
          >
            <input
              type="text"
              value={suggestText}
              onChange={e => setSuggestText(e.target.value)}
              placeholder={ranking.suggestPlaceholder ?? 'Paste a link or type a title...'}
              className="flex-1 rounded-lg border border-grey-02 bg-white px-3 py-2 text-[15px] text-text focus:border-text focus:outline-hidden"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="inline-flex h-9 cursor-pointer items-center rounded-full border border-text bg-text px-4 text-[14px] font-medium text-white hover:opacity-90"
              >
                Suggest
              </button>
              <button
                type="button"
                onClick={() => setSuggestOpen(false)}
                className="cursor-pointer border-0 bg-transparent px-2 text-[14px] text-grey-04 hover:text-text"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="divide-y divide-divider">
          {items.map(item => {
            const isUp = item.rankDelta?.startsWith('▲');
            const isDown = item.rankDelta?.startsWith('▼');

            const rowInner = (
              <>
                <span className="w-6 shrink-0 text-center text-[15px] font-semibold text-grey-04 tabular-nums">
                  {item.rank > 0 ? item.rank : '+'}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[16px] leading-[22px] font-medium text-text">{item.title}</span>
                  {item.subtitle && <span className="text-[14.5px] text-grey-04">{item.subtitle}</span>}
                </span>
                {item.rankDelta && (
                  <span
                    className={cx(
                      'shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-semibold tabular-nums',
                      isUp
                        ? 'bg-ctaTertiary text-ctaPrimary'
                        : isDown
                          ? 'bg-grey-01 text-grey-04'
                          : 'bg-purple-tint text-purple'
                    )}
                  >
                    {item.rankDelta}
                  </span>
                )}
                {item.tag && <TemplateBadge tone="fact">{item.tag}</TemplateBadge>}
                {item.metric && (
                  <span className="shrink-0 text-[14px] font-medium text-grey-04 tabular-nums">{item.metric}</span>
                )}
              </>
            );

            const classes =
              'flex w-full items-center gap-3.5 px-5 py-4 text-left text-text no-underline transition-colors hover:bg-bg';

            if (item.href) {
              return (
                <Link key={item.id} href={item.href} className={classes}>
                  {rowInner}
                </Link>
              );
            }
            if (item.onSelect) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onSelect}
                  className={`${classes} cursor-pointer border-0 bg-transparent`}
                >
                  {rowInner}
                </button>
              );
            }
            return (
              <div key={item.id} className={classes}>
                {rowInner}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ViralPostsSection({ posts }: { posts: readonly TopicViralPostPreviewModel[] }) {
  const [filter, setFilter] = React.useState<'all' | 'need' | 'wait'>('all');
  const hasFilters = posts.some(post => post.needsContext || post.waitingForRatings);

  const visible = React.useMemo(() => {
    if (filter === 'need') return posts.filter(post => post.needsContext);
    if (filter === 'wait') return posts.filter(post => post.waitingForRatings);
    return posts;
  }, [filter, posts]);

  return (
    <section id="spreading" aria-label="What’s spreading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-mediumTitle font-semibold text-text">What’s spreading</h2>

        {hasFilters && (
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'need', label: 'No context yet' },
                { id: 'wait', label: 'Needs ratings' },
              ] as const
            ).map(option => (
              <button
                key={option.id}
                type="button"
                aria-pressed={filter === option.id}
                onClick={() => setFilter(option.id)}
                className={cx(
                  'cursor-pointer rounded-full border px-3.5 py-1.5 text-[14px] font-medium transition-colors',
                  filter === option.id
                    ? 'border-text bg-text text-white'
                    : 'border-grey-02 bg-white text-text hover:border-text'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="m-0 rounded-xl border border-dashed border-grey-02 p-5 text-[15px] text-grey-04">
          No posts match this filter right now.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 @[680px]:grid-cols-2">
          {visible.map(post => (
            <ViralPostPreviewCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </section>
  );
}

function ViralPostPreviewCard({ post }: { post: TopicViralPostPreviewModel }) {
  const classes = cx(
    'group flex h-full w-full flex-col justify-between gap-4 p-5 text-left text-text no-underline',
    TEMPLATE_INTERACTIVE_CARD_SURFACE
  );

  const initials = post.authorName
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0] ?? '')
    .join('')
    .toUpperCase();

  const inner = (
    <>
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-grid size-9 shrink-0 place-items-center rounded-full bg-grey-01 text-[13px] font-semibold text-text">
              {initials}
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[15.5px] leading-[19px] font-semibold text-text">{post.authorName}</span>
              {post.authorHandle && (
                <span className="truncate text-[13.5px] leading-[17px] text-grey-04">{post.authorHandle}</span>
              )}
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[13.5px] text-grey-04">
            {post.platform === 'X' ? <TweetIcon className="size-3.5 text-text" /> : null}
            <span>{[post.platform !== 'X' ? post.platform : null, post.viewsLabel].filter(Boolean).join(' · ')}</span>
          </span>
        </div>

        <p className="m-0 text-[15px] leading-[23px] text-text">{post.body}</p>

        {post.topNote ? (
          <div className="flex flex-col gap-1.5 rounded-lg bg-grey-01/80 p-3.5 text-[14.5px] leading-[21px]">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-purple">{post.topNote.tag}</span>
              <span className="text-[13px] text-grey-04">Shown to everyone</span>
            </div>
            <span className="text-text/90">{post.topNote.text}</span>
          </div>
        ) : (
          <div className="rounded-lg bg-grey-01/60 px-3.5 py-2.5 text-[14px] text-grey-04">
            No context note shown yet · be the first to add one
          </div>
        )}
      </div>

      <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-ctaPrimary group-hover:text-ctaHover">
        <span>
          {post.noteCount === 0
            ? 'Open post to add context'
            : `Read ${post.noteCount} context ${post.noteCount === 1 ? 'note' : 'notes'} & ratings`}
        </span>
        <ArrowRightIcon className="size-4" />
      </span>
    </>
  );

  if (post.href) {
    return (
      <Link href={post.href} className={classes}>
        {inner}
      </Link>
    );
  }
  if (post.onSelect) {
    return (
      <button type="button" onClick={post.onSelect} className={`${classes} cursor-pointer`}>
        {inner}
      </button>
    );
  }
  return <article className={classes}>{inner}</article>;
}
