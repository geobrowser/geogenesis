'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { type ClaimKind, type ClaimSummaryModel, formatClaimKindLabel, formatPercentInt } from '../models';
import { SplitBars } from './split-bars';
import { TemplateBadge, type TemplateBadgeTone } from './template-shell';

const CLAIM_KIND_TONE: Record<ClaimKind, TemplateBadgeTone> = {
  fact: 'fact',
  judgment: 'judgment',
  'value-judgment': 'value',
};

export interface ClaimSummaryCardProps {
  claim: ClaimSummaryModel;
  /** `lead` spans wider with an emphasized headline and overall percentage; `agreed` uses the calm green tint. */
  variant?: 'default' | 'lead' | 'agreed';
  className?: string;
}

/**
 * Clickable card summarizing a contested or agreed claim with its community split bars.
 */
export function ClaimSummaryCard({ claim, variant = 'default', className }: ClaimSummaryCardProps) {
  const isLead = variant === 'lead';
  const isAgreed = variant === 'agreed' || (!claim.split.isSplit && variant === 'default');

  const cardClasses = cx(
    'group flex w-full flex-col gap-3 rounded-xl border p-4 text-left text-text no-underline transition-colors @[560px]:p-[18px]',
    isAgreed
      ? 'border-[#d8efe3] bg-[#f2faf6] hover:border-[#127a5b]'
      : isLead
        ? 'border-grey-02 bg-grey-01/60 hover:border-text'
        : 'border-grey-02/80 bg-white hover:border-text',
    className
  );

  const content = (
    <>
      {(claim.kind || claim.badgeLabel || (claim.split.isSplit && claim.split.gapPoints !== undefined)) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {claim.kind && (
            <TemplateBadge tone={CLAIM_KIND_TONE[claim.kind]}>{formatClaimKindLabel(claim.kind)}</TemplateBadge>
          )}
          {claim.split.isSplit && claim.split.gapPoints !== undefined && (
            <TemplateBadge tone="split">{Math.round(claim.split.gapPoints)} pts apart</TemplateBadge>
          )}
          {claim.badgeLabel && <TemplateBadge tone="dark">{claim.badgeLabel}</TemplateBadge>}
        </div>
      )}

      <h3
        className={cx(
          'm-0 font-semibold text-pretty text-text',
          isLead
            ? 'text-[22px] leading-[28px] @[560px]:text-[26px] @[560px]:leading-[31px]'
            : 'text-[17px] leading-[22px]'
        )}
      >
        {claim.title}
      </h3>

      {claim.basisSummary && <p className="m-0 text-[13px] leading-[18px] text-[#355e4c]">{claim.basisSummary}</p>}

      <div className={cx('flex gap-4', isLead ? 'flex-col @[560px]:flex-row @[560px]:items-end' : 'flex-col')}>
        {isLead && claim.overallPercent !== undefined && (
          <div className="shrink-0">
            <span className="text-[32px] leading-none font-bold text-text tabular-nums">
              {formatPercentInt(claim.overallPercent)}
            </span>
            <span className="ml-1 text-[13px] font-medium text-grey-04">agree</span>
          </div>
        )}
        <SplitBars rows={claim.split.rows} density="compact" className="min-w-0 flex-1" />
      </div>

      {((claim.meta && claim.meta.length > 0) || claim.userVote) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-grey-04">
          {claim.meta?.map(entry => (
            <span key={entry}>{entry}</span>
          ))}
          {claim.userVote && (
            <span className="font-medium text-text">{claim.userVote === 'agree' ? 'You agreed' : 'You disagreed'}</span>
          )}
        </div>
      )}
    </>
  );

  if (claim.href) {
    return (
      <Link href={claim.href} className={cardClasses}>
        {content}
      </Link>
    );
  }

  if (claim.onSelect) {
    return (
      <button type="button" onClick={claim.onSelect} className={cx(cardClasses, 'cursor-pointer')}>
        {content}
      </button>
    );
  }

  return <article className={cardClasses}>{content}</article>;
}
