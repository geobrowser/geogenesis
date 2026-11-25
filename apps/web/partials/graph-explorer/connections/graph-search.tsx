'use client';

import * as React from 'react';

import cx from 'classnames';
import { flushSync } from 'react-dom';

import type { GraphNode } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import { GRAPH_KIND_LABELS } from '~/core/graph-explorer/graph-kinds';

import { Search } from '~/design-system/icons/search';

import { nodeTypeLabel } from './node-card';

const LIMIT = 8;

/** Nodes whose name contains `query`, names that start with it first. */
export function searchNodes(nodes: readonly GraphNode[], query: string): GraphNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return nodes
    .flatMap(node => {
      const at = node.name?.toLowerCase().indexOf(needle) ?? -1;
      return at < 0 ? [] : [{ node, starts: at === 0 }];
    })
    .sort((a, b) => Number(b.starts) - Number(a.starts))
    .slice(0, LIMIT)
    .map(({ node }) => node);
}

/**
 * Finds within the map on screen; picking a result re-centres on it. On a phone the field folds into
 * an icon beside Share, and opens over the path while it's in use.
 */
export function GraphSearch({
  nodes,
  onPick,
  onSearched,
}: {
  nodes: readonly GraphNode[];
  onPick: (node: GraphNode) => void;
  /** Once per focus that typed something, when it closes or picks: the count only, never the text. */
  onSearched?: (resultCount: number) => void;
}) {
  const [query, setQuery] = React.useState('');
  const typed = React.useRef(false);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  // Phone only: the field is folded into its icon until pressed (on a desktop the icon never shows).
  const [unfolded, setUnfolded] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const iconRef = React.useRef<HTMLButtonElement>(null);
  const results = React.useMemo(() => searchNodes(nodes, query), [nodes, query]);
  const listId = React.useId();

  const report = () => {
    if (typed.current) onSearched?.(results.length);
    typed.current = false;
  };

  // Folding hides the focused field, so focus goes back to the icon rather than dropping to the
  // page. On a desktop the icon is never shown, focus() does nothing and the field keeps focus.
  const fold = () => {
    flushSync(() => setUnfolded(false));
    iconRef.current?.focus();
  };

  const pick = (node: GraphNode) => {
    report();
    setQuery('');
    setOpen(false);
    fold();
    onPick(node);
  };

  return (
    <div
      data-search-open={unfolded || undefined}
      // `!` because the tablet's `lg:` rules come later in the stylesheet and would win on a phone.
      className={cx(
        'relative w-[260px] shrink-0 md:order-none! lg:order-5 lg:w-auto lg:flex-[1_1_100%]',
        unfolded ? 'md:min-w-0 md:flex-[1_1_0%]!' : 'md:flex-none!'
      )}
    >
      {!unfolded && (
        <button
          ref={iconRef}
          type="button"
          aria-label="Search the map"
          title="Search the map"
          onClick={() => {
            // Focus inside the press, so a phone raises its keyboard.
            flushSync(() => setUnfolded(true));
            inputRef.current?.focus();
          }}
          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#dbdbdb] text-text hover:border-text md:inline-flex"
        >
          <Search />
        </button>
      )}
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label="Find on the map"
        aria-expanded={open && query.trim().length > 0}
        aria-controls={listId}
        aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
        placeholder="Find a person, event or claim"
        value={query}
        onChange={event => {
          setQuery(event.target.value);
          if (event.target.value.trim()) typed.current = true;
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          report();
          setOpen(false);
          if (!query.trim()) setUnfolded(false);
        }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') setActive(index => Math.min(results.length - 1, index + 1));
          else if (event.key === 'ArrowUp') setActive(index => Math.max(0, index - 1));
          else if (event.key === 'Enter' && results[active]) pick(results[active]);
          else if (event.key === 'Escape') {
            setOpen(false);
            if (!query.trim()) fold();
          } else return;
          event.preventDefault();
        }}
        className={cx(
          'h-8 w-full rounded-full border border-transparent bg-[#f0f0f0] px-[14px] text-[13px] text-text outline-none focus:border-text focus:bg-white',
          !unfolded && 'md:hidden'
        )}
      />
      {open && query.trim() && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matches on the map"
          className="absolute inset-x-0 top-[38px] z-10 overflow-hidden rounded-xl bg-white shadow-[0_8px_25px_rgba(0,0,0,.12)]"
        >
          {results.length === 0 ? (
            <li className="px-[14px] py-[10px] text-[13px] text-grey-04">Nothing on the map matches.</li>
          ) : (
            results.map((node, index) => (
              <li
                key={node.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                // Keeps focus in the input so the click lands before blur closes the list.
                onMouseDown={event => event.preventDefault()}
                onClick={() => pick(node)}
                className={cx(
                  'flex cursor-pointer flex-col gap-[2px] px-[14px] py-2',
                  index === active && 'bg-[#f6f6f6]'
                )}
              >
                <span className="text-[13px] text-text">{node.name}</span>
                <small className="text-[12px] text-grey-04">
                  {nodeTypeLabel(node) ?? GRAPH_KIND_LABELS[node.kind]}
                </small>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
