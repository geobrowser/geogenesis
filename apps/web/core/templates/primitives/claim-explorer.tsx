'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { ClaimSummaryModel } from '../models';
import { CheckCircleIcon, ChevronRightIcon } from './icons';
import { SplitBars } from './split-bars';
import { TEMPLATE_CARD_SURFACE } from './template-shell';

export interface ClaimExplorerProps {
  contestedClaims: readonly ClaimSummaryModel[];
  agreedClaims: readonly ClaimSummaryModel[];
  title?: string;
  className?: string;
}

const DEFAULT_VISIBLE = 5;

/**
 * Calm ranked Claims list styled identically to the Rankings panel: soft-shadow card container,
 * plain tabular rank numbers, clean 2-tab switch (`Where they split` | `Common ground`), and
 * right-aligned split bars. Clicking any row opens it in the Context Peek Drawer (or navigates via `href`).
 */
export function ClaimExplorer({ contestedClaims, agreedClaims, title = 'Claims', className }: ClaimExplorerProps) {
  const hasContested = contestedClaims.length > 0;
  const hasAgreed = agreedClaims.length > 0;
  const showTabs = hasContested && hasAgreed;

  const [tab, setTab] = React.useState<'split' | 'agreed'>(hasContested ? 'split' : 'agreed');
  const [showAll, setShowAll] = React.useState(false);

  if (!hasContested && !hasAgreed) return null;

  const activeTab = showTabs ? tab : hasContested ? 'split' : 'agreed';
  const activeList = activeTab === 'split' ? contestedClaims : agreedClaims;
  const visible = showAll ? activeList : activeList.slice(0, DEFAULT_VISIBLE);

  return (
    <section id="claims" aria-label="Claims" className={cx('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="m-0 text-mediumTitle font-semibold text-text">{title}</h2>

        {activeList.length > DEFAULT_VISIBLE && (
          <button
            type="button"
            onClick={() => setShowAll(prev => !prev)}
            className="cursor-pointer border-0 bg-transparent p-0 text-[14.5px] font-medium text-ctaPrimary hover:text-ctaHover"
          >
            {showAll ? 'Show fewer' : `Show all ${activeList.length}`}
          </button>
        )}
      </div>

      <div className={cx('flex flex-col overflow-hidden', TEMPLATE_CARD_SURFACE)}>
        {showTabs && (
          <div
            role="tablist"
            aria-label="Claim view"
            className="flex flex-wrap items-center gap-2 border-b border-divider px-5 py-3.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'split'}
              onClick={() => {
                setTab('split');
                setShowAll(false);
              }}
              className={cx(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[14px] font-medium transition-colors',
                activeTab === 'split'
                  ? 'border-text bg-text text-white'
                  : 'border-grey-02 bg-white text-text hover:border-text'
              )}
            >
              <span>Where they split</span>
              <span
                className={cx('text-[13px] tabular-nums', activeTab === 'split' ? 'text-white/75' : 'text-grey-04')}
              >
                {contestedClaims.length}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'agreed'}
              onClick={() => {
                setTab('agreed');
                setShowAll(false);
              }}
              className={cx(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[14px] font-medium transition-colors',
                activeTab === 'agreed'
                  ? 'border-text bg-text text-white'
                  : 'border-grey-02 bg-white text-text hover:border-text'
              )}
            >
              <span>Common ground</span>
              <span
                className={cx('text-[13px] tabular-nums', activeTab === 'agreed' ? 'text-white/75' : 'text-grey-04')}
              >
                {agreedClaims.length}
              </span>
            </button>
          </div>
        )}

        <div className="divide-y divide-divider">
          {visible.map((claim, index) => (
            <RankedClaimRow key={claim.id} rank={index + 1} claim={claim} isAgreed={activeTab === 'agreed'} />
          ))}
        </div>
      </div>
    </section>
  );
}

function RankedClaimRow({ rank, claim, isAgreed }: { rank: number; claim: ClaimSummaryModel; isAgreed: boolean }) {
  const voteMetaIndex = claim.meta?.findIndex(part => /\bvotes?\b/i.test(part)) ?? -1;
  const voteCountLabel =
    claim.split.totalVotes !== undefined
      ? `${claim.split.totalVotes.toLocaleString('en-US')} ${claim.split.totalVotes === 1 ? 'vote' : 'votes'}`
      : voteMetaIndex >= 0
        ? claim.meta?.[voteMetaIndex]
        : undefined;

  const metaParts: string[] = [];
  if (!isAgreed && claim.split.gapPoints !== undefined) {
    metaParts.push(`${Math.round(claim.split.gapPoints)} pts apart`);
  }
  if (claim.meta && claim.meta.length > 0) {
    for (let i = 0; i < claim.meta.length; i++) {
      if (i !== voteMetaIndex) metaParts.push(claim.meta[i]);
    }
  }

  const inner = (
    <>
      <span className="w-6 shrink-0 text-center text-[15px] font-semibold text-grey-04 tabular-nums">{rank}</span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="inline-flex flex-wrap items-center gap-1.5 text-[16px] leading-[22px] font-medium text-pretty text-text transition-colors group-hover:text-ctaPrimary">
          <span>{claim.title}</span>
          {isAgreed && <CheckCircleIcon className="size-3.5 shrink-0 text-ctaPrimary" />}
        </span>

        {(metaParts.length > 0 || claim.userVote) && (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] text-grey-04">
            {metaParts.map((part, i) => (
              <React.Fragment key={part}>
                {i > 0 && <span aria-hidden>·</span>}
                <span>{part}</span>
              </React.Fragment>
            ))}
            {claim.userVote && (
              <>
                {metaParts.length > 0 && <span aria-hidden>·</span>}
                <span className="font-medium text-text">
                  {claim.userVote === 'agree' ? 'You agreed' : 'You disagreed'}
                </span>
              </>
            )}
          </span>
        )}
      </span>

      <span className="flex w-full items-center gap-3.5 pl-9 @[720px]:w-[280px] @[720px]:shrink-0 @[720px]:pl-0">
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          {claim.split.rows.length > 0 && <SplitBars rows={claim.split.rows} density="compact" />}
          {voteCountLabel && (
            <span className="text-right text-[13px] leading-[16px] text-grey-04 tabular-nums">{voteCountLabel}</span>
          )}
        </span>
        <ChevronRightIcon className="size-4 shrink-0 text-grey-03 transition-transform group-hover:translate-x-0.5 group-hover:text-ctaPrimary" />
      </span>
    </>
  );

  const rowClasses =
    'group flex w-full flex-col gap-2.5 px-5 py-4 text-left text-text no-underline transition-colors hover:bg-bg @[720px]:flex-row @[720px]:items-center @[720px]:gap-4';

  if (claim.href) {
    return (
      <Link href={claim.href} className={rowClasses}>
        {inner}
      </Link>
    );
  }

  if (claim.onSelect) {
    return (
      <button
        type="button"
        onClick={claim.onSelect}
        className={cx(rowClasses, 'cursor-pointer border-0 bg-transparent')}
      >
        {inner}
      </button>
    );
  }

  return <div className={rowClasses}>{inner}</div>;
}
