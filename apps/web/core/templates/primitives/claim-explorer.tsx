'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { ActionContextProvider } from '~/core/action-context-provider';
import { NavUtils } from '~/core/utils/utils';

import { type ClaimKind, type ClaimSummaryModel, formatClaimKindLabel, formatCompactCount } from '../models';
import {
  AddClaimPopover,
  EntityInlineContext,
  EntityOverflowMenu,
  InlinePagination,
  useEntityActionContext,
} from './entity-overflow-menu';
import { CheckCircleIcon } from './icons';
import { ListRankingHeaderControl, ListRankingWorkspace, type RankableListItem, useListRanking } from './list-ranking';
import { SplitBars } from './split-bars';
import { ClaimVoteBinding, ClaimVotePills, TemplateVoteRows } from './template-claim-vote';
import { TEMPLATE_CARD_SURFACE, TemplateBadge, type TemplateBadgeTone } from './template-shell';
import { PUBLISHING_LABEL, usePendingAdds } from './use-pending-adds';

const CLAIM_KIND_TONE: Record<ClaimKind, TemplateBadgeTone> = {
  fact: 'fact',
  judgment: 'judgment',
  'value-judgment': 'value',
};

export interface ClaimExplorerProps {
  contestedClaims: readonly ClaimSummaryModel[];
  agreedClaims: readonly ClaimSummaryModel[];
  title?: string;
  /** Topic lists drop the Factual / Judgment chip below 760px to keep each row short (GEO-3819). */
  hideKindOnPhone?: boolean;
  className?: string;
}

const PAGE_SIZE = 10;

/**
 * Calm ranked Claims list styled identically to the Rankings panel: soft-shadow card container,
 * plain tabular rank numbers, clean 2-tab switch (`Disputed` | `Accepted`), right-aligned split bars,
 * anchored `+` claim proposal popover, and automatic pagination when more claims exist than fit on one page.
 */
