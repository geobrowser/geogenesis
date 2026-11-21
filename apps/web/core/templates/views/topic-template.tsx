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
  ClaimSummaryCard,
  RelatedListSection,
  SourceChipList,
  SplitBars,
  TemplateBadge,
  TemplateShell,
  TopicTrendsChart,
} from '../primitives';

export interface TopicTemplateProps {
  model: TopicTemplateModel;
  /** Optional header actions slot (e.g. Follow button, overflow menu on live Geo pages). */
  headerActions?: React.ReactNode;
  /** Optional footer slot (e.g. edit-mode property sheet & backlinks). */
  footer?: React.ReactNode;
  className?: string;
}

const DEFAULT_CONTESTED_PREVIEW = 3;
const DEFAULT_AGREED_PREVIEW = 4;

/**
 * Pure, data-driven Topic page template.
 *
 * Clean, spacious white/black Geo layout sized to Calibre typography with restrained blue/purple touches.
 */
export function TopicTemplate({ model, headerActions, footer, className }: TopicTemplateProps) {
  const [showAllContested, setShowAllContested] = React.useState(false);
  const [showAllAgreed, setShowAllAgreed] = React.useState(false);

  const contested = model.contestedClaims ?? [];
  const visibleContested = showAllContested ? contested : contested.slice(0, DEFAULT_CONTESTED_PREVIEW);

  const agreed = model.agreedClaims ?? [];
  const visibleAgreed = showAllAgreed ? agreed : agreed.slice(0, DEFAULT_AGREED_PREVIEW);

  const communities = model.communities ?? [];
  const activeCommunityId = model.activeCommunityId ?? 'all';
  const activeCommunity = communities.find(community => community.id === activeCommunityId) ?? null;

  return (
    <TemplateShell maxWidth={1120} breadcrumbs={model.breadcrumbs} className={className}>
      {/* Hero header */}
      <header className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <TemplateBadge tone="neutral">Topic</TemplateBadge>
            {model.tags?.map(tag => (
              <TemplateBadge key={tag} tone="neutral">
                {tag}
              </TemplateBadge>
            ))}
          </div>
          {headerActions}
        </div>

        <h1 className="m-0 text-entityTitle text-pretty text-text">{model.title}</h1>

        {model.lede && <p className="m-0 max-w-[800px] text-body text-text/90">{model.lede}</p>}

        {model.stats && model.stats.length > 0 && (
          <dl className="m-0 mt-1 grid grid-cols-2 gap-x-8 gap-y-4 border-y border-divider py-5 @[600px]:flex @[600px]:flex-wrap @[600px]:gap-x-12">
            {model.stats.map(stat => (
              <div key={stat.label} className="flex flex-col gap-0.5">
                <dt className="order-2 text-[14px] text-grey-04">{stat.label}</dt>
                <dd className="order-1 m-0 text-[26px] leading-[30px] font-semibold tracking-[-0.02em] text-text tabular-nums">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </header>

      {/* Community perspective filter bar */}
      {communities.length > 0 && (
        <section aria-label="Community view" className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
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
                    isSelected
                      ? 'border-text bg-text text-white'
                      : 'border-grey-02 bg-white text-text hover:border-text'
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
          </div>
          <p className="m-0 text-[15px] leading-[21px] text-grey-04">
            {activeCommunity
              ? `Viewing ${activeCommunity.name}: claims ordered by what this community pins first.`
              : 'Every number is split by community so turnout alone cannot decide a claim.'}
          </p>
        </section>
      )}

      {/* Contested claims ("Where they split" / "Claims") */}
      {contested.length > 0 && (
        <section aria-label="Contested claims" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="m-0 text-mediumTitle font-semibold text-text">
                {communities.length > 0 ? 'Where they split' : 'Claims'}
              </h2>
              <p className="m-0 text-[15px] text-grey-04">
                {communities.length > 0
                  ? 'Claims where communities disagree most sharply.'
                  : 'Claims linked to this topic.'}
              </p>
            </div>
            {contested.length > DEFAULT_CONTESTED_PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAllContested(prev => !prev)}
                className="cursor-pointer border-0 bg-transparent p-0 text-[15px] font-medium text-ctaPrimary hover:text-ctaHover"
              >
                {showAllContested ? 'Show fewer' : `Show all ${contested.length}`}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 @[680px]:grid-cols-2">
            {visibleContested.map((claim, index) => (
              <ClaimSummaryCard
                key={claim.id}
                claim={claim}
                variant={index === 0 ? 'lead' : 'default'}
                className={index === 0 ? '@[680px]:col-span-2' : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {/* Agreed claims ("Common ground") */}
      {agreed.length > 0 && (
        <section aria-label="Common ground" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="m-0 text-mediumTitle font-semibold text-text">Common ground</h2>
              <p className="m-0 text-[15px] text-grey-04">Claims where a strong majority of each community agrees.</p>
            </div>
            {agreed.length > DEFAULT_AGREED_PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAllAgreed(prev => !prev)}
                className="cursor-pointer border-0 bg-transparent p-0 text-[15px] font-medium text-ctaPrimary hover:text-ctaHover"
              >
                {showAllAgreed ? 'Show fewer' : `Show all ${agreed.length}`}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 @[680px]:grid-cols-2">
            {visibleAgreed.map(claim => (
              <ClaimSummaryCard key={claim.id} claim={claim} variant="agreed" />
            ))}
          </div>
        </section>
      )}

      {/* In each community's own words */}
      {model.communityCases && model.communityCases.length > 0 && (
        <section id="cases" aria-label="In each community’s own words" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-mediumTitle font-semibold text-text">In each community’s own words</h2>
            <p className="m-0 text-[15px] text-grey-04">
              The strongest framing each community puts forward, plus what it concedes.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 @[680px]:grid-cols-2">
            {model.communityCases.map(item => (
              <CommunityCaseCard key={item.community.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* Trends chart (Coverage & Agreement over time) */}
      {model.trends && <TopicTrendsChart trends={model.trends} />}

      {/* How we got here (timeline highlights) */}
      {model.timelineHighlights && model.timelineHighlights.length > 0 && (
        <section aria-label="How we got here" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="m-0 text-mediumTitle font-semibold text-text">How we got here</h2>
              <p className="m-0 text-[15px] text-grey-04">Key turns and the claims attached to each.</p>
            </div>
            {model.timelineHref && (
              <Link
                href={model.timelineHref}
                className="inline-flex items-center gap-1.5 text-[15px] font-medium text-ctaPrimary no-underline hover:text-ctaHover"
              >
                <span>Full timeline</span>
                <ArrowRightIcon className="size-4" />
              </Link>
            )}
          </div>
          <div className="divide-y divide-divider overflow-hidden rounded-xl border border-grey-02/80 bg-white">
            {model.timelineHighlights.map(turn => (
              <TimelineHighlightRow key={turn.id} turn={turn} />
            ))}
          </div>
        </section>
      )}

      {/* Rankings (Best reads, Bridging picks) */}
      {model.rankings && model.rankings.length > 0 && (
        <TopicRankingsSection rankings={model.rankings} communities={communities} />
      )}

      {/* What's spreading (viral posts with bridging context notes) */}
      {model.viralPosts && model.viralPosts.length > 0 && (
        <section aria-label="What’s spreading" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-mediumTitle font-semibold text-text">What’s spreading</h2>
            <p className="m-0 text-[15px] text-grey-04">
              Viral posts linked to this topic and context notes rated helpful across communities.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 @[680px]:grid-cols-2">
            {model.viralPosts.map(post => (
              <ViralPostPreviewCard key={post.id} post={post} />
            ))}
          </div>
        </section>
      )}

      {/* Additional structured sections (Rich Sources, Coverage, Debates, Subtopics) */}
      {model.sections && model.sections.length > 0 && (
        <div className="flex flex-col gap-8">
          {model.sections.map(section => (
            <RelatedListSection key={section.id} section={section} />
          ))}
        </div>
      )}

      {footer}
    </TemplateShell>
  );
}

function CommunityCaseCard({ item }: { item: TopicCommunityCaseModel }) {
  const [sourcesOpen, setSourcesOpen] = React.useState(false);

  return (
    <article className="flex flex-col justify-between gap-4 rounded-xl border border-grey-02/80 bg-white p-5 @[560px]:p-6">
      <div className="flex flex-col gap-4">
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

        <p className="m-0 text-[16px] leading-[25px] text-text/90">{item.summary}</p>
      </div>

      <div className="flex flex-col gap-3">
        {item.concede && (
          <p className="m-0 border-t border-divider pt-3 text-[15px] leading-[22px] text-grey-04">
            <strong className="font-semibold text-text">Concedes:</strong> {item.concede}
          </p>
        )}

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
      </div>
    </article>
  );
}

function TimelineHighlightRow({ turn }: { turn: TopicTimelineHighlightModel }) {
  const header = (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-[14px] font-medium text-grey-04">{turn.when}</span>
      <span className="text-[18px] leading-[24px] font-semibold text-text">{turn.title}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-3.5 px-5 py-5 @[560px]:px-6">
      {turn.href ? (
        <Link href={turn.href} className="text-text no-underline hover:text-ctaPrimary">
          {header}
        </Link>
      ) : turn.onSelect ? (
        <button
          type="button"
          onClick={turn.onSelect}
          className="cursor-pointer border-0 bg-transparent p-0 text-left text-text hover:text-ctaPrimary"
        >
          {header}
        </button>
      ) : (
        header
      )}

      {turn.claims.length > 0 && (
        <div className="grid grid-cols-1 gap-3 @[680px]:grid-cols-2">
          {turn.claims.map(claim => (
            <div key={claim.id} className="flex flex-col gap-2 rounded-lg border border-divider bg-bg p-3.5">
              {claim.href ? (
                <Link
                  href={claim.href}
                  className="text-[15px] leading-[21px] font-medium text-text no-underline hover:text-ctaPrimary"
                >
                  {claim.title}
                </Link>
              ) : claim.onSelect ? (
                <button
                  type="button"
                  onClick={claim.onSelect}
                  className="cursor-pointer border-0 bg-transparent p-0 text-left text-[15px] leading-[21px] font-medium text-text hover:text-ctaPrimary"
                >
                  {claim.title}
                </button>
              ) : (
                <span className="text-[15px] leading-[21px] font-medium text-text">{claim.title}</span>
              )}
              <SplitBars rows={claim.split.rows} density="compact" />
            </div>
          ))}
        </div>
      )}
    </div>
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

  const ranking = rankings.find(item => item.id === activeRankingId) ?? rankings[0];
  if (!ranking) return null;

  const availableScopes = Object.keys(ranking.itemsByCommunity);
  const effectiveScope = availableScopes.includes(activeScope) ? activeScope : (availableScopes[0] ?? 'all');
  const items = ranking.itemsByCommunity[effectiveScope] ?? [];
  const showScopePills = availableScopes.length > 1;

  return (
    <section id="rankings" aria-label="Rankings" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-mediumTitle font-semibold text-text">Rankings</h2>
          <p className="m-0 text-[15px] text-grey-04">{ranking.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {rankings.map(item => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === ranking.id}
              onClick={() => {
                setActiveRankingId(item.id);
                setActiveScope('all');
              }}
              className={cx(
                'cursor-pointer rounded-full border px-4 py-1.5 text-[14px] font-medium transition-colors',
                item.id === ranking.id
                  ? 'border-text bg-text text-white'
                  : 'border-grey-02 bg-white text-text hover:border-text'
              )}
            >
              {item.title}
            </button>
          ))}
        </div>
      </div>

      {showScopePills && (
        <div className="flex flex-wrap gap-2">
          {availableScopes.map(scopeKey => {
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
                    ? 'border-grey-02 bg-grey-01 text-text'
                    : 'border-divider bg-white text-grey-04 hover:border-grey-02 hover:text-text'
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
      )}

      <div className="divide-y divide-divider overflow-hidden rounded-xl border border-grey-02/80 bg-white">
        {items.map(item => {
          const rowInner = (
            <>
              <span className="inline-grid size-7 shrink-0 place-items-center rounded-md bg-grey-01 text-[14px] font-semibold text-grey-04 tabular-nums">
                {item.rank}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[17px] leading-[23px] font-medium text-text">{item.title}</span>
                {item.subtitle && <span className="text-[15px] text-grey-04">{item.subtitle}</span>}
              </span>
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
    </section>
  );
}

function ViralPostPreviewCard({ post }: { post: TopicViralPostPreviewModel }) {
  const classes =
    'group flex h-full w-full flex-col justify-between gap-4 rounded-xl border border-grey-02/80 bg-white p-5 text-left text-text no-underline transition-colors hover:border-text';

  const inner = (
    <>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[16px] font-semibold text-text">{post.authorName}</span>
            {post.authorHandle && <span className="text-[14px] text-grey-04">{post.authorHandle}</span>}
          </div>
          <span className="text-[14px] text-grey-04">
            {[post.platform, post.viewsLabel].filter(Boolean).join(' · ')}
          </span>
        </div>

        <p className="m-0 text-[16px] leading-[24px] text-text/90">{post.body}</p>

        {post.topNote ? (
          <div className="flex flex-col gap-1.5 rounded-lg border border-divider bg-bg p-3.5 text-[15px] leading-[22px]">
            <span className="text-[13px] font-semibold text-purple">{post.topNote.tag}</span>
            <span className="text-text">{post.topNote.text}</span>
          </div>
        ) : (
          <span className="text-[14px] text-grey-04">No context note shown yet</span>
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
