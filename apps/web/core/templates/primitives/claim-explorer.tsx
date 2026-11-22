'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { type ClaimKind, type ClaimSummaryModel, formatClaimKindLabel, formatCompactCount } from '../models';
import {
  AddClaimPopover,
  EntityInlineContext,
  EntityOverflowMenu,
  InlinePagination,
  useEntityActionContext,
} from './entity-overflow-menu';
import { CheckCircleIcon, ThumbDownIcon, ThumbUpIcon } from './icons';
import { SplitBars } from './split-bars';
import { TEMPLATE_CARD_SURFACE, TemplateBadge, type TemplateBadgeTone } from './template-shell';

const CLAIM_KIND_TONE: Record<ClaimKind, TemplateBadgeTone> = {
  fact: 'fact',
  judgment: 'judgment',
  'value-judgment': 'value',
};

export interface ClaimExplorerProps {
  contestedClaims: readonly ClaimSummaryModel[];
  agreedClaims: readonly ClaimSummaryModel[];
  title?: string;
  className?: string;
}

const PAGE_SIZE = 10;

/**
 * Calm ranked Claims list styled identically to the Rankings panel: soft-shadow card container,
 * plain tabular rank numbers, clean 2-tab switch (`Disputed` | `Accepted`), right-aligned split bars,
 * anchored `+` claim proposal popover, and automatic pagination when more claims exist than fit on one page.
 */
export function ClaimExplorer({ contestedClaims, agreedClaims, title = 'Claims', className }: ClaimExplorerProps) {
  const ctx = useEntityActionContext();
  const [addedByTab, setAddedByTab] = React.useState<{ split: ClaimSummaryModel[]; agreed: ClaimSummaryModel[] }>({
    split: [],
    agreed: [],
  });
  const [tab, setTab] = React.useState<'split' | 'agreed'>(contestedClaims.length > 0 ? 'split' : 'agreed');
  const [page, setPage] = React.useState(1);

  const allContested = [...addedByTab.split, ...contestedClaims];
  const allAgreed = [...addedByTab.agreed, ...agreedClaims];
  const hasContested = allContested.length > 0;
  const hasAgreed = allAgreed.length > 0;
  const showTabs = hasContested && hasAgreed;

  if (!hasContested && !hasAgreed) return null;

  const activeTab = showTabs ? tab : hasContested ? 'split' : 'agreed';
  const activeList = activeTab === 'split' ? allContested : allAgreed;
  const totalPages = Math.max(1, Math.ceil(activeList.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const visible = activeList.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <section id="claims" aria-label={title} className={cx('flex flex-col gap-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-mediumTitle font-semibold text-text">{title}</h2>
        <AddClaimPopover
          label="Add claim"
          onSubmit={draft => {
            ctx?.callbacks?.onAddClaim?.(draft);
            const newClaim: ClaimSummaryModel = {
              id: `user-claim-${Date.now()}`,
              title: draft.title,
              kind: draft.kind,
              meta: draft.note ? [draft.note] : undefined,
              split: { rows: [], isSplit: activeTab === 'split', totalVotes: 0 },
            };
            setAddedByTab(prev => ({
              ...prev,
              [activeTab]: [newClaim, ...prev[activeTab]],
            }));
            setPage(1);
          }}
        />
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
                setPage(1);
              }}
              className={cx(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[14px] font-medium transition-colors',
                activeTab === 'split'
                  ? 'border-text bg-text text-white'
                  : 'border-grey-02 bg-white text-text hover:border-text'
              )}
            >
              <span>Disputed</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'agreed'}
              onClick={() => {
                setTab('agreed');
                setPage(1);
              }}
              className={cx(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[14px] font-medium transition-colors',
                activeTab === 'agreed'
                  ? 'border-text bg-text text-white'
                  : 'border-grey-02 bg-white text-text hover:border-text'
              )}
            >
              <span>Accepted</span>
            </button>
          </div>
        )}

        <div className="divide-y divide-divider">
          {visible.map((claim, index) => (
            <RankedClaimRow
              key={claim.id}
              rank={startIndex + index + 1}
              claim={claim}
              isAgreed={activeTab === 'agreed'}
            />
          ))}
        </div>

        {totalPages > 1 && (
          <div className="border-t border-divider px-5 py-2.5">
            <InlinePagination page={safePage} totalPages={totalPages} onPageChange={setPage} label="Claims pages" />
          </div>
        )}
      </div>
    </section>
  );
}