export function ClaimExplorer({
  contestedClaims,
  agreedClaims,
  title = 'Claims',
  hideKindOnPhone = false,
  className,
}: ClaimExplorerProps) {
  const ctx = useEntityActionContext();
  const listedIds = React.useMemo(
    () => [...contestedClaims, ...agreedClaims].map(claim => claim.id),
    [agreedClaims, contestedClaims]
  );
  const added = usePendingAdds<ClaimSummaryModel & { tab: 'split' | 'agreed' }>(listedIds);
  const addedByTab = React.useMemo(
    () => ({
      split: added.rows.filter(claim => claim.tab === 'split'),
      agreed: added.rows.filter(claim => claim.tab === 'agreed'),
    }),
    [added.rows]
  );
  const [tab, setTab] = React.useState<'split' | 'agreed'>(contestedClaims.length > 0 ? 'split' : 'agreed');
  const [page, setPage] = React.useState(1);

  const allContested = React.useMemo(
    () => [...addedByTab.split, ...contestedClaims],
    [addedByTab.split, contestedClaims]
  );
  const allAgreed = React.useMemo(() => [...addedByTab.agreed, ...agreedClaims], [addedByTab.agreed, agreedClaims]);
  const voteTargets = React.useMemo(
    () => [...allContested, ...allAgreed].map(claim => claim.voteTarget),
    [allAgreed, allContested]
  );
  const hasContested = allContested.length > 0;
  const hasAgreed = allAgreed.length > 0;
  const showTabs = hasContested && hasAgreed;

  const activeTab = showTabs ? tab : hasContested ? 'split' : 'agreed';
  const activeList = activeTab === 'split' ? allContested : allAgreed;
  const rankingKey = React.useMemo(() => {
    const sig = activeList
      .slice(0, 3)
      .map(c => c.id)
      .join(',');
    return `claims:${title}:${activeTab}:${sig}`;
  }, [activeList, activeTab, title]);

  const ranking = useListRanking({ listKey: rankingKey, items: activeList });

  const rankableItems = React.useMemo<RankableListItem[]>(
    () =>
      activeList.map(claim => ({
        id: claim.id,
        title: claim.title,
        badge: claim.kind ? formatClaimKindLabel(claim.kind) : undefined,
        badgeTone: claim.kind ? CLAIM_KIND_TONE[claim.kind] : 'neutral',
        meta:
          claim.split.totalVotes && claim.split.totalVotes > 0
            ? `${formatCompactCount(claim.split.totalVotes)} ${claim.split.totalVotes === 1 ? 'vote' : 'votes'}`
            : undefined,
      })),
    [activeList]
  );

  const displayList = ranking.orderedItems;
  const totalPages = Math.max(1, Math.ceil(displayList.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const visible = displayList.slice(startIndex, startIndex + PAGE_SIZE);
  if (!hasContested && !hasAgreed) return null;

  return (
    <section id="claims" aria-label={title} className={cx('flex flex-col gap-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-mediumTitle font-semibold text-text">{title}</h2>
        <div className="flex items-center gap-1">
          <ListRankingHeaderControl
            title={title}
            hasMyRanking={ranking.hasMyRanking}
            viewMode={ranking.viewMode}
            onViewModeChange={mode => {
              ranking.setViewMode(mode);
              setPage(1);
            }}
            onOpen={ranking.open}
            disabled={activeList.length < 2}
          />
          <AddClaimPopover
            label="Add claim"
            canOpen={ctx?.callbacks?.canOpenAddForm}
            onSubmit={draft => {
              const tab = activeTab;
              added.add(
                state => ({
                  tab,
                  pending: state.status === 'pending',
                  title: draft.title,
                  kind: draft.kind,
                  meta: state.status === 'pending' ? [PUBLISHING_LABEL] : draft.note ? [draft.note] : undefined,
                  split: { rows: [], isSplit: tab === 'split', totalVotes: 0 },
                  href: state.status === 'published' ? NavUtils.toEntity(state.spaceId, state.id) : undefined,
                }),
                ctx?.callbacks?.onAddClaim?.(draft)
              );
              setPage(1);
            }}
          />
        </div>
      </div>

      <ListRankingWorkspace
        open={ranking.isOpen}
        title={showTabs ? `${title} · ${activeTab === 'split' ? 'Disputed' : 'Accepted'}` : title}
        items={rankableItems}
        initialOrder={ranking.myOrder}
        onClose={ranking.close}
        onPublish={nextOrder => {
          ranking.publish(nextOrder);
          setPage(1);
        }}
      />

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

        {/* Both tabs' rows, so switching tab or page keeps the same lookup and batch. */}
        <TemplateVoteRows targets={voteTargets}>
          <div className="divide-y divide-divider">
            {visible.map((claim, index) => (
              // Names the list, the tab (positions restart on each) and the row on every action taken
              // in it, a vote included.
              <ActionContextProvider
                key={claim.id}
                value={{
                  list_id: 'template_claims',
                  list_section_id: activeTab,
                  item_position: startIndex + index + 1,
                }}
              >
                <RankedClaimRow
                  rank={startIndex + index + 1}
                  claim={claim}
                  isAgreed={activeTab === 'agreed'}
                  hideKindOnPhone={hideKindOnPhone}
                />
              </ActionContextProvider>
            ))}
          </div>
        </TemplateVoteRows>

        {totalPages > 1 && (
          <div className="border-t border-divider px-5 py-2.5">
            <InlinePagination page={safePage} totalPages={totalPages} onPageChange={setPage} label="Claims pages" />
          </div>
        )}
      </div>
    </section>
  );
}

function RankedClaimRow({
  rank,
  claim,
  isAgreed,
  hideKindOnPhone,
}: {
  rank: number;
  claim: ClaimSummaryModel;
  isAgreed: boolean;
  hideKindOnPhone: boolean;
}) {
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

  const votes = Boolean(claim.voteTarget || claim.onVote);
  const youVotedLabel = claim.userVote && !votes ? (claim.userVote === 'agree' ? 'You agreed' : 'You disagreed') : null;

  const debateNode =
    debateLabel &&
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
    ));

  const kindBadge = claim.kind && (
    <TemplateBadge tone={CLAIM_KIND_TONE[claim.kind]} className="!h-6 !px-2 !text-[12px]">
      {formatClaimKindLabel(claim.kind)}
    </TemplateBadge>
  );

  // Phones: the split sits under the pills as the Claim page's vote box draws it (dot, space, bar,
  // "80% (5)"), so the count lives in the parentheses. No votes, no split line, as in that box.
  const phoneSplitRows =
    claim.split.rows.length > 0 && claim.split.totalVotes !== 0
      ? claim.split.rows.map(row => ({
          ...row,
          // The vote pills already show the viewer's side.
          userLabel: undefined,
          voterCount: row.voterCount ?? (claim.split.rows.length === 1 ? claim.split.totalVotes : undefined),
        }))
      : [];
  const phoneKindBadge = hideKindOnPhone ? null : kindBadge;

  const phoneMeta: React.ReactNode[] = [];
  if (debateNode) phoneMeta.push(<React.Fragment key="debates">{debateNode}</React.Fragment>);
  for (const part of metaParts) phoneMeta.push(<span key={`meta-${part}`}>{part}</span>);
  if (youVotedLabel) {
    phoneMeta.push(
      <span key="you" className="font-medium text-text">
        {youVotedLabel}
      </span>
    );
  }

  const titleNode = (
    <span className="block text-[16px] leading-[22px] font-medium text-pretty text-text transition-colors group-hover/claim:text-[#4c1fd4]">
      {/* Phones: the rank leads the title instead of holding a column, so the row keeps its width. */}
      <span aria-hidden className="mr-2 text-[15px] font-semibold text-grey-04 tabular-nums @[760px]:hidden">
        {rank}
      </span>
      {claim.title}
      {isAgreed && <CheckCircleIcon className="ml-1.5 inline-block size-3.5 align-[-0.15em] text-ctaPrimary" />}
    </span>
  );

  // Below 760px the row is one column: the title with "…" beside it, a meta line (kind, debates), the
  // vote pills, then the split. ("…" moved up because at 320px it collided with "Disagree 2".) The desktop wrappers turn into `contents` there so the pills
  // and "…" (one instance each) can share a line; at 760px and wider the markup lays out exactly as
  // before (GEO-3819).
  return (
    <div className="flex flex-wrap items-center gap-x-3 px-5 py-4 transition-colors hover:bg-bg @[760px]:flex-nowrap @[760px]:gap-6">
      <div className="contents min-w-0 flex-1 items-start gap-4 @[760px]:flex">
        <span className="hidden w-6 shrink-0 pt-0.5 text-center text-[15px] font-semibold text-grey-04 tabular-nums @[760px]:block">
          {rank}
        </span>

        <div className="contents min-w-0 flex-1 flex-col gap-2 @[760px]:flex">
          <div className="-order-1 min-w-0 flex-1 @[760px]:contents">
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
          </div>

          {(phoneKindBadge || phoneMeta.length > 0) && (
            <div className="mt-1.5 flex basis-full flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-grey-04 @[760px]:hidden">
              {phoneKindBadge && <span className="mr-0.5 inline-flex">{phoneKindBadge}</span>}
              {phoneMeta.map((node, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span aria-hidden>·</span>}
                  {node}
                </React.Fragment>
              ))}
            </div>
          )}

          {(claim.kind || votes || debateLabel || metaParts.length > 0 || youVotedLabel) && (
            <div className="contents flex-wrap items-center gap-x-3 gap-y-1.5 @[760px]:flex">
              {kindBadge && <span className="hidden @[760px]:contents">{kindBadge}</span>}

              {/* 32px tap targets on phones; the desktop pills keep their 28px. */}
              <div className="mt-2.5 basis-full @[760px]:contents [&_button]:h-8 @[760px]:[&_button]:h-7">
                <ClaimVoteBinding
                  voteTarget={claim.voteTarget}
                  userVote={claim.userVote}
                  agreeCount={claim.agreeCount}
                  disagreeCount={claim.disagreeCount}
                  onVote={claim.onVote}
                  onClearVote={claim.onClearVote}
                >
                  {vote => vote && <ClaimVotePills title={claim.title} vote={vote} />}
                </ClaimVoteBinding>
              </div>

              {(debateLabel || metaParts.length > 0 || youVotedLabel) && (
                <span className="hidden flex-wrap items-center gap-x-2 gap-y-0.5 text-[13.5px] text-grey-04 @[760px]:flex">
                  {debateNode}
                  {metaParts.map((part, i) => (
                    <React.Fragment key={part}>
                      {(debateLabel || i > 0) && <span aria-hidden>·</span>}
                      <span>{part}</span>
                    </React.Fragment>
                  ))}
                  {youVotedLabel && (
                    <>
                      {(debateLabel || metaParts.length > 0) && <span aria-hidden>·</span>}
                      <span className="font-medium text-text">{youVotedLabel}</span>
                    </>
                  )}
                </span>
              )}
            </div>
          )}

          <EntityInlineContext
            targetId={claim.id}
            targetTitle={claim.title}
            targetKind="Claim"
            className="order-last mt-3 basis-full @[760px]:order-none @[760px]:mt-0.5"
          />
        </div>
      </div>

      <div className="contents min-w-0 items-center gap-x-3 @[760px]:flex @[760px]:shrink-0">
        {claim.split.rows.length > 0 ? (
          <span className="hidden @[760px]:contents">
            <SplitBars rows={claim.split.rows} density="compact" className="w-[264px] shrink-0" />
          </span>
        ) : (
          <div className="hidden w-[264px] shrink-0 items-center gap-2 @[760px]:flex">
            <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-grey-01" />
            <span className="w-[38px] text-right text-[12.5px] text-grey-03 tabular-nums">—</span>
          </div>
        )}

        <span className="hidden w-[76px] shrink-0 text-right text-[13px] whitespace-nowrap text-grey-04 tabular-nums @[760px]:block">
          {voteCountLabel ?? '0 votes'}
        </span>

        <EntityOverflowMenu
          target={{ id: claim.id, kind: 'Claim', title: claim.title }}
          // A pending row's id isn't an entity yet; the menu keeps its space but can't be used.
          className={cx(
            '-order-1 -my-[5px] self-start @[760px]:order-none @[760px]:my-0 @[760px]:w-[120px] @[760px]:justify-end @[760px]:self-auto [&>button[aria-haspopup]]:size-8 @[760px]:[&>button[aria-haspopup]]:size-7',
            claim.pending && 'invisible'
          )}
        />

        {phoneSplitRows.length > 0 && (
          <SplitBars rows={phoneSplitRows} density="full" className="mt-3 basis-full @[760px]:hidden" />
        )}
      </div>
    </div>
  );
}
