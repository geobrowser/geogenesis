'use client';

import * as React from 'react';

import { useAtom, useSetAtom } from 'jotai';

import { useCanUserEdit } from '~/core/hooks/use-user-is-editing';
import { addDataPanelExpandedAtom, assistantSeedAtom, isChatOpenAtom } from '~/core/state/chat-store';

import { ChevronRight } from '~/design-system/icons/chevron-right';
import { ChevronUpBig } from '~/design-system/icons/chevron-up-big';
import { Tick } from '~/design-system/icons/tick';

// Mirrors webFetch's own validateUrl — only parseable http(s) URLs enable go.
function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
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

  if (!canEdit || !expanded) return null;

  const trimmed = url.trim();
  const canSubmit = isValidHttpUrl(trimmed);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSeed({ mode: 'ingestion', url: trimmed });
    setChatOpen(true);
    setExpanded(false);
    setUrl('');
  };

  return (
    <div className="relative mt-5 h-[161px] w-full overflow-hidden rounded-[12px] bg-[#E9E9E9]">
      <img
        src="/images/add-data/sculpture.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute top-[-18px] right-[-261px] h-[217px] w-[1098px] object-cover opacity-50"
      />

      <button
        type="button"
        onClick={() => setExpanded(false)}
        aria-label="Collapse add data panel"
        className="absolute top-3 right-3 flex size-4 items-center justify-center text-grey-04 transition-colors hover:text-text"
      >
        <ChevronUpBig />
      </button>

      <h2 className="absolute top-[24px] left-[24px] text-smallTitle tracking-[-0.5px] text-[#151515]">
        Add data and we&rsquo;ll extract and organize it for you
      </h2>

      <div className="absolute top-[69px] left-[24px] text-[16px] font-medium tracking-[-0.32px] text-[#2A2B2E]">
        Import from URL
      </div>

      <form
        onSubmit={handleSubmit}
        className="absolute top-[95px] left-[24px] flex h-[41px] w-[550px] max-w-[calc(100%-48px)] items-center justify-between rounded-[1000px] bg-white/80 pr-[6.5px] pl-3"
      >
        <input
          value={url}
          onChange={event => setUrl(event.target.value)}
          placeholder="URL…"
          inputMode="url"
          className="w-full bg-transparent text-[18px] tracking-[-0.36px] text-text outline-none placeholder:text-[#B6B6B6]"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          aria-label="Extract content from URL"
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#DBDBDB] text-text transition-opacity disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-3"
        >
          <Tick />
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
      <span className="relative">Add data</span>
      <span className="relative">
        <ChevronRight />
      </span>
    </button>
  );
}
