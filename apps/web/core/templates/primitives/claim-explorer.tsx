'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { ActionContextProvider } from '~/core/action-context-provider';
import { NavUtils } from '~/core/utils/utils';

import {
  type ClaimKind,
  type ClaimSummaryModel,
  type SplitRow,
  formatClaimKindLabel,
  formatCompactCount,
  formatPercentInt,
} from '../models';
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
import { ClaimVoteBinding, ClaimVotePills, type TemplateVoteBinding, TemplateVoteRows } from './template-claim-vote';
import { TEMPLATE_CLAIM_LIST_SURFACE, type TemplateBadgeTone } from './template-shell';
import { PUBLISHING_LABEL, usePendingAdds } from './use-pending-adds';

// Gray for every kind (GEO-3845): the tag says what kind of claim it is without the loud blue/purple.
const CLAIM_KIND_TONE: Record<ClaimKind, TemplateBadgeTone> = {
  fact: 'neutral',
  judgment: 'neutral',
  'value-judgment': 'neutral',
};

export interface ClaimExplorerProps {
  contestedClaims: readonly ClaimSummaryModel[];
  agreedClaims: readonly ClaimSummaryModel[];
  title?: string;
  /**
   * Below 760px the Factual / Judgment tag is dropped to keep each row short (GEO-3819). On for
   * every template claim list (GEO-3837); pass `false` for a list where the kind matters on phones.
   */
  hideKindOnPhone?: boolean;
  className?: string;
}

const PAGE_SIZE = 10;

type ExplorerClaim = ClaimSummaryModel & { section: 'split' | 'agreed' };

/**
 * Calm ranked Claims list styled identically to the Rankings panel: soft-shadow card container,
 * plain tabular rank numbers, one list (disputed claims first, then accepted), right-aligned split bars,
 * anchored `+` claim proposal popover, and automatic pagination when more claims exist than fit on one page.
 */
