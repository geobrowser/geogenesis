'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { TopicEntityGraphModel, TopicGraphNodeModel } from '../models';
import { ArrowLeftIcon, ArrowRightIcon, ChevronRightIcon } from './icons';
import { SplitBars } from './split-bars';
import { TEMPLATE_CARD_SURFACE, TemplateBadge } from './template-shell';

export interface EntityGraphExplorerProps {
  graph: TopicEntityGraphModel;
  className?: string;
}

type InspectorTab = 'details' | 'relations' | 'claims';

const VIEW_W = 580;
const VIEW_H = 420;
const CENTER_X = 290;
const CENTER_Y = 200;
const RING_RX = 208;
const RING_RY = 148;

function initialsFor(name: string): string {
  const words = name
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'G';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
}

function truncateLabel(value: string, max = 20): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * Interactive radial entity relationship explorer ("Who's who").
 *
 * Unified soft-shadow split card: entity inspector with underline tabs on the left,
 * subtle dot-grid radial relationship graph on the right with non-overlapping nodes & edge pills.
 */
export function EntityGraphExplorer({ graph, className }: EntityGraphExplorerProps) {
  const nodeById = React.useMemo(
    () => Object.fromEntries(graph.nodes.map(node => [node.id, node])) as Record<string, TopicGraphNodeModel>,
    [graph.nodes]
  );

  const featuredNodes = React.useMemo(() => {
    const flagged = graph.nodes.filter(node => node.featured);
    return flagged.length > 0 ? flagged : graph.nodes.slice(0, 10);
  }, [graph.nodes]);

  const fallbackId = graph.initialNodeId && nodeById[graph.initialNodeId] ? graph.initialNodeId : graph.nodes[0]?.id;
  const [activeId, setActiveId] = React.useState<string>(fallbackId ?? '');
  const [history, setHistory] = React.useState<string[]>([]);
  const [tab, setTab] = React.useState<InspectorTab>('details');

  const activeNode = nodeById[activeId] ?? (fallbackId ? nodeById[fallbackId] : undefined);

  const selectNode = React.useCallback(
    (nextId: string) => {
      const target = nodeById[nextId];
      if (!target || nextId === activeNode?.id) return;
      setHistory(prev => (activeNode ? [...prev, activeNode.id].slice(-8) : prev));
      setActiveId(nextId);
      setTab(prev => (prev === 'claims' && !(target.claims && target.claims.length > 0) ? 'details' : prev));
    },
    [activeNode, nodeById]
  );

  const goBack = React.useCallback(() => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const previousId = prev[prev.length - 1];
      if (nodeById[previousId]) {
        setActiveId(previousId);
      }
      return prev.slice(0, -1);
    });
  }, [nodeById]);

  if (!activeNode) return null;

  const resolvedRelations = activeNode.relations
    .map(rel => ({ rel, target: nodeById[rel.targetId] }))
    .filter((entry): entry is { rel: (typeof activeNode.relations)[number]; target: TopicGraphNodeModel } =>
      Boolean(entry.target)
    );

  const radialNeighbors = resolvedRelations.slice(0, 5).map((entry, index, list) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / list.length;
    const x = Math.round(CENTER_X + Math.cos(angle) * RING_RX);
    const y = Math.round(CENTER_Y + Math.sin(angle) * RING_RY);
    // Keep edge label pills clear of both the center tile and outer satellite labels
    const t = Math.abs(Math.cos(angle)) > 0.7 ? 0.44 : 0.48;
    const mx = Math.round(CENTER_X + (x - CENTER_X) * t);
    const my = Math.round(CENTER_Y + (y - CENTER_Y) * t);
    return { ...entry, x, y, mx, my };
  });

  const previousNodeId = history[history.length - 1];
  const previousNode = previousNodeId ? nodeById[previousNodeId] : undefined;
  const claims = activeNode.claims ?? [];

  return (
    <section id="whos-who" aria-label={graph.title ?? 'Who’s who'} className={cx('flex flex-col gap-4', className)}>
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-mediumTitle font-semibold text-text">{graph.title ?? 'Who’s who'}</h2>
        {graph.subtitle && <p className="m-0 text-[15px] text-grey-04">{graph.subtitle}</p>}
      </div>

      {/* Horizontal actor selector strip */}
      <div className="flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Featured entities">
        {featuredNodes.map(node => {
          const isSelected = node.id === activeNode.id;
          return (
            <button
              key={node.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => selectNode(node.id)}
              className={cx(
                'flex shrink-0 cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition-all',
                isSelected
                  ? 'border-purple/30 bg-white shadow-[0_8px_24px_-4px_rgba(104,51,255,0.14),0_2px_6px_rgba(0,0,0,0.04)]'
                  : 'border-black/[0.025] bg-white shadow-[0_6px_20px_-4px_rgba(0,0,0,0.055),0_1px_4px_rgba(0,0,0,0.025)] hover:border-black/[0.06]'
              )}
            >
              <span
                className={cx(
                  'grid size-8 shrink-0 place-items-center rounded-lg text-[12px] font-semibold',
                  isSelected ? 'bg-text text-white' : 'bg-grey-01 text-text'
                )}
              >
                {initialsFor(node.name)}
              </span>
              <span className="flex flex-col">
                <span className="text-[14.5px] leading-[18px] font-semibold whitespace-nowrap text-text">
                  {node.name}
                </span>
                <span className="text-[12.5px] leading-[16px] whitespace-nowrap text-grey-04">
                  {truncateLabel(node.kind, 24)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Unified split card: Inspector Left + Dot-grid Radial Graph Right */}
      <div
        className={cx(
          'grid grid-cols-1 overflow-hidden @[860px]:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]',
          TEMPLATE_CARD_SURFACE
        )}
      >
        {/* Left: Entity inspector */}
        <article className="flex flex-col justify-between gap-4 p-5 @[560px]:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="inline-grid size-11 shrink-0 place-items-center rounded-xl bg-text text-[15px] font-semibold text-white">
                    {initialsFor(activeNode.name)}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <h3 className="m-0 text-[22px] leading-[26px] font-semibold text-text">{activeNode.name}</h3>
                    <span className="text-[14.5px] text-grey-04">{activeNode.kind}</span>
                  </div>
                </div>
                {previousNode && (
                  <button
                    type="button"
                    onClick={goBack}
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[14px] font-medium text-ctaPrimary hover:text-ctaHover"
                  >
                    <ArrowLeftIcon className="size-3.5" />
                    <span>Back to {truncateLabel(previousNode.name, 14)}</span>
                  </button>
                )}
              </div>

              {activeNode.tags && activeNode.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {activeNode.tags.map(tag => (
                    <TemplateBadge key={tag} tone="neutral">
                      {tag}
                    </TemplateBadge>
                  ))}
                </div>
              )}
            </div>

            {/* Clean underline tabs */}
            <div className="flex gap-5 border-b border-divider" role="tablist" aria-label="Entity details">
              {(
                [
                  { id: 'details', label: 'Details' },
                  { id: 'relations', label: `Relationships (${resolvedRelations.length})` },
                  { id: 'claims', label: `Claims (${claims.length})` },
                ] as const
              ).map(entry => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === entry.id}
                  onClick={() => setTab(entry.id)}
                  className={cx(
                    '-mb-px cursor-pointer border-0 border-b-2 bg-transparent px-0.5 pb-2.5 text-[15px] font-medium transition-colors',
                    tab === entry.id ? 'border-text text-text' : 'border-transparent text-grey-04 hover:text-text'
                  )}
                >
                  {entry.label}
                </button>
              ))}
            </div>

            {tab === 'details' && (
              <div className="flex flex-col gap-3 pt-1">
                <p className="m-0 text-[15px] leading-[23px] text-text/85">{activeNode.summary}</p>
                {activeNode.href ? (
                  <Link
                    href={activeNode.href}
                    className="inline-flex items-center gap-1.5 self-start text-[15px] font-medium text-ctaPrimary no-underline hover:text-ctaHover"
                  >
                    <span>Open entity page</span>
                    <ArrowRightIcon className="size-4" />
                  </Link>
                ) : activeNode.onSelect ? (
                  <button
                    type="button"
                    onClick={activeNode.onSelect}
                    className="inline-flex cursor-pointer items-center gap-1.5 self-start border-0 bg-transparent p-0 text-[15px] font-medium text-ctaPrimary hover:text-ctaHover"
                  >
                    <span>Open related page</span>
                    <ArrowRightIcon className="size-4" />
                  </button>
                ) : null}
              </div>
            )}

            {tab === 'relations' && (
              <div className="flex flex-col divide-y divide-divider">
                {resolvedRelations.length === 0 ? (
                  <p className="m-0 text-[15px] text-grey-04">No linked relationships yet.</p>
                ) : (
                  resolvedRelations.map(({ rel, target }) => (
                    <button
                      key={`${rel.targetId}-${rel.label}`}
                      type="button"
                      onClick={() => selectNode(target.id)}
                      className="group flex w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent py-3 text-left transition-colors first:pt-1 last:pb-0"
                    >
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[14px] text-grey-04">{rel.label}</span>
                        <span className="text-[16px] font-medium text-text group-hover:text-ctaPrimary">
                          {target.name}
                        </span>
                        {rel.sourceNote && <span className="text-[13.5px] text-grey-04">{rel.sourceNote}</span>}
                      </span>
                      <ChevronRightIcon className="size-4 text-grey-03 transition-transform group-hover:translate-x-0.5 group-hover:text-ctaPrimary" />
                    </button>
                  ))
                )}
              </div>
            )}

            {tab === 'claims' && (
              <div className="flex flex-col gap-3">
                {claims.length === 0 ? (
                  <p className="m-0 text-[15px] text-grey-04">No claims attached directly to this entity yet.</p>
                ) : (
                  claims.map(claim => (
                    <div key={claim.id} className="flex flex-col gap-2 rounded-lg bg-grey-01/70 p-3.5">
                      {claim.href ? (
                        <Link
                          href={claim.href}
                          className="text-[15px] leading-[21px] font-semibold text-text no-underline hover:text-ctaPrimary"
                        >
                          {claim.title}
                        </Link>
                      ) : claim.onSelect ? (
                        <button
                          type="button"
                          onClick={claim.onSelect}
                          className="cursor-pointer border-0 bg-transparent p-0 text-left text-[15px] leading-[21px] font-semibold text-text hover:text-ctaPrimary"
                        >
                          {claim.title}
                        </button>
                      ) : (
                        <span className="text-[15px] leading-[21px] font-semibold text-text">{claim.title}</span>
                      )}
                      <SplitBars rows={claim.split.rows} density="compact" />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </article>

        {/* Right: Subtle dot-grid radial relationship canvas */}
        <div
          className="relative flex flex-col justify-center border-t border-divider p-4 @[860px]:border-t-0 @[860px]:border-l"
          style={{
            backgroundColor: '#fafafa',
            backgroundImage: 'radial-gradient(#e4e4e7 1px, transparent 1px)',
            backgroundSize: '16px 16px',
          }}
        >
          <div className="relative mx-auto aspect-[580/420] w-full max-w-[560px]">
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className="h-full w-full overflow-visible"
              role="img"
              aria-label={`Relationship graph centered on ${activeNode.name}`}
            >
              {/* Connecting hairline edges */}
              {radialNeighbors.map(item => (
                <line
                  key={`edge-${item.target.id}-${item.rel.label}`}
                  x1={CENTER_X}
                  y1={CENTER_Y}
                  x2={item.x}
                  y2={item.y}
                  stroke="#d4d4d8"
                  strokeWidth="1.5"
                />
              ))}

              {/* Edge label pills */}
              {radialNeighbors.map(item => {
                const label = truncateLabel(item.rel.label, 15);
                const pillWidth = Math.max(50, label.length * 6.2 + 16);
                return (
                  <g key={`label-${item.target.id}-${item.rel.label}`}>
                    <rect
                      x={item.mx - pillWidth / 2}
                      y={item.my - 10}
                      width={pillWidth}
                      height={20}
                      rx={10}
                      fill="#ffffff"
                      stroke="#e5e5e5"
                      strokeWidth="1"
                    />
                    <text
                      x={item.mx}
                      y={item.my + 3.5}
                      textAnchor="middle"
                      fontSize="11"
                      fill="#606060"
                      fontWeight="500"
                    >
                      {label}
                    </text>
                  </g>
                );
              })}

              {/* Center node */}
              <g>
                <rect
                  x={CENTER_X - 28}
                  y={CENTER_Y - 28}
                  width="56"
                  height="56"
                  rx="16"
                  fill="#202020"
                  stroke="#6833ff"
                  strokeWidth="2.5"
                />
                <text x={CENTER_X} y={CENTER_Y + 5} textAnchor="middle" fontSize="15" fontWeight="600" fill="#ffffff">
                  {initialsFor(activeNode.name)}
                </text>
              </g>
            </svg>

            {/* Interactive satellite node buttons with crisp non-clipping cards */}
            {radialNeighbors.map(item => (
              <button
                key={`node-${item.target.id}-${item.rel.label}`}
                type="button"
                onClick={() => selectNode(item.target.id)}
                style={{
                  left: `${(item.x / VIEW_W) * 100}%`,
                  top: `${(item.y / VIEW_H) * 100}%`,
                }}
                className="group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center gap-1.5 border-0 bg-transparent p-0 focus:outline-hidden"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-black/[0.08] bg-white text-[13px] font-semibold text-text shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all group-hover:-translate-y-0.5 group-hover:border-ctaPrimary group-hover:text-ctaPrimary">
                  {initialsFor(item.target.name)}
                </span>
                <span className="max-w-[120px] rounded-md bg-white/95 px-2 py-0.5 text-center text-[12.5px] leading-[15px] font-semibold text-text shadow-[0_1px_3px_rgba(0,0,0,0.06)] group-hover:text-ctaPrimary">
                  {truncateLabel(item.target.name, 20)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
