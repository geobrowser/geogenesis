'use client';

import * as React from 'react';

import Link from 'next/link';

import {
  type ClaimKind,
  type ClaimTemplateModel,
  type StrongestCaseModel,
  type SubClaimFactModel,
  formatClaimKindLabel,
} from '../models';
import {
  CheckCircleIcon,
  ChevronRightIcon,
  GraphConnectionsStrip,
  RelatedListSection,
  SourceChipList,
  SplitBars,
  TEMPLATE_CARD_SURFACE,
  TemplateBadge,
  type TemplateBadgeTone,
  TemplateShell,
  VoteBox,
} from '../primitives';

const CLAIM_KIND_TONE: Record<ClaimKind, TemplateBadgeTone> = {
  fact: 'fact',
  judgment: 'judgment',
  'value-judgment': 'value',
};

export interface ClaimTemplateProps {
  model: ClaimTemplateModel;
  /** Optional header actions slot (e.g. share, overflow menu, history on live Geo pages). */
  headerActions?: React.ReactNode;
  /** Optional footer slot (e.g. edit-mode property sheet & backlinks). */
  footer?: React.ReactNode;
  className?: string;
}

/**
 * Pure, data-driven Claim page template.
 *
 * Editorial white/black layout with restrained Geo blue/purple accents and Calibre-scaled typography.
 */
