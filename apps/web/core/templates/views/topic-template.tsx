'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { TopicCommunityCaseModel, TopicTemplateModel, TopicTimelineHighlightModel } from '../models';
import {
  ClaimSummaryCard,
  RelatedListSection,
  SourceChipList,
  SplitBars,
  TemplateBadge,
  TemplateShell,
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
 * Renders only the sections populated on `model`:
 * - Live Tier-1 Geo topics render header, breadcrumbs, stats, claims, and coverage/debates sections.
 * - Full-featured topics (or prototype fixtures) additionally render community perspective chips,
 *   community cases, and timeline highlights.
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
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
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

        {model.lede && <p className="m-0 max-w-[760px] text-[18px] leading-[28px] text-text/90">{model.lede}</p>}

        {model.stats && model.stats.length > 0 && (
          <dl className="m-0 mt-1 flex flex-wrap gap-x-7 gap-y-3">
            {model.stats.map(stat => (
              <div key={stat.label} className="flex flex-col">
                <dt className="order-2 text-[13px] text-grey-04">{stat.label}</dt>
                <dd className="order-1 m-0 text-[22px] leading-[26px] font-semibold text-text tabular-nums">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </header>

      {/* Community perspective filter bar (rendered only when communities exist) */}
      {communities.length > 0 && (
        <section aria-label="Community view" className="flex flex-col gap-2 border-y border-divider bg-white/95 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={activeCommunityId === 'all'}
              onClick={() => model.onSelectCommunity?.('all')}
              className={cx(
                'inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[14px] whitespace-nowrap transition-colors',
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
                    'inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[14px] whitespace-nowrap transition-colors',
                    isSelected
                      ? 'border-text bg-text text-white'
                      : 'border-grey-02 bg-white text-text hover:border-text'
                  )}
                >
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: community.color }}
                  />
                  <span>{community.name}</span>
                  {community.memberCount !== undefined && (
                    <span className={cx('text-[12px] tabular-nums', isSelected ? 'text-grey-03' : 'text-grey-04')}>
                      {community.memberCount.toLocaleString('en-US')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="m-0 text-[13px] leading-[18px] text-grey-04">
            {activeCommunity
              ? `Viewing ${activeCommunity.name}: claims ordered by what this community pins first.`
              : 'Every number is split by community so turnout alone cannot decide a claim.'}
          </p>
        </section>
      )}

      {/* Contested claims ("Where they split" / "Claims") */}
      {contested.length > 0 && (
        <section aria-label="Contested claims" className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h2 className="m-0 text-mediumTitle text-text">
                {communities.length > 0 ? 'Where they split' : 'Claims'}
              </h2>
              <p className="m-0 text-[14px] text-grey-04">
                {communities.length > 0
                  ? 'Claims where communities disagree most sharply.'
                  : 'Claims linked to this topic.'}
              </p>
            </div>
            {contested.length > DEFAULT_CONTESTED_PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAllContested(prev => !prev)}
                className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium text-ctaPrimary hover:text-ctaHover"
              >
                {showAllContested ? 'Show fewer' : `Show all ${contested.length}`}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3.5 @[680px]:grid-cols-2">
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
        <section aria-label="Common ground" className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h2 className="m-0 text-mediumTitle text-text">Common ground</h2>
              <p className="m-0 text-[14px] text-grey-04">Claims where a strong majority of each community agrees.</p>
            </div>
            {agreed.length > DEFAULT_AGREED_PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAllAgreed(prev => !prev)}
                className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium text-ctaPrimary hover:text-ctaHover"
              >
                {showAllAgreed ? 'Show fewer' : `Show all ${agreed.length}`}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 @[680px]:grid-cols-2">
            {visibleAgreed.map(claim => (
              <ClaimSummaryCard key={claim.id} claim={claim} variant="agreed" />
            ))}
          </div>
        </section>
      )}

      {/* In each community's own words */}
      {model.communityCases && model.communityCases.length > 0 && (
        <section id="cases" aria-label="In each community’s own words" className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h2 className="m-0 text-mediumTitle text-text">In each community’s own words</h2>
            <p className="m-0 text-[14px] text-grey-04">
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

      {/* How we got here (timeline highlights) */}
      {model.timelineHighlights && model.timelineHighlights.length > 0 && (
        <section aria-label="How we got here" className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h2 className="m-0 text-mediumTitle text-text">How we got here</h2>
              <p className="m-0 text-[14px] text-grey-04">Key turns and the claims attached to each.</p>
            </div>
            {model.timelineHref && (
              <Link
                href={model.timelineHref}
                className="text-[14px] font-medium text-ctaPrimary no-underline hover:text-ctaHover"
              >
                Full timeline →
              </Link>
            )}
          </div>
          <div className="divide-y divide-divider overflow-hidden rounded-xl border border-grey-02/70 bg-white">
            {model.timelineHighlights.map(turn => (
              <TimelineHighlightRow key={turn.id} turn={turn} />
            ))}
          </div>
        </section>
      )}

      {/* Additional structured sections (Coverage, Debates, Sources, Subtopics) */}
      {model.sections && model.sections.length > 0 && (
        <div className="flex flex-col gap-6">
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
    <article className="flex flex-col gap-3 rounded-xl border border-grey-02/80 bg-white p-4 @[560px]:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-3 w-3 shrink-0 rounded-[3px]"
            style={{ backgroundColor: item.community.color }}
          />
          <h3 className="m-0 text-[17px] leading-[22px] font-semibold text-text">{item.community.name}</h3>
          {item.community.memberCount !== undefined && (
            <span className="text-[13px] text-grey-04">
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
              'inline-flex h-8 cursor-pointer items-center rounded-full border px-3 text-[13px] font-medium transition-colors',
              item.isMember
                ? 'border-grey-02 bg-white text-text hover:border-text'
                : 'border-text bg-text text-white hover:opacity-90'
            )}
          >
            {item.isMember ? 'Leave' : `Join ${item.community.shortName}`}
          </button>
        )}
      </div>

      <p className="m-0 text-[15px] leading-[22px] text-text">{item.summary}</p>

      {item.concede && (
        <p className="m-0 rounded-lg bg-grey-01 px-3 py-2 text-[13px] leading-[18px] text-grey-05">
          <strong className="font-semibold text-text">Concedes:</strong> {item.concede}
        </p>
      )}

      {item.sources.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={sourcesOpen}
            onClick={() => setSourcesOpen(prev => !prev)}
            className="cursor-pointer self-start border-0 bg-transparent p-0 text-[13px] font-medium text-ctaPrimary hover:text-ctaHover"
          >
            {sourcesOpen ? 'Hide sources' : `Sources this case cites (${item.sources.length})`}
          </button>
          {sourcesOpen && <SourceChipList sources={item.sources} />}
        </div>
      )}
    </article>
  );
}

function TimelineHighlightRow({ turn }: { turn: TopicTimelineHighlightModel }) {
  const header = (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-[12px] font-semibold tracking-wide text-grey-04 uppercase">{turn.when}</span>
      <span className="text-[16px] leading-[22px] font-semibold text-text">{turn.title}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 @[560px]:px-5">
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
        <div className="grid grid-cols-1 gap-2 @[680px]:grid-cols-2">
          {turn.claims.map(claim => (
            <div key={claim.id} className="flex flex-col gap-1.5 rounded-lg bg-grey-01/70 p-2.5">
              {claim.href ? (
                <Link
                  href={claim.href}
                  className="text-[13px] leading-[18px] font-medium text-text no-underline hover:text-ctaPrimary"
                >
                  {claim.title}
                </Link>
              ) : claim.onSelect ? (
                <button
                  type="button"
                  onClick={claim.onSelect}
                  className="cursor-pointer border-0 bg-transparent p-0 text-left text-[13px] leading-[18px] font-medium text-text hover:text-ctaPrimary"
                >
                  {claim.title}
                </button>
              ) : (
                <span className="text-[13px] leading-[18px] font-medium text-text">{claim.title}</span>
              )}
              <SplitBars rows={claim.split.rows} density="compact" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