function RankedClaimRow({ rank, claim, isAgreed }: { rank: number; claim: ClaimSummaryModel; isAgreed: boolean }) {
  const voteMetaIndex = claim.meta?.findIndex(part => /\bvotes?\b/i.test(part)) ?? -1;
  const debateMetaIndex = claim.meta?.findIndex(part => /\bdebates?\b/i.test(part)) ?? -1;

  const voteCountLabel =
    claim.split.totalVotes !== undefined
      ? `${formatCompactCount(claim.split.totalVotes)} ${claim.split.totalVotes === 1 ? 'vote' : 'votes'}`
      : voteMetaIndex >= 0
        ? claim.meta?.[voteMetaIndex]
        : undefined;

  const debateLabel =
    claim.debateCount && claim.debateCount > 0
      ? `${claim.debateCount} ${claim.debateCount === 1 ? 'debate' : 'debates'}`
      : debateMetaIndex >= 0
        ? claim.meta?.[debateMetaIndex]
        : undefined;

  const metaParts: string[] = [];
  if (claim.meta && claim.meta.length > 0) {
    for (let i = 0; i < claim.meta.length; i++) {
      if (i !== voteMetaIndex && i !== debateMetaIndex) metaParts.push(claim.meta[i]);
    }
  }

  const handleVoteClick = (choice: 'agree' | 'disagree') => {
    if (!claim.onVote) return;
    if (claim.userVote === choice && claim.onClearVote) {
      claim.onClearVote();
      return;
    }
    claim.onVote(choice);
  };

  const titleNode = (
    <span className="block text-[16px] leading-[22px] font-medium text-pretty text-text transition-colors group-hover/claim:text-[#4c1fd4]">
      {claim.title}
      {isAgreed && <CheckCircleIcon className="ml-1.5 inline-block size-3.5 align-[-0.15em] text-ctaPrimary" />}
    </span>
  );

  return (
    <div className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-bg @[760px]:flex-row @[760px]:items-center @[760px]:gap-6">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span className="w-6 shrink-0 pt-0.5 text-center text-[15px] font-semibold text-grey-04 tabular-nums">
          {rank}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {claim.href ? (
            <Link href={claim.href} className="group/claim self-start text-left text-text no-underline">
              {titleNode}
            </Link>
          ) : claim.onSelect ? (
            <button
              type="button"
              onClick={claim.onSelect}
              className="group/claim cursor-pointer self-start border-0 bg-transparent p-0 text-left text-text"
            >
              {titleNode}
            </button>
          ) : (
            titleNode
          )}

          {(claim.kind || claim.onVote || debateLabel || metaParts.length > 0 || (claim.userVote && !claim.onVote)) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {claim.kind && (
                <TemplateBadge tone={CLAIM_KIND_TONE[claim.kind]} className="!h-6 !px-2 !text-[12px]">
                  {formatClaimKindLabel(claim.kind)}
                </TemplateBadge>
              )}

              {claim.onVote && (
                <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label={`Vote on ${claim.title}`}>
                  <button
                    type="button"
                    aria-pressed={claim.userVote === 'agree'}
                    onClick={() => handleVoteClick('agree')}
                    className={cx(
                      'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
                      claim.userVote === 'agree'
                        ? 'border-text bg-text text-white'
                        : 'border-grey-02 bg-white text-text hover:border-text'
                    )}
                  >
                    <ThumbUpIcon className="size-3.5 shrink-0" />
                    <span>Agree</span>
                    {claim.agreeCount !== undefined && claim.agreeCount > 0 && (
                      <span
                        className={cx(
                          'text-[12px] tabular-nums',
                          claim.userVote === 'agree' ? 'text-white/80' : 'text-grey-04'
                        )}
                      >
                        {formatCompactCount(claim.agreeCount)}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    aria-pressed={claim.userVote === 'disagree'}
                    onClick={() => handleVoteClick('disagree')}
                    className={cx(
                      'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
                      claim.userVote === 'disagree'
                        ? 'border-text bg-text text-white'
                        : 'border-grey-02 bg-white text-text hover:border-text'
                    )}
                  >
                    <ThumbDownIcon className="size-3.5 shrink-0" />
                    <span>Disagree</span>
                    {claim.disagreeCount !== undefined && claim.disagreeCount > 0 && (
                      <span
                        className={cx(
                          'text-[12px] tabular-nums',
                          claim.userVote === 'disagree' ? 'text-white/80' : 'text-grey-04'
                        )}
                      >
                        {formatCompactCount(claim.disagreeCount)}
                      </span>
                    )}
                  </button>
                </div>
              )}

              {(debateLabel || metaParts.length > 0 || (claim.userVote && !claim.onVote)) && (
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13.5px] text-grey-04">
                  {debateLabel &&
                    (claim.debatesHref ? (
                      <Link
                        href={claim.debatesHref}
                        className="font-medium text-grey-04 underline decoration-grey-02 underline-offset-2 transition-colors hover:text-[#4c1fd4] hover:decoration-[#4c1fd4]"
                      >
                        {debateLabel}
                      </Link>
                    ) : claim.onOpenDebates ? (
                      <button
                        type="button"
                        onClick={claim.onOpenDebates}
                        className="cursor-pointer border-0 bg-transparent p-0 font-medium text-grey-04 underline decoration-grey-02 underline-offset-2 transition-colors hover:text-[#4c1fd4] hover:decoration-[#4c1fd4]"
                      >
                        {debateLabel}
                      </button>
                    ) : (
                      <span>{debateLabel}</span>
                    ))}
                  {metaParts.map((part, i) => (
                    <React.Fragment key={part}>
                      {(debateLabel || i > 0) && <span aria-hidden>·</span>}
                      <span>{part}</span>
                    </React.Fragment>
                  ))}
                  {claim.userVote && !claim.onVote && (
                    <>
                      {(debateLabel || metaParts.length > 0) && <span aria-hidden>·</span>}
                      <span className="font-medium text-text">
                        {claim.userVote === 'agree' ? 'You agreed' : 'You disagreed'}
                      </span>
                    </>
                  )}
                </span>
              )}
            </div>
          )}

          <EntityInlineContext targetId={claim.id} targetTitle={claim.title} targetKind="Claim" className="mt-0.5" />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 pl-10 @[760px]:pl-0">
        {claim.split.rows.length > 0 ? (
          <SplitBars rows={claim.split.rows} density="compact" className="w-[264px] shrink-0" />
        ) : (
          <div className="hidden w-[264px] shrink-0 items-center gap-2 @[760px]:flex">
            <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-grey-01" />
            <span className="w-[38px] text-right text-[12.5px] text-grey-03 tabular-nums">—</span>
          </div>
        )}

        <span className="w-[76px] shrink-0 text-right text-[13px] whitespace-nowrap text-grey-04 tabular-nums">
          {voteCountLabel ?? '0 votes'}
        </span>

        <EntityOverflowMenu
          target={{ id: claim.id, kind: 'Claim', title: claim.title }}
          className="@[760px]:w-[120px] @[760px]:justify-end"
        />
      </div>
    </div>
  );
}