export function ClaimTemplate({ model, headerActions, footer, className }: ClaimTemplateProps) {
  const isSplit = model.split.isSplit;

  return (
    <TemplateShell maxWidth={860} breadcrumbs={model.breadcrumbs} className={className}>
      {/* Header */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <TemplateBadge tone={isSplit ? 'split' : 'agreed'}>
              {isSplit ? 'Contested claim' : 'Agreed claim'}
            </TemplateBadge>
            <TemplateBadge tone={CLAIM_KIND_TONE[model.kind]}>{formatClaimKindLabel(model.kind)}</TemplateBadge>
            {isSplit && model.split.gapPoints !== undefined && (
              <TemplateBadge tone="neutral">{Math.round(model.split.gapPoints)} pts apart</TemplateBadge>
            )}
            {model.debateCount !== undefined && model.debateCount > 0 && (
              <DebateCountPill count={model.debateCount} href={model.debatesHref} onSelect={model.onOpenDebates} />
            )}
          </div>
          {headerActions}
        </div>

        <h1 className="m-0 text-entityTitle text-pretty text-text">{model.title}</h1>
      </header>

      {/* Vote box + community split bars */}
      <VoteBox split={model.split} control={model.voteBox} />

      {/* Typed graph connections */}
      {model.graphConnections && model.graphConnections.length > 0 && (
        <GraphConnectionsStrip groups={model.graphConnections} />
      )}

      {/* Agreed basis (clean soft-shadow editorial panel) */}
      {model.agreedBasis && (
        <section
          aria-label="What both communities agree on"
          className={`flex flex-col gap-4 p-5 @[560px]:p-6 ${TEMPLATE_CARD_SURFACE}`}
        >
          <div className="flex items-center gap-2 text-ctaPrimary">
            <CheckCircleIcon className="size-5" />
            <h2 className="m-0 text-smallTitle text-text">What both communities agree on</h2>
          </div>
          <p className="m-0 text-[15.5px] leading-[24px] text-text/85">{model.agreedBasis.summary}</p>
          {model.agreedBasis.settlingSources.length > 0 && (
            <div className="flex flex-col gap-2.5 border-t border-divider pt-4">
              <span className="text-[14px] font-medium text-grey-04">Sources that settled it</span>
              <SourceChipList sources={model.agreedBasis.settlingSources} />
            </div>
          )}
        </section>
      )}

      {/* Key stat callout */}
      {model.keyStat && (
        <section aria-label="Key evidence" className={`flex flex-col gap-3 p-5 ${TEMPLATE_CARD_SURFACE}`}>
          <p className="m-0 text-[15.5px] leading-[24px] text-text">{model.keyStat.text}</p>
          <SourceChipList sources={model.keyStat.sources} />
        </section>
      )}

      {/* Underlying facts / sub-claims — unified editorial container with 2-column rows */}
      {model.subClaims && model.subClaims.length > 0 && (
        <section aria-label="The facts it turns on" className="flex flex-col gap-4">
          <h2 className="m-0 text-mediumTitle font-semibold text-text">The facts it turns on</h2>
          <div className={`divide-y divide-divider overflow-hidden ${TEMPLATE_CARD_SURFACE}`}>
            {model.subClaims.map(fact => (
              <SubClaimFactRow key={fact.id} fact={fact} />
            ))}
          </div>
        </section>
      )}

      {/* Strongest cases */}
      {model.strongestCases && model.strongestCases.length > 0 && (
        <section aria-label="Strongest cases" className="flex flex-col gap-4">
          <h2 className="m-0 text-mediumTitle font-semibold text-text">Strongest cases</h2>
          <div className="grid grid-cols-1 gap-4 @[640px]:grid-cols-2">
            {model.strongestCases.map(item => (
              <StrongestCaseCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* Related entity lists (Parent claim, Events, In the news, Sources, Debates, Topics) */}
      {model.sections.length > 0 && (
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

function DebateCountPill({ count, href, onSelect }: { count: number; href?: string; onSelect?: () => void }) {
  const text = `${count} ${count === 1 ? 'debate' : 'debates'}`;
  const classes =
    'inline-flex h-7 items-center gap-1 rounded-md border border-ctaPrimary/15 bg-ctaTertiary px-2.5 text-[14px] leading-none font-medium text-ctaPrimary no-underline transition-colors hover:bg-ctaPrimary hover:text-white';

  if (href) {
    return (
      <Link href={href} className={classes}>
        <span>{text}</span>
        <ChevronRightIcon className="size-3.5" />
      </Link>
    );
  }

  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} className={`${classes} cursor-pointer`}>
        <span>{text}</span>
        <ChevronRightIcon className="size-3.5" />
      </button>
    );
  }

  return <TemplateBadge tone="neutral">{text}</TemplateBadge>;
}

function SubClaimFactRow({ fact }: { fact: SubClaimFactModel }) {
  return (
    <article className="grid grid-cols-1 items-start gap-4 p-5 @[680px]:grid-cols-[minmax(0,1fr)_270px] @[680px]:gap-6 @[680px]:p-6">
      <div className="flex min-w-0 flex-col gap-2.5">
        {fact.href ? (
          <Link
            href={fact.href}
            className="text-[17px] leading-[23px] font-semibold text-text no-underline hover:text-ctaPrimary"
          >
            {fact.title}
          </Link>
        ) : fact.onSelect ? (
          <button
            type="button"
            onClick={fact.onSelect}
            className="cursor-pointer border-0 bg-transparent p-0 text-left text-[17px] leading-[23px] font-semibold text-text hover:text-ctaPrimary"
          >
            {fact.title}
          </button>
        ) : (
          <h3 className="m-0 text-[17px] leading-[23px] font-semibold text-text">{fact.title}</h3>
        )}

        {fact.stat && <p className="m-0 text-[15px] leading-[22px] text-grey-04">{fact.stat}</p>}

        {fact.sources.length > 0 && <SourceChipList sources={fact.sources} className="pt-0.5" />}
      </div>

      <div className="@[680px]:pt-1">
        <SplitBars rows={fact.split.rows} density="compact" />
      </div>
    </article>
  );
}

function StrongestCaseCard({ item }: { item: StrongestCaseModel }) {
  return (
    <article
      className={`relative flex flex-col justify-between gap-4 overflow-hidden p-5 @[560px]:p-6 ${TEMPLATE_CARD_SURFACE}`}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: item.accentColor }} />
      <div className="flex flex-col gap-3.5 pt-0.5">
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden
            className="mt-2 inline-block size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: item.accentColor }}
          />
          <h3 className="m-0 text-[18px] leading-[24px] font-semibold text-text">{item.title}</h3>
        </div>

        {item.points.length > 0 && (
          <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-[15px] leading-[23px] text-text/85">
            {item.points.map(point => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {item.concede && (
          <div className="flex flex-col gap-1 rounded-lg bg-grey-01/80 px-4 py-3 text-[15px] leading-[22px] text-text/85">
            <span className="text-[12px] font-semibold tracking-[0.04em] text-grey-04 uppercase">Concedes</span>
            <span>{item.concede}</span>
          </div>
        )}

        {item.sources.length > 0 && <SourceChipList sources={item.sources} />}
      </div>
    </article>
  );
}
