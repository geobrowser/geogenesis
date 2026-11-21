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
import { ArrowRightIcon, CheckCircleIcon, ChevronRightIcon, NetworkIcon, SearchIcon } from './icons';
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
 * Visual Master–Detail Claim & Relations Explorer.
 *
 * Left rail: scannable Dumbbell Split Spectrum (connecting Community A & Community B dots along a
 * 0–100% agreement track so consensus vs. sharp divides pop visually at a glance).
 * Right pane: Visual Argument & Relation Tree branching from the selected Claim down into its
 * underlying sub-claims (`Turns on`), typed graph neighborhood (`Actors`, `Events`, `Sources`),
 * and community cases — with inline voting and zero-context-loss source/entity peeking.
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

  // Extract community legend from the first claim with 2+ community rows
  const legendRows = allClaims
    .find(c => c.split.rows.filter(r => !r.isEveryone).length >= 2)
    ?.split.rows.filter(r => !r.isEveryone)
    .slice(0, 2);

  return (
    <section id="claims" aria-label="Claim explorer" className={cx('flex flex-col gap-4', className)}>
      {/* Header + search/sort */}
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

      {/* Filter pills + dumbbell legend */}
      <div className="flex flex-wrap items-center justify-between gap-3">
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

        {legendRows && legendRows.length === 2 && (
          <div className="flex items-center gap-4 text-[13.5px] text-grey-04">
            {legendRows.map(row => (
              <span key={row.id} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
                <span>{row.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Unified Master-Detail surface */}
      <div
        className={cx(
          'grid grid-cols-1 overflow-hidden @[860px]:grid-cols-[minmax(0,390px)_minmax(0,1fr)]',
          TEMPLATE_CARD_SURFACE
        )}
      >
        {/* Left: Visual Dumbbell Split Spectrum list */}
        <div
          role="listbox"
          aria-label="Claims list"
          className="flex flex-col divide-y divide-divider border-b border-divider @[860px]:max-h-[760px] @[860px]:overflow-y-auto @[860px]:border-r @[860px]:border-b-0"
        >
          {/* Scale header */}
          <div className="flex items-center justify-between bg-bg/70 px-5 py-2 text-[12px] font-medium text-grey-04">
            <span>0% agree</span>
            <span>50%</span>
            <span>100% agree</span>
          </div>

          {filteredClaims.length === 0 ? (
            <p className="m-0 p-5 text-[15px] text-grey-04">No claims match this filter.</p>
          ) : (
            filteredClaims.map(claim => {
              const isSelected = activeSummary?.id === claim.id;
              const isAgreed = !claim.split.isSplit;
              const communityRows = claim.split.rows.filter(r => !r.isEveryone).slice(0, 2);
              const detail = claimDetailsById[claim.id];
              const subCount = detail?.subClaims?.length ?? 0;
              const relCount = detail?.graphConnections?.reduce((acc, g) => acc + g.items.length, 0) ?? 0;

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
                    <span className="text-[12.5px] text-grey-04 tabular-nums">
                      {[
                        subCount > 0 ? `${subCount} sub-claims` : null,
                        relCount > 0 ? `${relCount} links` : null,
                        claim.split.totalVotes !== undefined
                          ? `${claim.split.totalVotes.toLocaleString('en-US')} votes`
                          : null,
                      ]
                        .filter(Boolean)
                        .slice(0, 2)
                        .join(' · ')}
                    </span>
                  </div>

                  <span className="text-[15.5px] leading-[21px] font-semibold text-pretty text-text">
                    {claim.title}
                  </span>

                  {/* Visual Dumbbell Spectrum Track (0–100%) */}
                  {communityRows.length === 2 ? (
                    <SplitDumbbellTrack rowA={communityRows[0]} rowB={communityRows[1]} isSplit={claim.split.isSplit} />
                  ) : (
                    claim.split.rows.length > 0 && <SplitBars rows={claim.split.rows} density="compact" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Right: Visual Claim Argument & Relations Tree */}
        {activeSummary && <ClaimRelationTreePane summary={activeSummary} detail={activeDetail} />}
      </div>
    </section>
  );
}

function SplitDumbbellTrack({
  rowA,
  rowB,
  isSplit,
}: {
  rowA: { color: string; percent: number; label: string };
  rowB: { color: string; percent: number; label: string };
  isSplit: boolean;
}) {
  const pA = Math.max(0, Math.min(100, rowA.percent));
  const pB = Math.max(0, Math.min(100, rowB.percent));
  const left = Math.min(pA, pB);
  const width = Math.max(2, Math.abs(pA - pB));
  const leftRow = pA <= pB ? { ...rowA, p: pA } : { ...rowB, p: pB };
  const rightRow = pA <= pB ? { ...rowB, p: pB } : { ...rowA, p: pA };

  return (
    <div className="flex flex-col gap-1 pt-1">
      <div className="relative flex h-5 items-center">
        {/* Baseline track */}
        <div className="h-[3px] w-full rounded-full bg-grey-01" />
        {/* Midpoint tick */}
        <span aria-hidden className="absolute left-1/2 h-2.5 w-px -translate-x-1/2 bg-grey-02" />
        {/* Range bridge between communities */}
        <div
          aria-hidden
          className="absolute h-[4px] rounded-full transition-all duration-200"
          style={{
            left: `${left}%`,
            width: `${width}%`,
            background: isSplit ? `linear-gradient(90deg, ${leftRow.color}, ${rightRow.color})` : '#3963fe',
            opacity: isSplit ? 0.55 : 0.35,
          }}
        />
        {/* Left dot */}
        <span
          title={`${leftRow.label}: ${formatPercentInt(leftRow.p)}`}
          className="absolute size-3 -translate-x-1/2 rounded-full ring-2 ring-white transition-all duration-200"
          style={{ left: `${leftRow.p}%`, backgroundColor: leftRow.color }}
        />
        {/* Right dot */}
        <span
          title={`${rightRow.label}: ${formatPercentInt(rightRow.p)}`}
          className="absolute size-3 -translate-x-1/2 rounded-full ring-2 ring-white transition-all duration-200"
          style={{ left: `${rightRow.p}%`, backgroundColor: rightRow.color }}
        />
      </div>

      <div className="flex items-center justify-between text-[12.5px] font-semibold tabular-nums">
        <span style={{ color: leftRow.color }}>{formatPercentInt(leftRow.p)}</span>
        <span style={{ color: rightRow.color }}>{formatPercentInt(rightRow.p)}</span>
      </div>
    </div>
  );
}

function ClaimRelationTreePane({ summary, detail }: { summary: ClaimSummaryModel; detail?: ClaimTemplateModel }) {
  const split = detail?.split ?? summary.split;
  const isSplit = split.isSplit;
  const kind = detail?.kind ?? summary.kind;

  const hasSubClaims = Boolean(detail?.subClaims && detail.subClaims.length > 0);
  const hasGraphConnections = Boolean(detail?.graphConnections && detail.graphConnections.length > 0);
  const splitNextSection = detail?.sections.find(s => s.id === 'split-next');
  const hasSplitNext = Boolean(splitNextSection && splitNextSection.items.length > 0);

  return (
    <article className="flex min-w-0 flex-col gap-5 p-5 @[560px]:p-6">
      {/* Root Claim Node */}
      <div className="flex flex-col gap-4 rounded-xl border border-black/[0.06] bg-bg/70 p-4 @[560px]:p-5">
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
              className="inline-flex items-center gap-1.5 text-[14px] font-medium text-ctaPrimary no-underline hover:text-ctaHover"
            >
              <span>Open full claim</span>
              <ArrowRightIcon className="size-4" />
            </Link>
          ) : summary.onSelect ? (
            <button
              type="button"
              onClick={summary.onSelect}
              className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[14px] font-medium text-ctaPrimary hover:text-ctaHover"
            >
              <span>Open full claim</span>
              <ArrowRightIcon className="size-4" />
            </button>
          ) : null}
        </div>

        <h3 className="m-0 text-[22px] leading-[28px] font-semibold tracking-[-0.015em] text-pretty text-text">
          {summary.title}
        </h3>

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
                  'inline-flex h-9 cursor-pointer items-center rounded-full border px-4 text-[14px] font-medium transition-colors',
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
                  'inline-flex h-9 cursor-pointer items-center rounded-full border px-4 text-[14px] font-medium transition-colors',
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

      {/* Visual Tree Branches radiating from Root Claim */}
      {(detail?.agreedBasis || hasSubClaims || hasGraphConnections || hasSplitNext) && (
        <div className="relative ml-4 flex flex-col gap-5 border-l-2 border-divider pl-6">
          {/* Branch 1: Agreed Basis */}
          {detail?.agreedBasis && (
            <div className="relative flex flex-col gap-2.5">
              <span aria-hidden className="absolute top-3 -left-[26px] h-[2px] w-5 bg-divider" />
              <span
                aria-hidden
                className="absolute top-[9px] -left-[30px] size-2 rounded-full bg-ctaPrimary ring-2 ring-white"
              />
              <span className="text-[12.5px] font-semibold tracking-[0.04em] text-ctaPrimary uppercase">
                What both communities agree on
              </span>
              <p className="m-0 text-[15px] leading-[23px] text-text/85">{detail.agreedBasis.summary}</p>
              {detail.agreedBasis.settlingSources.length > 0 && (
                <SourceChipList sources={detail.agreedBasis.settlingSources} />
              )}
            </div>
          )}

          {/* Branch 2: Sub-claims ("Turns on") */}
          {hasSubClaims && detail?.subClaims && (
            <div className="relative flex flex-col gap-3">
              <span aria-hidden className="absolute top-3 -left-[26px] h-[2px] w-5 bg-divider" />
              <span
                aria-hidden
                className="absolute top-[9px] -left-[30px] size-2 rounded-full bg-purple ring-2 ring-white"
              />
              <span className="text-[12.5px] font-semibold tracking-[0.04em] text-purple uppercase">
                Turns on ({detail.subClaims.length} underlying claims)
              </span>

              <div className="flex flex-col gap-2.5">
                {detail.subClaims.map(fact => (
                  <div
                    key={fact.id}
                    className="flex flex-col gap-2 rounded-xl border border-black/[0.045] bg-white p-3.5 shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
                  >
                    <span className="text-[15px] leading-[21px] font-semibold text-text">{fact.title}</span>
                    {fact.stat && <span className="text-[13.5px] leading-[19px] text-grey-04">{fact.stat}</span>}
                    <SplitBars rows={fact.split.rows} density="compact" />
                    {fact.sources.length > 0 && <SourceChipList sources={fact.sources} />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Branch 3: Where they split next (for agreed claims) */}
          {hasSplitNext && splitNextSection && (
            <div className="relative flex flex-col gap-2.5">
              <span aria-hidden className="absolute top-3 -left-[26px] h-[2px] w-5 bg-divider" />
              <span
                aria-hidden
                className="absolute top-[9px] -left-[30px] size-2 rounded-full bg-purple ring-2 ring-white"
              />
              <span className="text-[12.5px] font-semibold tracking-[0.04em] text-purple uppercase">
                Leads to contested claims
              </span>
              <div className="flex flex-wrap gap-2">
                {splitNextSection.items.map(nextItem => (
                  <button
                    key={nextItem.id}
                    type="button"
                    onClick={nextItem.onSelect}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-black/[0.06] bg-white px-3.5 py-2 text-left text-[14px] font-medium text-text shadow-[0_2px_8px_rgba(0,0,0,0.03)] transition-colors hover:border-purple/40 hover:text-purple"
                  >
                    <span>{nextItem.title}</span>
                    <ArrowRightIcon className="size-3.5 shrink-0 text-grey-04" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Branch 4: Typed Graph Relations (Actors, Events, Sources) */}
          {hasGraphConnections && detail?.graphConnections && (
            <div className="relative flex flex-col gap-3">
              <span aria-hidden className="absolute top-3 -left-[26px] h-[2px] w-5 bg-divider" />
              <span
                aria-hidden
                className="absolute top-[9px] -left-[30px] size-2 rounded-full bg-text ring-2 ring-white"
              />
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold tracking-[0.04em] text-grey-04 uppercase">
                <NetworkIcon className="size-3.5 text-text" />
                <span>Connected in the graph</span>
              </span>

              <div className="flex flex-col gap-2.5">
                {detail.graphConnections.map(group => (
                  <div
                    key={group.predicate}
                    className="grid grid-cols-1 items-baseline gap-1.5 @[520px]:grid-cols-[72px_minmax(0,1fr)]"
                  >
                    <span className="text-[13.5px] font-medium text-grey-04">{group.predicate}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={item.onSelect}
                          className="inline-flex h-8 max-w-[240px] cursor-pointer items-center gap-1.5 rounded-full border border-black/[0.06] bg-white px-3 text-[13.5px] font-medium text-text shadow-[0_1px_4px_rgba(0,0,0,0.03)] transition-colors hover:border-ctaPrimary/40 hover:bg-ctaTertiary hover:text-ctaPrimary"
                        >
                          <span className="truncate">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Compact strongest cases */}
      {detail?.strongestCases && detail.strongestCases.length > 0 && (
        <div className="grid grid-cols-1 gap-3 border-t border-divider pt-4 @[620px]:grid-cols-2">
          {detail.strongestCases.map(item => (
            <div key={item.id} className="relative flex flex-col gap-2 overflow-hidden rounded-xl bg-grey-01/65 p-4">
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-[2.5px]"
                style={{ backgroundColor: item.accentColor }}
              />
              <span className="inline-flex items-center gap-2 text-[14.5px] font-semibold text-text">
                <span
                  aria-hidden
                  className="inline-block size-2 shrink-0 rounded-full"
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
        <p className="m-0 text-[15px] leading-[22px] text-grey-04">{summary.basisSummary}</p>
      )}
    </article>
  );
}
