'use client';

import * as React from 'react';

import type { UIMessage } from 'ai';
import { isTextUIPart, isToolUIPart } from 'ai';

import { createMarkdownIt, sanitizeRenderedLinkUrl } from '~/core/state/editor/markdown-core';

import { Dots } from '~/design-system/dots';

const md = createMarkdownIt();

const defaultLinkRender =
  md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const hrefIndex = token.attrIndex('href');
  if (hrefIndex >= 0) {
    const safe = sanitizeRenderedLinkUrl(token.attrs?.[hrefIndex]?.[1] ?? null);
    if (safe) {
      token.attrs![hrefIndex]![1] = safe;
    } else {
      token.attrs?.splice(hrefIndex, 1);
    }
  }
  token.attrSet('target', '_blank');
  token.attrSet('rel', 'noopener noreferrer');
  token.attrSet('class', 'text-ctaHover underline');
  return defaultLinkRender(tokens, idx, options, env, self);
};

function renderMarkdown(text: string): string {
  return md.render(text);
}

function messageText(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map(part => part.text)
    .join('');
}

function messageFollowUps(message: UIMessage): string[] {
  for (const part of message.parts) {
    if (!isToolUIPart(part)) continue;
    if (part.type !== 'tool-suggestFollowUps') continue;
    if (part.state !== 'input-available' && part.state !== 'output-available') continue;
    const input = part.input as { suggestions?: unknown } | undefined;
    const suggestions = input?.suggestions;
    if (Array.isArray(suggestions)) {
      return suggestions.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
    }
  }
  return [];
}

type Props = {
  messages: UIMessage[];
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  error?: Error;
  onRetry: () => void;
  onSuggestion: (text: string) => void;
  disabled?: boolean;
};

export function ChatMessages({ messages, status, error, onRetry, onSuggestion, disabled }: Props) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
  const followUps = lastAssistant ? messageFollowUps(lastAssistant) : [];
  const showFollowUps = status === 'ready' && !error && followUps.length > 0;

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  return (
    <div ref={scrollRef} className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
      {messages.map(message => {
        const text = messageText(message);
        if (!text) return null;

        return (
          <React.Fragment key={message.id}>
            {message.role === 'user' ? (
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-md bg-grey-01 px-2 py-1.5 text-chat text-text">{text}</div>
              </div>
            ) : (
              <div className="flex justify-start">
                <div
                  className="prose-chat max-w-[90%] text-chat text-text"
                  // Safe because createMarkdownIt sets html: false (raw HTML disabled) and link URLs are sanitized above.
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}

      {status === 'submitted' && (
        <div className="flex justify-start px-2 py-1.5">
          <Dots />
        </div>
      )}

      {showFollowUps && (
        <div className="flex flex-col items-start gap-1.5 pt-1">
          {followUps.map(suggestion => (
            <button
              key={suggestion}
              type="button"
              disabled={disabled}
              onClick={() => onSuggestion(suggestion)}
              className="rounded-md bg-grey-01 px-2 py-1.5 text-left text-chat text-text transition-colors hover:bg-grey-02 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="flex justify-start">
          <div className="max-w-[90%] rounded-md border border-red-01 px-2 py-1.5 text-chat text-red-01">
            Something went wrong.{' '}
            <button type="button" onClick={onRetry} className="underline">
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
