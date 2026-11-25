'use client';

import * as React from 'react';

import cx from 'classnames';

import { useGraphAnalytics } from '~/core/graph-explorer/graph-explorer-analytics';
import { GRAPH_KINDS, GRAPH_KIND_LABELS } from '~/core/graph-explorer/graph-kinds';
import type { GraphShareResult } from '~/core/graph-explorer/graph-share';
import type { GraphKindFilter } from '~/core/graph-explorer/select-graph';

import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { Close } from '~/design-system/icons/close';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

const ROUND =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#dbdbdb] text-[16px] text-text hover:border-text';

/** The design's top bar: Back, where you are, in-map search, kind chips, share, close. */
export function GraphTopBar({
  back,
  trail,
  search,
  kinds,
  kindFilter,
  onKindFilter,
  share = null,
  close,
}: {
  back: { label: string; onClick: () => void } | null;
  /** Names from the start of the walk to the centre, which is last. */
  trail: string[];
  search: React.ReactNode;
  /** Kinds around the centre, for the chips beside Everything; topics have none (only Everything shows them). */
  kinds: readonly GraphKindFilter[];
  kindFilter: GraphKindFilter;
  onKindFilter: (kind: GraphKindFilter) => void;
  /** `native`: the phone's share sheet, else the link is copied. */
  share?: { native: boolean; onShare: () => Promise<GraphShareResult> } | null;
  close: { href: string; label: string } | null;
}) {
  const analytics = useGraphAnalytics();
  // The chip in force keeps its place even with none of its kind around this centre (a shared
  // link, or a same-kind hop), so the row always says what the map is filtered to.
  const chips: GraphKindFilter[] = [
    'all',
    ...GRAPH_KINDS.filter(kind => kind !== 'topic' && (kind === kindFilter || kinds.includes(kind))),
  ];
  const chipKey = chips.join(',');
  const rowRef = React.useRef<HTMLDivElement>(null);
  // On a phone the row scrolls: a link that opens on a chip, or a chip set for the viewer, would
  // otherwise leave the pressed chip past the edge.
  React.useEffect(() => {
    const row = rowRef.current;
    const pressed = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (row && pressed) revealInRow(row, pressed);
  }, [kindFilter, chipKey]);
  return (
    // A phone gets two rows: the path (or the search, while open), Share and close; then the chips.
    <div className="group/bar relative z-[2] flex shrink-0 items-center gap-3 border-b border-[#f0f0f0] bg-white px-4 py-3 md:gap-2 md:px-3 md:py-2 lg:flex-wrap">
      {back ? (
        <button type="button" aria-label={back.label} title={back.label} onClick={back.onClick} className={ROUND}>
          <ArrowLeft />
        </button>
      ) : null}
      <nav
        aria-label="Your path"
        className="flex min-w-0 flex-1 items-center gap-[6px] overflow-hidden whitespace-nowrap md:group-has-[[data-search-open]]/bar:hidden"
      >
        {trail.slice(-4).map((name, index, shown) => {
          const current = index === shown.length - 1;
          return (
            <React.Fragment key={`${index}-${name}`}>
              {index > 0 && (
                <span aria-hidden className="text-[#b8b8b8]">
                  ›
                </span>
              )}
              <span
                aria-current={current ? 'location' : undefined}
                className={cx(
                  'max-w-[220px] truncate text-[13px]',
                  current ? 'font-semibold text-text' : 'text-[#606060]'
                )}
              >
                {name}
              </span>
            </React.Fragment>
          );
        })}
      </nav>
      {search}
      {chips.length > 1 && (
        <div
          ref={rowRef}
          role="group"
          aria-label="Show"
          className="flex gap-2 lg:order-6 lg:basis-full lg:overflow-x-auto"
        >
          {chips.map(kind => (
            <button
              key={kind}
              type="button"
              aria-pressed={kindFilter === kind}
              onClick={() => onKindFilter(kind)}
              className={cx(
                'inline-flex h-8 shrink-0 items-center rounded-full border px-[14px] text-[13px] font-medium whitespace-nowrap',
                kindFilter === kind ? 'border-text bg-text text-white' : 'border-[#dbdbdb] text-text hover:border-text'
              )}
            >
              {kind === 'all' ? 'Everything' : GRAPH_KIND_LABELS[kind]}
            </button>
          ))}
        </div>
      )}
      {share && <ShareButton native={share.native} onShare={share.onShare} />}
      {close && (
        <Link
          href={close.href}
          aria-label={close.label}
          title={close.label}
          onClick={() => analytics?.markExit('close')}
          className={cx(ROUND, !share && 'md:ml-auto')}
        >
          <Close />
        </Link>
      )}
    </div>
  );
}

/** Scrolls the row just far enough to show `chip` whole; the page itself never moves. */
function revealInRow(row: HTMLElement, chip: HTMLElement) {
  const box = row.getBoundingClientRect();
  const { left, right } = chip.getBoundingClientRect();
  if (left < box.left) row.scrollLeft += left - box.left;
  else if (right > box.right) row.scrollLeft += right - box.right;
}

function ShareButton({ native, onShare }: { native: boolean; onShare: () => Promise<GraphShareResult> }) {
  const [state, setState] = React.useState<'idle' | 'copied' | 'failed'>('idle');
  React.useEffect(() => {
    if (state === 'idle') return;
    const timer = window.setTimeout(() => setState('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);
  const label = state === 'copied' ? 'Copied' : state === 'failed' ? 'Couldn’t copy' : native ? 'Share' : 'Copy link';
  return (
    <button
      type="button"
      onClick={() =>
        onShare().then(
          result => setState(result === 'copied' ? 'copied' : 'idle'),
          () => setState('failed')
        )
      }
      className="inline-flex h-8 shrink-0 items-center rounded-full border border-[#dbdbdb] px-[14px] text-[13px] font-medium whitespace-nowrap text-text hover:border-text md:ml-auto"
    >
      <span aria-live="polite">{label}</span>
    </button>
  );
}
