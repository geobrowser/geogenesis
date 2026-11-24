'use client';

import * as React from 'react';

import cx from 'classnames';

import type { GraphNode } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import { GRAPH_KIND_LABELS } from '~/core/graph-explorer/graph-kinds';

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

/** Finds within the map on screen; picking a result re-centres on it. */
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
  const results = React.useMemo(() => searchNodes(nodes, query), [nodes, query]);
  const listId = React.useId();

  const report = () => {
    if (typed.current) onSearched?.(results.length);
    typed.current = false;
  };

  const pick = (node: GraphNode) => {
    report();
    setQuery('');
    setOpen(false);
    onPick(node);
  };

  return (
    <div className="relative w-[260px] shrink-0 lg:order-5 lg:w-auto lg:flex-[1_1_100%]">
      <input
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
        }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') setActive(index => Math.min(results.length - 1, index + 1));
          else if (event.key === 'ArrowUp') setActive(index => Math.max(0, index - 1));
          else if (event.key === 'Enter' && results[active]) pick(results[active]);
          else if (event.key === 'Escape') setOpen(false);
          else return;
          event.preventDefault();
        }}
        className="h-8 w-full rounded-full border border-transparent bg-[#f0f0f0] px-[14px] text-[13px] text-text outline-none focus:border-text focus:bg-white"
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