export function ClaimExplorer({
  contestedClaims,
  agreedClaims,
  title = 'Claims',
  hideKindOnPhone = true,
  className,
}: ClaimExplorerProps) {
  const ctx = useEntityActionContext();
  const listedIds = React.useMemo(
    () => [...contestedClaims, ...agreedClaims].map(claim => claim.id),
    [agreedClaims, contestedClaims]
  );
  const added = usePendingAdds<ClaimSummaryModel>(listedIds);
  const [page, setPage] = React.useState(1);

  // One list (GEO-3854): new claims on top, then disputed, then accepted, each in its own order. A
  // claim listed in both groups shows once, in the first group it appears in.
  const allClaims = React.useMemo<ExplorerClaim[]>(() => {
    const seen = new Set<string>();
    const rows: ExplorerClaim[] = [];
    const push = (claim: ClaimSummaryModel, section: ExplorerClaim['section']) => {
      if (seen.has(claim.id)) return;
      seen.add(claim.id);
      rows.push({ ...claim, section });
    };
    added.rows.forEach(claim => push(claim, 'split'));
    contestedClaims.forEach(claim => push(claim, 'split'));
    agreedClaims.forEach(claim => push(claim, 'agreed'));
    return rows;
  }, [added.rows, agreedClaims, contestedClaims]);
  const voteTargets = React.useMemo(() => allClaims.map(claim => claim.voteTarget), [allClaims]);

  const rankingKey = React.useMemo(() => {
    const sig = allClaims
      .slice(0, 3)
      .map(c => c.id)
      .join(',');
    return `claims:${title}:${sig}`;
  }, [allClaims, title]);

  const ranking = useListRanking({ listKey: rankingKey, items: allClaims });

  const rankableItems = React.useMemo<RankableListItem[]>(
    () =>
      allClaims.map(claim => ({
        id: claim.id,
        title: claim.title,
        badge: claim.kind ? formatClaimKindLabel(claim.kind) : undefined,
        badgeTone: claim.kind ? CLAIM_KIND_TONE[claim.kind] : 'neutral',
        meta:
          claim.split.totalVotes && claim.split.totalVotes > 0
            ? `${formatCompactCount(claim.split.totalVotes)} ${claim.split.totalVotes === 1 ? 'vote' : 'votes'}`
            : undefined,
      })),
    [allClaims]
  );

  const displayList = ranking.orderedItems;
  const totalPages = Math.max(1, Math.ceil(displayList.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const visible = displayList.slice(startIndex, startIndex + PAGE_SIZE);
  if (allClaims.length === 0) return null;

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
            disabled={allClaims.length < 2}
          />
          <AddClaimPopover
            label="Add claim"
            holdDraft={ctx?.callbacks?.holdAddDraft}
            onSubmit={draft => {
              // The new claim goes to the top of the list, so show page 1 where it lands.
              setPage(1);
              added.add(
                state => ({
                  pending: state.status === 'pending',
                  title: draft.title,
                  kind: draft.kind,
                  meta: state.status === 'pending' ? [PUBLISHING_LABEL] : draft.note ? [draft.note] : undefined,
                  split: { rows: [], isSplit: true, totalVotes: 0 },
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
        title={title}
        items={rankableItems}
        initialOrder={ranking.myOrder}
        onClose={ranking.close}
        onPublish={nextOrder => {
          ranking.publish(nextOrder);
          setPage(1);
        }}
      />

      <div className={cx('flex flex-col @[760px]:overflow-hidden', TEMPLATE_CLAIM_LIST_SURFACE)}>
        {/* Every row, so switching page keeps the same lookup and batch. */}
        <TemplateVoteRows targets={voteTargets}>
          <div className="divide-y divide-divider">
            {visible.map((claim, index) => (
              // Names the list, the claim's group and the row on every action taken in it, a vote
              // included. Positions run 1..N down the one list.
              <ActionContextProvider
                key={claim.id}
                value={{
                  list_id: 'template_claims',
                  list_section_id: claim.section,
                  item_position: startIndex + index + 1,
                }}
              >
                <ClaimListRow
                  rank={startIndex + index + 1}
                  claim={claim}
                  isAgreed={claim.section === 'agreed'}
                  hideKindOnPhone={hideKindOnPhone}
                />
              </ActionContextProvider>
            ))}
          </div>
        </TemplateVoteRows>

        {totalPages > 1 && (
          <div className="border-t border-divider py-2.5 @[760px]:px-5">
            <InlinePagination page={safePage} totalPages={totalPages} onPageChange={setPage} label="Claims pages" />
          </div>
        )}
      </div>
    </section>
  );
}

export interface ClaimListRowProps {
  rank: number;
  claim: ClaimSummaryModel;
  /** Marks the title with a check, for a list's Accepted tab. */
  isAgreed?: boolean;
  /** See {@link ClaimExplorerProps.hideKindOnPhone}. */
  hideKindOnPhone?: boolean;
  /** Extra lines under the vote controls, such as a sub-claim's note and source chips. */
  details?: React.ReactNode;
}

/**
 * One claim in a template claim list: rank, title, vote buttons, result and "…". Every template
 * list of claims draws its rows with this, so phones (GEO-3819) and wide rows look the same
 * everywhere (GEO-3837). Wrap it in a `divide-y` card and a `TemplateVoteRows` for its vote batch.
 *
 * One column at every width (GEO-3845): the title across the row, then Agree / Disagree with the
 * result beside them on wide rows ("bar 71% · 7 votes · Judgment"), so nothing floats at the far
 * right. Phones keep the split as its own line under the buttons, as the Claim page's vote box draws it.
 */
export function ClaimListRow({ rank, claim, isAgreed = false, hideKindOnPhone = true, details }: ClaimListRowProps) {
  const voteMetaIndex = claim.meta?.findIndex(part => /\bvotes?\b/i.test(part)) ?? -1;
  // Debate counts aren't shown in claim lists (GEO-3845); a "N debates" meta part is dropped too.
  const debateMetaIndex = claim.meta?.findIndex(part => /\bdebates?\b/i.test(part)) ?? -1;

  const metaParts: string[] = [];
  if (claim.meta && claim.meta.length > 0) {
    for (let i = 0; i < claim.meta.length; i++) {
      if (i !== voteMetaIndex && i !== debateMetaIndex) metaParts.push(claim.meta[i]);
    }
  }

  const votes = Boolean(claim.voteTarget || claim.onVote);
  const youVotedLabel = claim.userVote && !votes ? (claim.userVote === 'agree' ? 'You agreed' : 'You disagreed') : null;
  const kindLabel = claim.kind ? formatClaimKindLabel(claim.kind) : null;

  // Phones show the kind only when the list asks for it.
  const phoneMeta: React.ReactNode[] = [];
  if (kindLabel && !hideKindOnPhone) phoneMeta.push(<span key="kind">{kindLabel}</span>);
  for (const part of metaParts) phoneMeta.push(<span key={`meta-${part}`}>{part}</span>);
  if (youVotedLabel) {
    phoneMeta.push(
      <span key="you" className="font-medium text-text">
        {youVotedLabel}
      </span>
    );
  }

  const titleNode = (
    <span className="block max-w-[720px] text-[19px] leading-[26px] font-medium text-pretty text-text transition-colors group-hover/claim:text-[#4c1fd4]">
      {/* Phones: the rank leads the title instead of holding a column, so the row keeps its width. */}
      <span aria-hidden className="mr-2 text-[17.5px] font-semibold text-grey-04 tabular-nums @[760px]:hidden">
        {rank}
      </span>
      {claim.title}
      {isAgreed && <CheckCircleIcon className="ml-1.5 inline-block size-3.5 align-[-0.15em] text-ctaPrimary" />}
    </span>
  );

  // The buttons, the result beside them and the split lines, from the row's vote binding (or none):
  // the counts follow the viewer's press at once, as the old pill counts did.
  const voteArea = (vote: TemplateVoteBinding | null) => {
    const { splitRows, totalVotes } = claimRowResult(claim, vote);
    const voteCountLabel =
      totalVotes !== undefined
        ? totalVotes > 0
          ? `${formatCompactCount(totalVotes)} ${totalVotes === 1 ? 'vote' : 'votes'}`
          : undefined
        : voteMetaIndex >= 0
          ? claim.meta?.[voteMetaIndex]
          : undefined;

    // Wide rows draw the overall split inline beside the buttons; any per-space rows sit under it.
    const primaryRow = splitRows.find(row => row.isEveryone) ?? splitRows[0];
    const extraRows = splitRows.filter(row => row !== primaryRow);

    // Phones: the split sits under the buttons as the Claim page's vote box draws it (dot, space, bar,
    // "80% (5)"), so the count lives in the parentheses.
    const phoneSplitRows = splitRows.map(row => ({
      ...row,
      voterCount: row.voterCount ?? (splitRows.length === 1 ? totalVotes : undefined),
    }));

    // Quiet gray text after the result on wide rows: "7 votes · Judgment · <meta> · You agreed".
    const wideMeta: React.ReactNode[] = [];
    if (voteCountLabel) wideMeta.push(<span key="votes">{voteCountLabel}</span>);
    else if (votes && !claim.pending) wideMeta.push(<span key="votes">No votes yet</span>);
    if (kindLabel) {
      wideMeta.push(
        <span key="kind" data-testid="claim-kind-tag">
          {kindLabel}
        </span>
      );
    }
    for (const part of metaParts) wideMeta.push(<span key={`meta-${part}`}>{part}</span>);
    if (youVotedLabel) {
      wideMeta.push(
        <span key="you" className="font-medium text-text">
          {youVotedLabel}
        </span>
      );
    }

    const voteButtons = vote ? <ClaimVotePills title={claim.title} vote={vote} /> : null;
    const hasWideResult = Boolean(primaryRow) || wideMeta.length > 0;

    return (
      <>
        {(voteButtons || hasWideResult) && (
          <div
            className={cx(
              'flex-wrap items-center gap-x-4 gap-y-2 @[760px]:mt-2.5 @[760px]:flex',
              voteButtons ? 'mt-2.5 flex' : 'hidden'
            )}
          >
            {/* The debates app's Agree / Disagree (GEO-3845), across the row on phones. */}
            {voteButtons && <div className="basis-full @[760px]:basis-auto">{voteButtons}</div>}

            {hasWideResult && (
              <div className="hidden min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[15px] leading-[20px] text-grey-04 tabular-nums @[760px]:flex">
                {primaryRow && <InlineSplit row={primaryRow} />}
                {wideMeta.map((node, i) => (
                  <React.Fragment key={i}>
                    {(i > 0 || primaryRow) && <span aria-hidden>·</span>}
                    {node}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        )}

        {extraRows.length > 0 && (
          <span className="hidden @[760px]:contents">
            <SplitBars rows={extraRows} density="compact" className="mt-2.5 w-full max-w-[420px]" />
          </span>
        )}

        {phoneSplitRows.length > 0 && (
          <SplitBars rows={phoneSplitRows} density="full" className="mt-3 @[760px]:hidden" />
        )}
      </>
    );
  };

  return (
    // Baseline alignment keeps the rank on the title's first line at every size (Preston, GEO-3857).
    // Phones drop the side padding: the list loses its card there and runs to the page gutter.
    <div className="flex items-baseline gap-3 py-4 transition-colors @[760px]:gap-4 @[760px]:px-5 @[760px]:hover:bg-bg">
      <span className="hidden w-6 shrink-0 text-center text-[17.5px] leading-[26px] font-semibold text-grey-04 tabular-nums @[760px]:block">
        {rank}
      </span>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-w-0">
          {claim.href ? (
            <Link href={claim.href} className="group/claim text-left text-text no-underline">
              {titleNode}
            </Link>
          ) : claim.onSelect ? (
            <button
              type="button"
              onClick={claim.onSelect}
              className="group/claim cursor-pointer border-0 bg-transparent p-0 text-left text-text"
            >
              {titleNode}
            </button>
          ) : (
            titleNode
          )}
        </div>

        {phoneMeta.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-grey-04 @[760px]:hidden">
            {phoneMeta.map((node, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span aria-hidden>·</span>}
                {node}
              </React.Fragment>
            ))}
          </div>
        )}

        {votes ? (
          <ClaimVoteBinding
            voteTarget={claim.voteTarget}
            userVote={claim.userVote}
            agreeCount={claim.agreeCount}
            disagreeCount={claim.disagreeCount}
            onVote={claim.onVote}
            onClearVote={claim.onClearVote}
          >
            {voteArea}
          </ClaimVoteBinding>
        ) : (
          voteArea(null)
        )}

        {details && <div className="mt-3 flex flex-col gap-2">{details}</div>}

        <EntityInlineContext
          targetId={claim.id}
          targetTitle={claim.title}
          targetKind="Claim"
          className="mt-3 @[760px]:mt-2"
        />
      </div>

      <EntityOverflowMenu
        target={{ id: claim.id, kind: 'Claim', title: claim.title }}
        // Level with the title's first line. A pending row's id isn't an entity yet; the menu keeps
        // its space but can't be used.
        className={cx(
          '-my-[3px] shrink-0 self-start @[760px]:-my-px [&>button[aria-haspopup]]:size-8 @[760px]:[&>button[aria-haspopup]]:size-7',
          claim.pending && 'invisible'
        )}
      />
    </div>
  );
}

/**
 * The split rows and vote total a claim row draws. With a vote binding that has counts, the row's
 * overall result comes from it, so a press moves the result at once (the binding adjusts for the
 * viewer's own vote). The overall row is the "Everyone" row, or else a lone row (a Claim page
 * sub-claim's single row names the space its vote target counts in); with several space rows and no
 * Everyone row, an Everyone row goes first. Other rows keep the fetched numbers.
 * No votes, no split, as in the Claim page's vote box.
 */
export function claimRowResult(
  claim: Pick<ClaimSummaryModel, 'split'>,
  vote: Pick<TemplateVoteBinding, 'agreeCount' | 'disagreeCount'> | null
): { splitRows: readonly SplitRow[]; totalVotes: number | undefined } {
  if (vote && vote.agreeCount !== undefined && vote.disagreeCount !== undefined) {
    const total = vote.agreeCount + vote.disagreeCount;
    if (total === 0) return { splitRows: [], totalVotes: 0 };
    const percent = (vote.agreeCount / total) * 100;
    const rows = claim.split.rows;
    // A lone row is the overall one; among several space rows with no Everyone row, none is.
    const primary = rows.find(row => row.isEveryone) ?? (rows.length === 1 ? rows[0] : undefined);
    if (!primary) {
      const everyone: SplitRow = {
        id: 'all',
        label: 'Everyone',
        color: '#202020',
        percent,
        voterCount: total,
        isEveryone: true,
      };
      return { splitRows: [everyone, ...rows], totalVotes: total };
    }
    return {
      splitRows: rows.map(row => (row === primary ? { ...row, percent, voterCount: total } : row)),
      totalVotes: total,
    };
  }
  const totalVotes = claim.split.totalVotes;
  return { splitRows: totalVotes !== 0 ? claim.split.rows : [], totalVotes };
}

/** The overall split drawn inline beside the vote buttons on a wide row: a short bar and its percentage. */
function InlineSplit({ row }: { row: SplitRow }) {
  const clamped = Math.max(0, Math.min(100, row.percent));
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        role="meter"
        aria-label={`${row.label} ${row.unit ?? 'agree'}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        className="block h-2 w-[140px] overflow-hidden rounded-full bg-grey-01"
      >
        <span
          className="block h-full rounded-full transition-[width] duration-200"
          style={{ width: `${clamped.toFixed(2)}%`, backgroundColor: row.color }}
        />
      </span>
      <strong className="text-[17px] font-semibold text-text">{formatPercentInt(clamped)}</strong>
    </span>
  );
}
