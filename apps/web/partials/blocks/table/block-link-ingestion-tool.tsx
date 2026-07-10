'use client';

import * as React from 'react';

import { useSetAtom } from 'jotai';

import { useBlockTools } from '~/core/blocks/data/use-block-tools';
import type { ClassifyUrlResponse } from '~/core/chat/inject-types';
import { useCanUserEdit } from '~/core/hooks/use-user-is-editing';
import { assistantSeedAtom, isChatOpenAtom } from '~/core/state/chat-store';

import { Check } from '~/design-system/icons/check';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { ChevronUpBig } from '~/design-system/icons/chevron-up-big';

function normalizeHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

type BlockLinkIngestionContextValue = {
  spaceId: string;
  enabled: boolean;
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
};

const BlockLinkIngestionContext = React.createContext<BlockLinkIngestionContextValue | null>(null);

function useBlockLinkIngestionContext() {
  const context = React.useContext(BlockLinkIngestionContext);
  if (!context) {
    throw new Error('BlockLinkIngestion components must be used within BlockLinkIngestionProvider');
  }
  return context;
}

type ProviderProps = {
  spaceId: string;
  children: React.ReactNode;
};

export function BlockLinkIngestionProvider({ spaceId, children }: ProviderProps) {
  const { hasLinkIngestionTool } = useBlockTools();
  const [expanded, setExpanded] = React.useState(false);

  const value = React.useMemo(
    () => ({
      spaceId,
      enabled: hasLinkIngestionTool,
      expanded,
      setExpanded,
    }),
    [spaceId, hasLinkIngestionTool, expanded]
  );

  return <BlockLinkIngestionContext.Provider value={value}>{children}</BlockLinkIngestionContext.Provider>;
}

export function BlockLinkIngestionChip() {
  const { spaceId, enabled, expanded, setExpanded } = useBlockLinkIngestionContext();
  const canEdit = useCanUserEdit(spaceId);

  if (!enabled || !canEdit || expanded) return null;

  return (
    <button
      type="button"
      onClick={() => setExpanded(true)}
      className="relative flex h-6 shrink-0 items-center gap-1 overflow-hidden rounded-[6px] bg-[#E9E9E9] pr-1 pl-1.5 text-metadata text-[#2A2B2E] transition-colors hover:bg-grey-02"
    >
      <img
        src="/images/add-data/sculpture.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full object-cover opacity-20"
      />
      <span className="relative">Import</span>
      <span className="relative">
        <ChevronRight />
      </span>
    </button>
  );
}

export function BlockLinkIngestionPanel() {
  const { spaceId, enabled, expanded, setExpanded } = useBlockLinkIngestionContext();
  const canEdit = useCanUserEdit(spaceId);
  const setSeed = useSetAtom(assistantSeedAtom);
  const setChatOpen = useSetAtom(isChatOpenAtom);
  const [url, setUrl] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  if (!enabled || !canEdit || !expanded) return null;

  const normalizedUrl = normalizeHttpUrl(url);
  const canSubmit = normalizedUrl !== null && !submitting;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!normalizedUrl || submitting) return;
    setSubmitting(true);

    let classification: ClassifyUrlResponse = { route: 'chat' };
    try {
      const res = await fetch('/api/chat/classify-url', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalizedUrl }),
      });
      if (res.ok) {
        classification = (await res.json()) as ClassifyUrlResponse;
      } else {
        console.warn('[BlockLinkIngestionPanel] classify-url returned', res.status);
      }
    } catch (err) {
      console.warn('[BlockLinkIngestionPanel] classify-url failed; falling back to chat flow', err);
    }

    if (classification.route === 'inject') {
      try {
        const res = await fetch('/api/chat/inject', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: normalizedUrl, type: classification.type }),
        });
        if (res.ok || res.status === 202) {
          const body = (await res.json()) as { jobId: string };
          if (body.jobId) {
            setSeed({ mode: 'inject', url: normalizedUrl, jobId: body.jobId, injectType: classification.type });
            setChatOpen(true);
            setExpanded(false);
            setUrl('');
            setSubmitting(false);
            return;
          }
        } else {
          console.warn('[BlockLinkIngestionPanel] inject submit returned', res.status);
        }
      } catch (err) {
        console.warn('[BlockLinkIngestionPanel] inject submit failed; falling back to chat flow', err);
      }
    }

    setSeed({ mode: 'ingestion', url: normalizedUrl });
    setChatOpen(true);
    setExpanded(false);
    setUrl('');
    setSubmitting(false);
  };

  return (
    <div className="mb-4 w-full" onMouseDown={e => e.stopPropagation()}>
      <div className="relative flex w-full flex-col gap-3 overflow-hidden rounded-[0.75rem] bg-[#E9E9E9] px-6 pt-8 pb-6">
        <img
          src="/images/add-data/sculpture.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute top-[-1.125rem] right-[-16.3125rem] h-[13.5625rem] w-[68.625rem] object-none opacity-50"
        />

        <div className="relative flex items-center justify-between gap-2 pr-[0.40625rem]">
          {/* Use a div — TipTap `.ProseMirror .data-node h2` forces text-button (~17px). */}
          <div className="min-w-0 text-[19px] leading-[21px] font-semibold tracking-[-0.5px] text-[#151515]">
            Link a news story and we&rsquo;ll extract and organize it for you
          </div>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="Collapse link ingestion panel"
            className="flex size-4 shrink-0 items-center justify-center text-grey-04 transition-colors hover:text-text"
          >
            <ChevronUpBig />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="relative flex h-[56px] w-full items-center justify-between rounded-full bg-white/80 pr-[0.40625rem] pl-3"
        >
          <input
            value={url}
            onChange={event => setUrl(event.target.value)}
            placeholder="Paste news, podcast, tweet, blog URLs…"
            inputMode="url"
            className="w-full bg-transparent text-[18px]! leading-[24px]! font-normal tracking-[-0.36px] text-text outline-none placeholder:text-[18px]! placeholder:leading-[24px]! placeholder:font-normal placeholder:tracking-[-0.36px] placeholder:text-[#B6B6B6]"
          />
          <button
            type="submit"
            disabled={!canSubmit}
            aria-label="Extract content from URL"
            className="box-border flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full bg-[#DBDBDB] p-2 text-text transition-opacity disabled:cursor-not-allowed disabled:opacity-40 [&>svg]:h-3 [&>svg]:w-3"
          >
            <Check />
          </button>
        </form>
      </div>
    </div>
  );
}
