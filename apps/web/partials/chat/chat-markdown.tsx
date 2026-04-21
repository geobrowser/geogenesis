'use client';

import * as React from 'react';

import type Token from 'markdown-it/lib/token.mjs';

import { type EntityCache, parseGeoEntityHref } from '~/core/chat/entity-cache';
import { createMarkdownIt, sanitizeRenderedLinkUrl } from '~/core/state/editor/markdown-core';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { ChatRelationPill } from './chat-relation-pill';

const INTERNAL_HOSTS = new Set(['www.geobrowser.io', 'geobrowser.io', 'staging.geobrowser.io']);

function toInternalHref(rawHref: string): string | null {
  if (rawHref.startsWith('/')) return rawHref;
  try {
    const url = new URL(rawHref);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!INTERNAL_HOSTS.has(url.hostname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

const md = createMarkdownIt();

// Map of simple markdown-it tokens → plain React element. All tokens here render
// as pairs (open/close) and contain inline children; block/inline delegation is
// handled in the walker itself.
const BLOCK_TAGS: Record<string, React.ElementType> = {
  paragraph_open: 'p',
  heading_open: 'h3',
  blockquote_open: 'blockquote',
  bullet_list_open: 'ul',
  ordered_list_open: 'ol',
  list_item_open: 'li',
  hr: 'hr',
  code_block: 'pre',
  fence: 'pre',
};

const INLINE_TAGS: Record<string, React.ElementType> = {
  strong_open: 'strong',
  em_open: 'em',
  s_open: 's',
  code_inline: 'code',
};

type WalkerState = {
  tokens: Token[];
  index: number;
  cache: EntityCache;
  keySeed: number;
};

function nextKey(state: WalkerState): string {
  state.keySeed += 1;
  return `t-${state.keySeed}`;
}

function renderInlineTokens(inlineTokens: Token[], cache: EntityCache, keyPrefix: string): React.ReactNode[] {
  const state: WalkerState = { tokens: inlineTokens, index: 0, cache, keySeed: 0 };
  const out: React.ReactNode[] = [];
  while (state.index < state.tokens.length) {
    const node = consumeInline(state);
    if (node !== null) out.push(<React.Fragment key={`${keyPrefix}-${nextKey(state)}`}>{node}</React.Fragment>);
    else state.index += 1;
  }
  return out;
}

function collectInlineUntil(state: WalkerState, closeType: string): React.ReactNode[] {
  const children: React.ReactNode[] = [];
  while (state.index < state.tokens.length) {
    const token = state.tokens[state.index];
    if (token.type === closeType) {
      state.index += 1;
      return children;
    }
    const node = consumeInline(state);
    if (node !== null) children.push(<React.Fragment key={nextKey(state)}>{node}</React.Fragment>);
    else state.index += 1;
  }
  return children;
}

function collectInlineText(tokens: Token[], start: number, closeType: string): string {
  let out = '';
  for (let i = start; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type === closeType) return out;
    if (token.type === 'text') out += token.content;
    else if (token.type === 'softbreak' || token.type === 'hardbreak') out += ' ';
    else if (token.type === 'code_inline') out += token.content;
  }
  return out;
}

function consumeInline(state: WalkerState): React.ReactNode {
  const token = state.tokens[state.index];
  if (!token) return null;

  switch (token.type) {
    case 'text':
      state.index += 1;
      return token.content;

    case 'softbreak':
      state.index += 1;
      return ' ';

    case 'hardbreak':
      state.index += 1;
      return <br />;

    case 'code_inline':
      state.index += 1;
      return <code>{token.content}</code>;

    case 'strong_open':
    case 'em_open':
    case 's_open': {
      const Tag = INLINE_TAGS[token.type];
      const closeType = token.type.replace('_open', '_close');
      state.index += 1;
      const children = collectInlineUntil(state, closeType);
      return <Tag>{children}</Tag>;
    }

    case 'link_open': {
      const hrefAttr = token.attrs?.find(([name]) => name === 'href');
      const rawHref = hrefAttr?.[1] ?? null;

      const geo = parseGeoEntityHref(rawHref);
      const label = collectInlineText(state.tokens, state.index + 1, 'link_close');

      // Advance past link_open, inline children, and link_close
      state.index += 1;
      // Drop the children, since we already extracted the label as text.
      while (state.index < state.tokens.length && state.tokens[state.index].type !== 'link_close') {
        state.index += 1;
      }
      if (state.index < state.tokens.length) state.index += 1; // consume link_close

      if (geo) {
        const cached = state.cache.get(geo.id);
        const spaceId = geo.spaceId ?? cached?.spaceId ?? null;
        const displayLabel = (label || cached?.name || '').trim();
        if (!displayLabel) return null;
        if (!spaceId) {
          // Hallucinated or unresolved id — fall back to plain text.
          return displayLabel;
        }
        return <ChatRelationPill entityId={geo.id} spaceId={spaceId} label={displayLabel} />;
      }

      const safeHref = sanitizeRenderedLinkUrl(rawHref);
      if (!safeHref) return label;
      const internalHref = toInternalHref(safeHref);
      if (internalHref) {
        return (
          <Link href={internalHref} className="text-ctaHover underline">
            {label}
          </Link>
        );
      }
      return (
        <a href={safeHref} target="_blank" rel="noopener noreferrer" className="text-ctaHover underline">
          {label}
        </a>
      );
    }

    default:
      // Unknown inline token — skip it without crashing.
      state.index += 1;
      return null;
  }
}

function renderBlockToken(state: WalkerState): React.ReactNode {
  const token = state.tokens[state.index];
  if (!token) return null;

  if (token.type === 'inline') {
    state.index += 1;
    return renderInlineTokens(token.children ?? [], state.cache, `inline-${state.keySeed}`);
  }

  if (token.type === 'fence' || token.type === 'code_block') {
    state.index += 1;
    return (
      <pre className="overflow-x-auto rounded bg-grey-01 px-2 py-1.5 text-[11px]">
        <code>{token.content}</code>
      </pre>
    );
  }

  if (token.type === 'hr') {
    state.index += 1;
    return <hr className="my-2 border-grey-02" />;
  }

  if (token.type.endsWith('_open') && BLOCK_TAGS[token.type]) {
    const Tag = BLOCK_TAGS[token.type];
    const closeType = token.type.replace('_open', '_close');
    state.index += 1;
    const children: React.ReactNode[] = [];
    while (state.index < state.tokens.length && state.tokens[state.index].type !== closeType) {
      const node = renderBlockToken(state);
      if (node !== null) children.push(<React.Fragment key={nextKey(state)}>{node}</React.Fragment>);
    }
    if (state.index < state.tokens.length) state.index += 1; // consume close
    return <Tag>{children}</Tag>;
  }

  // Any token we don't explicitly handle (e.g. link_close slipped to block level): advance.
  state.index += 1;
  return null;
}

type Props = {
  text: string;
  cache: EntityCache;
};

export function ChatMarkdown({ text, cache }: Props) {
  const tokens = React.useMemo(() => md.parse(text, {}), [text]);
  const state: WalkerState = { tokens, index: 0, cache, keySeed: 0 };
  const nodes: React.ReactNode[] = [];
  while (state.index < tokens.length) {
    const node = renderBlockToken(state);
    if (node !== null) nodes.push(<React.Fragment key={nextKey(state)}>{node}</React.Fragment>);
  }
  return <>{nodes}</>;
}
