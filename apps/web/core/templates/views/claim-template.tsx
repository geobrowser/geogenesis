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
  RelatedListSection,
  SourceChipList,
  SplitBars,
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
 * Works for both contested and agreed claims, and gracefully omits optional sections
 * (`agreedBasis`, `keyStat`, `subClaims`, `strongestCases`) when a data source doesn't provide them.
 */
export function ClaimTemplate({ model, headerActions, footer, className }: ClaimTemplateProps) {
  const isSplit = model.split.isSplit;

  return (
    <TemplateShell maxWidth={840} breadcrumbs={model.breadcrumbs} className={className}>
      {/* Header */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
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

      {/* Agreed basis (shown on agreed claims when populated) */}
      {model.agreedBasis && (
        <section
          aria-label="What both communities agree on"
          className="flex flex-col gap-3 rounded-xl border border-l-2 border-grey-02/80 border-l-ctaPrimary bg-white p-4 @[560px]:p-5"
        >
          <h2 className="m-0 text-[15px] leading-[20px] font-semibold text-text">What both communities agree on</h2>
          <p className="m-0 text-[15px] leading-[22px] text-text/90">{model.agreedBasis.summary}</p>
          {model.agreedBasis.settlingSources.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-grey-04">The sources that settled it</span>
              <SourceChipList sources={model.agreedBasis.settlingSources} />
            </div>
          )}
        </section>
      )}

      {/* Key stat callout */}
      {model.keyStat && (
        <section
          aria-label="Key evidence"
          className="flex flex-col gap-2.5 rounded-xl border border-grey-02/80 bg-grey-01/50 p-4"
        >
          <p className="m-0 text-[15px] leading-[22px] text-text">{model.keyStat.text}</p>
          <SourceChipList sources={model.keyStat.sources} />
        </section>
      )}

      {/* Underlying facts / sub-claims */}
      {model.subClaims && model.subClaims.length > 0 && (
        <section aria-label="The facts it turns on" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="m-0 text-smallTitle text-text">The facts it turns on</h2>
            <p className="m-0 text-[13px] text-grey-04">Underlying claims and the sources cited for each.</p>
          </div>
          <div className="flex flex-col gap-2.5">
            {model.subClaims.map(fact => (
              <SubClaimFactCard key={fact.id} fact={fact} />
            ))}
          </div>
        </section>
      )}

      {/* Strongest cases */}
      {model.strongestCases && model.strongestCases.length > 0 && (
        <section aria-label="Strongest cases" className="flex flex-col gap-3">
          <h2 className="m-0 text-smallTitle text-text">Strongest cases</h2>
          <div className="grid grid-cols-1 gap-3.5 @[640px]:grid-cols-2">
            {model.strongestCases.map(item => (
              <StrongestCaseCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* Related entity lists (Parent claim, Events, In the news, Sources, Debates, Topics) */}
      {model.sections.length > 0 && (
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

function DebateCountPill({ count, href, onSelect }: { count: number; href?: string; onSelect?: () => void }) {
  const label = `${count} ${count === 1 ? 'debate' : 'debates'} ›`;
  const classes =
    'inline-flex h-[22px] items-center rounded-sm bg-ctaTertiary px-2 text-[12px] leading-none font-semibold text-ctaPrimary no-underline transition-colors hover:bg-ctaPrimary hover:text-white';

  if (href) {
    return (
      <Link href={href} className={classes}>
        {label}
      </Link>
    );
  }

  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} className={`${classes} cursor-pointer border-0`}>
        {label}
      </button>
    );
  }

  return <TemplateBadge tone="neutral">{label}</TemplateBadge>;
}

function SubClaimFactCard({ fact }: { fact: SubClaimFactModel }) {
  const [open, setOpen] = React.useState(false);

  return (
    <article className="flex flex-col gap-2.5 rounded-xl border border-grey-02/70 bg-white p-4">
      {fact.href ? (
        <Link
          href={fact.href}
          className="text-[15px] leading-[21px] font-semibold text-text no-underline hover:text-ctaPrimary"
        >
          {fact.title}
        </Link>
      ) : fact.onSelect ? (
        <button
          type="button"
          onClick={fact.onSelect}
          className="cursor-pointer border-0 bg-transparent p-0 text-left text-[15px] leading-[21px] font-semibold text-text hover:text-ctaPrimary"
        >
          {fact.title}
        </button>
      ) : (
        <h3 className="m-0 text-[15px] leading-[21px] font-semibold text-text">{fact.title}</h3>
      )}

      <SplitBars rows={fact.split.rows} density="compact" />

      {fact.stat && <p className="m-0 text-[13px] leading-[18px] text-grey-04">{fact.stat}</p>}

      {fact.sources.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(prev => !prev)}
            className="cursor-pointer self-start border-0 bg-transparent p-0 text-[12px] font-medium text-ctaPrimary hover:text-ctaHover"
          >
            {open ? 'Hide sources' : `Evidence and sources (${fact.sources.length})`}
          </button>
          {open && <SourceChipList sources={fact.sources} />}
        </div>
      )}
    </article>
  );
}

function StrongestCaseCard({ item }: { item: StrongestCaseModel }) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-grey-02/80 bg-white p-4">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-3 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: item.accentColor }}
        />
        <h3 className="m-0 text-[15px] leading-[20px] font-semibold text-text">{item.title}</h3>
      </div>

      {item.points.length > 0 && (
        <ul className="m-0 flex list-disc flex-col gap-1.5 pl-4 text-[14px] leading-[20px] text-text/90">
          {item.points.map(point => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      )}

      {item.concede && (
        <p className="m-0 rounded-lg bg-grey-01 px-3 py-2 text-[13px] leading-[18px] text-grey-05">
          <strong className="font-semibold text-text">Concedes:</strong> {item.concede}
        </p>
      )}

      {item.sources.length > 0 && <SourceChipList sources={item.sources} />}
    </article>
  );
}
