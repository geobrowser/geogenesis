'use client';

import * as React from 'react';

import { useAtom, useSetAtom } from 'jotai';

import type { ClassifyUrlResponse } from '~/core/chat/inject-types';
import { useCanUserEdit } from '~/core/hooks/use-user-is-editing';
import { addDataPanelExpandedAtom, assistantSeedAtom, isChatOpenAtom } from '~/core/state/chat-store';

import { ChevronRight } from '~/design-system/icons/chevron-right';
import { ChevronUpBig } from '~/design-system/icons/chevron-up-big';
import { RightArrowLongSmall } from '~/design-system/icons/right-arrow-long-small';

// Normalizes a pasted URL to a parseable http(s) URL, defaulting a bare domain
// (`example.com/article`) to https. Returns null if it can't be made into an
// http(s) URL (e.g. a non-web scheme like ftp:). Returns the canonical string
// so the inject / ingestion pipelines always receive a full URL.
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

type Props = {
  spaceId: string;
};

export function AddDataPanel({ spaceId }: Props) {
  const canEdit = useCanUserEdit(spaceId);
  const [expanded, setExpanded] = useAtom(addDataPanelExpandedAtom);
  const setSeed = useSetAtom(assistantSeedAtom);
  const setChatOpen = useSetAtom(isChatOpenAtom);
  const [url, setUrl] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  if (!canEdit || !expanded) return null;

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
        console.warn('[AddDataPanel] classify-url returned', res.status);
      }
    } catch (err) {
      console.warn('[AddDataPanel] classify-url failed; falling back to chat flow', err);
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
          console.warn('[AddDataPanel] inject submit returned', res.status);
        }
      } catch (err) {
        console.warn('[AddDataPanel] inject submit failed; falling back to chat flow', err);
      }
    }

    setSeed({ mode: 'ingestion', url: normalizedUrl });
    setChatOpen(true);
    setExpanded(false);
    setUrl('');
    setSubmitting(false);
  };

  return (
    <div className="relative mt-5 h-[10.0625rem] w-full overflow-hidden rounded-[0.75rem] bg-[#E9E9E9]">
      <img
        src="/images/add-data/sculpture.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute top-[-1.125rem] right-[-16.3125rem] h-[13.5625rem] w-[68.625rem] object-cover opacity-50"
      />

      <button
        type="button"
        onClick={() => setExpanded(false)}
        aria-label="Collapse add data panel"
        className="absolute top-3 right-3 flex size-4 items-center justify-center text-grey-04 transition-colors hover:text-text"
      >
        <ChevronUpBig />
      </button>

      <h2 className="absolute top-[1.5rem] left-[1.5rem] text-smallTitle tracking-[-0.5px] text-[#151515]">
        Add data and we&rsquo;ll extract and organize it for you
      </h2>

      <div className="absolute top-[4.3125rem] left-[1.5rem] flex items-center gap-4 text-[1rem] leading-[22px] font-medium tracking-[-0.32px]">
        <span className="text-[#2A2B2E]">Import from URL</span>
        <span aria-disabled="true" title="Coming soon" className="cursor-not-allowed text-[#606060]">
          Upload files
        </span>
      </div>

      <form
        onSubmit={handleSubmit}
        className="absolute top-[5.9375rem] left-[1.5rem] flex h-[2.5625rem] w-[34.375rem] max-w-[calc(100%-3rem)] items-center justify-between rounded-full bg-white/80 pr-[0.40625rem] pl-3"
      >
        <input
          value={url}
          onChange={event => setUrl(event.target.value)}
          placeholder="URL…"
          inputMode="url"
          className="w-full bg-transparent text-[1.125rem] tracking-[-0.36px] text-text outline-none placeholder:text-[#B6B6B6]"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          aria-label="Extract content from URL"
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#DBDBDB] text-text transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RightArrowLongSmall />
        </button>
      </form>
    </div>
  );
}

export function AddDataChip({ spaceId }: Props) {
  const canEdit = useCanUserEdit(spaceId);
  const [expanded, setExpanded] = useAtom(addDataPanelExpandedAtom);

  if (!canEdit || expanded) return null;

  return (
    <button
      type="button"
      onClick={() => setExpanded(true)}
      className="relative flex h-6 items-center gap-1 overflow-hidden rounded-[6px] bg-[#E9E9E9] pr-1 pl-1.5 text-metadata text-[#2A2B2E] transition-colors hover:bg-grey-02"
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
