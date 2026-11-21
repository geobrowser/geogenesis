'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import {
  type ClaimKind,
  type ClaimSummaryModel,
  type ClaimTemplateModel,
  formatClaimKindLabel,
  formatPercentInt,
} from '../models';
import { ArrowRightIcon, CheckCircleIcon, ChevronRightIcon, SearchIcon } from './icons';
import { SourceChipList } from './source-chip-list';
import { SplitBars } from './split-bars';
import { TEMPLATE_CARD_SURFACE, TemplateBadge, type TemplateBadgeTone } from './template-shell';

const CLAIM_KIND_TONE: Record<ClaimKind, TemplateBadgeTone> = {
  fact: 'fact',
  judgment: 'judgment',
  'value-judgment': 'value',
};

type ClaimFilter = 'all' | 'split' | 'agreed' | 'fact' | 'judgment';
type ClaimSort = 'divided' | 'voted' | 'agreed';

export interface ClaimExplorerProps {
  contestedClaims: readonly ClaimSummaryModel[];
  agreedClaims: readonly ClaimSummaryModel[];
  claimDetailsById: Readonly<Record<string, ClaimTemplateModel>>;
  title?: string;
  className?: string;
}

/**
 * Master–detail interactive Claim Explorer.
 *
 * Lets readers scan, filter, and search across all claims in a topic on the left while
 * immediately voting, checking underlying facts, reading strongest cases, and inspecting
 * cited sources on the right — without page reloads or losing scroll position.
 */
