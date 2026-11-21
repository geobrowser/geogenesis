'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { type ClaimKind, type ClaimSummaryModel, formatClaimKindLabel, formatPercentInt } from '../models';
import { CheckCircleIcon } from './icons';
import { SplitBars } from './split-bars';
import { TEMPLATE_INTERACTIVE_CARD_SURFACE, TemplateBadge, type TemplateBadgeTone } from './template-shell';

const CLAIM_KIND_TONE: Record<ClaimKind, TemplateBadgeTone> = {
  fact: 'fact',
  judgment: 'judgment',
  'value-judgment': 'value',
};

export interface ClaimSummaryCardProps {
  claim: ClaimSummaryModel;
  /** `lead` spans wider with an emphasized headline and overall percentage; `agreed` highlights consensus cleanly. */
  variant?: 'default' | 'lead' | 'agreed';
  className?: string;
}

/**
 * Clickable editorial card summarizing a contested or agreed claim with its community split bars.
 */
export function ClaimSummaryCard({ claim, variant = 'default', className }: ClaimSummaryCardProps) {
  const isLead = variant === 'lead';
  const isAgreed = variant === 'agreed' || (!claim.split.isSplit && variant === 'default');

  const cardClasses = cx(
    'group flex w-full flex-col gap-4 p-5 text-left text-text no-underline @[560px]:p-6',
    TEMPLATE_INTERACTIVE_CARD_SURFACE,
    className
  );

  const content = (
    <>
      {(claim.kind || claim.badgeLabel || (claim.split.isSplit && claim.split.gapPoints !== undefined) || isAgreed) && (
        <div className="flex flex-wrap items-center gap-2">
          {isAgreed && (
            <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-ctaPrimary">
              <CheckCircleIcon className="size-4" />
              <span>Agreed</span>
            </span>
          )}
          {!isAgreed && claim.kind && (
            <TemplateBadge tone={CLAIM_KIND_TONE[claim.kind]}>{formatClaimKindLabel(claim.kind)}</TemplateBadge>
          )}
          {claim.split.isSplit && claim.split.gapPoints !== undefined && (
            <TemplateBadge tone="neutral">{Math.round(claim.split.gapPoints)} pts apart</TemplateBadge>
          )}
          {claim.badgeLabel && <TemplateBadge tone="dark">{claim.badgeLabel}</TemplateBadge>}
        </div>
      )}

      <h3
        className={cx(
          'm-0 font-semibold text-pretty text-text transition-colors group-hover:text-[#4c1fd4]',
          isLead
            ? 'text-[24px] leading-[30px] tracking-[-0.02em] @[560px]:text-[28px] @[560px]:leading-[34px]'
            : 'text-[19px] leading-[25px] tracking-[-0.01em]'
        )}
      >
        {claim.title}
      </h3>

      {claim.basisSummary && <p className="m-0 text-[15px] leading-[21px] text-grey-04">{claim.basisSummary}</p>}

      {claim.split.rows.length > 0 && (
        <div className={cx('flex gap-5 pt-0.5', isLead ? 'flex-col @[560px]:flex-row @[560px]:items-end' : 'flex-col')}>
          {isLead && claim.overallPercent !== undefined && (
            <div className="shrink-0">
              <span className="text-[36px] leading-none font-semibold tracking-[-0.03em] text-text tabular-nums">
                {formatPercentInt(claim.overallPercent)}
              </span>
              <span className="ml-1.5 text-[15px] font-medium text-grey-04">agree</span>
            </div>
          )}
          <SplitBars rows={claim.split.rows} density="compact" className="min-w-0 flex-1" />
        </div>
      )}

      {((claim.meta && claim.meta.length > 0) || claim.userVote) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-grey-04">
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