export function ClaimExplorer({
  contestedClaims,
  agreedClaims,
  claimDetailsById,
  title = 'Claims',
  className,
}: ClaimExplorerProps) {
  const allClaims = React.useMemo(() => {
    const seen = new Set<string>();
    const merged: ClaimSummaryModel[] = [];
    for (const claim of [...contestedClaims, ...agreedClaims]) {
      if (seen.has(claim.id)) continue;
      seen.add(claim.id);
      merged.push(claim);
    }
    return merged;
  }, [agreedClaims, contestedClaims]);

  const [filter, setFilter] = React.useState<ClaimFilter>('all');
  const [sort, setSort] = React.useState<ClaimSort>('divided');
  const [query, setQuery] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<string>(allClaims[0]?.id ?? '');

  const normalizedQuery = query.trim().toLowerCase();

  const filteredClaims = React.useMemo(() => {
    const list = allClaims.filter(claim => {
      if (filter === 'split' && !claim.split.isSplit) return false;
      if (filter === 'agreed' && claim.split.isSplit) return false;
      if (filter === 'fact' && claim.kind !== 'fact') return false;
      if (filter === 'judgment' && claim.kind !== 'judgment' && claim.kind !== 'value-judgment') return false;
      if (normalizedQuery && !claim.title.toLowerCase().includes(normalizedQuery)) return false;
      return true;
    });

    if (sort === 'voted') {
      return [...list].sort((a, b) => (b.split.totalVotes ?? 0) - (a.split.totalVotes ?? 0));
    }
    if (sort === 'agreed') {
      return [...list].sort((a, b) => (a.split.gapPoints ?? 0) - (b.split.gapPoints ?? 0));
    }
    return [...list].sort((a, b) => (b.split.gapPoints ?? 0) - (a.split.gapPoints ?? 0));
  }, [allClaims, filter, normalizedQuery, sort]);

  const activeSummary = filteredClaims.find(c => c.id === selectedId) ?? filteredClaims[0] ?? allClaims[0];
  const activeDetail = activeSummary ? claimDetailsById[activeSummary.id] : undefined;

  if (allClaims.length === 0) return null;

  const counts = {
    all: allClaims.length,
    split: allClaims.filter(c => c.split.isSplit).length,
    agreed: allClaims.filter(c => !c.split.isSplit).length,
    fact: allClaims.filter(c => c.kind === 'fact').length,
    judgment: allClaims.filter(c => c.kind === 'judgment' || c.kind === 'value-judgment').length,
  };

  return (
    <section id="claims" aria-label="Claim explorer" className={cx('flex flex-col gap-4', className)}>
      {/* Header + filter pills + search/sort */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-mediumTitle font-semibold text-text">{title}</h2>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex items-center">
            <SearchIcon className="pointer-events-none absolute left-3 size-3.5 text-grey-04" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Filter claims"
              placeholder="Filter claims..."
              className="h-9 w-[180px] rounded-full border border-black/[0.08] bg-white pr-3 pl-8 text-[14px] text-text placeholder:text-grey-04 focus:border-text focus:outline-hidden"
            />
          </div>

          <select
            aria-label="Sort claims"
            value={sort}
            onChange={e => setSort(e.target.value as ClaimSort)}
            className="h-9 cursor-pointer rounded-full border border-black/[0.08] bg-white px-3.5 text-[14px] font-medium text-text focus:border-text focus:outline-hidden"
          >
            <option value="divided">Most divided</option>
            <option value="voted">Most voted</option>
            <option value="agreed">Most agreed</option>
          </select>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'all', label: 'All', count: counts.all },
            { id: 'split', label: 'Split', count: counts.split },
            { id: 'agreed', label: 'Common ground', count: counts.agreed },
            { id: 'fact', label: 'Facts', count: counts.fact },
            { id: 'judgment', label: 'Judgments', count: counts.judgment },
          ] as const
        )
          .filter(tab => tab.id === 'all' || tab.count > 0)
          .map(tab => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(tab.id)}
                className={cx(
                  'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-medium transition-colors',
                  active
                    ? 'border-text bg-text text-white'
                    : 'border-black/[0.06] bg-white text-text hover:border-black/[0.16]'
                )}
              >
                <span>{tab.label}</span>
                <span className={cx('tabular-nums', active ? 'text-white/70' : 'text-grey-04')}>{tab.count}</span>
              </button>
            );
          })}
      </div>

      {/* Unified Master-Detail surface */}
      <div
        className={cx(
          'grid grid-cols-1 overflow-hidden @[860px]:grid-cols-[minmax(0,370px)_minmax(0,1fr)]',
          TEMPLATE_CARD_SURFACE
        )}
      >
        {/* Left: Scannable claim list */}
        <div
          role="listbox"
          aria-label="Claims list"
          className="flex flex-col divide-y divide-divider border-b border-divider @[860px]:max-h-[680px] @[860px]:overflow-y-auto @[860px]:border-r @[860px]:border-b-0"
        >
          {filteredClaims.length === 0 ? (
            <p className="m-0 p-5 text-[15px] text-grey-04">No claims match this filter.</p>
          ) : (
            filteredClaims.map(claim => {
              const isSelected = activeSummary?.id === claim.id;
              const isAgreed = !claim.split.isSplit;
              return (
                <button
                  key={claim.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => setSelectedId(claim.id)}
                  className={cx(
                    'relative flex w-full cursor-pointer flex-col gap-2.5 border-0 px-5 py-4 text-left transition-colors',
                    isSelected ? 'bg-grey-01/85' : 'bg-white hover:bg-bg'
                  )}
                >
                  {isSelected && (
                    <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-text" />
                  )}

                  <div className="flex items-center justify-between gap-2">
                    {isAgreed ? (
                      <span className="inline-flex items-center gap-1 text-[13px] font-medium text-ctaPrimary">
                        <CheckCircleIcon className="size-3.5" />
                        <span>Agreed</span>
                      </span>
                    ) : (
                      <span className="text-[13px] font-medium text-purple">
                        {claim.split.gapPoints !== undefined
                          ? `${Math.round(claim.split.gapPoints)} pts apart`
                          : 'Split'}
                      </span>
                    )}
                    {claim.split.totalVotes !== undefined && (
                      <span className="text-[13px] text-grey-04 tabular-nums">
                        {claim.split.totalVotes.toLocaleString('en-US')} votes
                      </span>
                    )}
                  </div>

                  <span className="text-[16px] leading-[22px] font-semibold text-pretty text-text">{claim.title}</span>

                  {/* Mini inline split bars */}
                  {claim.split.rows.length > 0 && (
                    <div className="flex flex-col gap-1.5 pt-0.5">
                      {claim.split.rows.slice(0, 2).map(row => (
                        <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_36px] items-center gap-2.5">
                          <div className="h-[5px] overflow-hidden rounded-full bg-grey-01">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.max(0, Math.min(100, row.percent))}%`,
                                backgroundColor: row.color,
                              }}
                            />
                          </div>
                          <span className="text-right text-[13px] font-semibold text-text tabular-nums">
                            {formatPercentInt(row.percent)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Right: Instant Claim detail inspector */}
        {activeSummary && <ClaimInspectorPane summary={activeSummary} detail={activeDetail} />}
      </div>
    </section>
  );
}

function ClaimInspectorPane({ summary, detail }: { summary: ClaimSummaryModel; detail?: ClaimTemplateModel }) {
  const split = detail?.split ?? summary.split;
  const isSplit = split.isSplit;
  const kind = detail?.kind ?? summary.kind;

  return (
    <article className="flex min-w-0 flex-col justify-between gap-5 p-5 @[560px]:p-6">
      <div className="flex flex-col gap-5">
        {/* Top badges + Open full claim link */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <TemplateBadge tone={isSplit ? 'split' : 'agreed'}>
              {isSplit ? 'Contested claim' : 'Agreed claim'}
            </TemplateBadge>
            {kind && <TemplateBadge tone={CLAIM_KIND_TONE[kind]}>{formatClaimKindLabel(kind)}</TemplateBadge>}
            {detail?.debateCount !== undefined && detail.debateCount > 0 && detail.onOpenDebates && (
              <button
                type="button"
                onClick={detail.onOpenDebates}
                className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-ctaPrimary/15 bg-ctaTertiary px-2.5 text-[14px] font-medium text-ctaPrimary transition-colors hover:bg-ctaPrimary hover:text-white"
              >
                <span>
                  {detail.debateCount} {detail.debateCount === 1 ? 'debate' : 'debates'}
                </span>
                <ChevronRightIcon className="size-3.5" />
              </button>
            )}
          </div>

          {summary.href ? (
            <Link
              href={summary.href}
              className="inline-flex items-center gap-1.5 text-[14.5px] font-medium text-ctaPrimary no-underline hover:text-ctaHover"
            >
              <span>Open full claim</span>
              <ArrowRightIcon className="size-4" />
            </Link>
          ) : summary.onSelect ? (
            <button
              type="button"
              onClick={summary.onSelect}
              className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[14.5px] font-medium text-ctaPrimary hover:text-ctaHover"
            >
              <span>Open full claim</span>
              <ArrowRightIcon className="size-4" />
            </button>
          ) : null}
        </div>

        {/* Title */}
        <h3 className="m-0 text-[24px] leading-[30px] font-semibold tracking-[-0.015em] text-pretty text-text">
          {summary.title}
        </h3>

        {/* Split bars + inline quick Vote */}
        <div className="flex flex-col gap-4 rounded-xl bg-grey-01/60 p-4">
          <SplitBars rows={split.rows} density="full" />

          {detail?.voteBox && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={detail.voteBox.disabled}
                  aria-pressed={detail.voteBox.userVote === 'agree'}
                  onClick={() => detail.voteBox.onVote('agree')}
                  className={cx(
                    'inline-flex h-9 cursor-pointer items-center rounded-full border px-4 text-[14.5px] font-medium transition-colors',
                    detail.voteBox.userVote === 'agree'
                      ? 'border-text bg-text text-white'
                      : 'border-grey-02 bg-white text-text hover:border-text'
                  )}
                >
                  Agree
                </button>
                <button
                  type="button"
                  disabled={detail.voteBox.disabled}
                  aria-pressed={detail.voteBox.userVote === 'disagree'}
                  onClick={() => detail.voteBox.onVote('disagree')}
                  className={cx(
                    'inline-flex h-9 cursor-pointer items-center rounded-full border px-4 text-[14.5px] font-medium transition-colors',
                    detail.voteBox.userVote === 'disagree'
                      ? 'border-text bg-text text-white'
                      : 'border-grey-02 bg-white text-text hover:border-text'
                  )}
                >
                  Disagree
                </button>
                {detail.voteBox.userVote && detail.voteBox.onClear && (
                  <button
                    type="button"
                    onClick={detail.voteBox.onClear}
                    className="cursor-pointer border-0 bg-transparent px-1 text-[14px] font-medium text-ctaPrimary hover:text-ctaHover"
                  >
                    Change
                  </button>
                )}
              </div>
              <span className="text-[13.5px] text-grey-04">{detail.voteBox.countSummary}</span>
            </div>
          )}
        </div>

        {/* Agreed basis (for agreed claims) */}
        {detail?.agreedBasis && (
          <div className="flex flex-col gap-3">
            <span className="text-[13px] font-semibold tracking-[0.04em] text-grey-04 uppercase">
              What both communities agree on
            </span>
            <p className="m-0 text-[16px] leading-[24px] text-text/90">{detail.agreedBasis.summary}</p>
            {detail.agreedBasis.settlingSources.length > 0 && (
              <SourceChipList sources={detail.agreedBasis.settlingSources} />
            )}
          </div>
        )}

        {/* Underlying facts (for contested claims) */}
        {detail?.subClaims && detail.subClaims.length > 0 && (
          <div className="flex flex-col gap-3">
            <span className="text-[13px] font-semibold tracking-[0.04em] text-grey-04 uppercase">
              The facts it turns on
            </span>
            <div className="flex flex-col divide-y divide-divider">
              {detail.subClaims.map(fact => (
                <div key={fact.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-1">
                    <span className="text-[15.5px] leading-[21px] font-semibold text-text">{fact.title}</span>
                    {fact.stat && <span className="text-[14px] leading-[20px] text-grey-04">{fact.stat}</span>}
                  </div>
                  <SplitBars rows={fact.split.rows} density="compact" />
                  {fact.sources.length > 0 && <SourceChipList sources={fact.sources} />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Compact strongest cases */}
        {detail?.strongestCases && detail.strongestCases.length > 0 && (
          <div className="grid grid-cols-1 gap-3 border-t border-divider pt-4 @[620px]:grid-cols-2">
            {detail.strongestCases.map(item => (
              <div key={item.id} className="flex flex-col gap-2 rounded-lg bg-grey-01/65 p-3.5">
                <span className="inline-flex items-center gap-2 text-[14.5px] font-semibold text-text">
                  <span
                    aria-hidden
                    className="inline-block size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: item.accentColor }}
                  />
                  {item.title}
                </span>
                {item.points[0] && <p className="m-0 text-[14.5px] leading-[21px] text-text/85">{item.points[0]}</p>}
                {item.sources.length > 0 && <SourceChipList sources={item.sources.slice(0, 2)} />}
              </div>
            ))}
          </div>
        )}

        {/* Fallback basis summary when no full detail model exists */}
        {!detail && summary.basisSummary && (
          <p className="m-0 text-[15.5px] leading-[23px] text-grey-04">{summary.basisSummary}</p>
        )}
      </div>
    </article>
  );
}
