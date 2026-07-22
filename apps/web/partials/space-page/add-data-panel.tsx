'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import { useUrlIngestionSubmit } from '~/core/hooks/use-url-ingestion-submit';
import { useCanUserEdit } from '~/core/hooks/use-user-is-editing';
import { addDataPanelExpandedAtom } from '~/core/state/chat-store';

import { ChevronRight } from '~/design-system/icons/chevron-right';
import { ChevronUpBig } from '~/design-system/icons/chevron-up-big';
import { RightArrowLongSmall } from '~/design-system/icons/right-arrow-long-small';

type Props = {
  spaceId: string;
};

export function AddDataPanel({ spaceId }: Props) {
  const canEdit = useCanUserEdit(spaceId);
  const [expanded, setExpanded] = useAtom(addDataPanelExpandedAtom);
  const { url, setUrl, canSubmit, handleSubmit } = useUrlIngestionSubmit({
    logTag: 'AddDataPanel',
    onComplete: () => setExpanded(false),
  });

  if (!canEdit || !expanded) return null;

  return (
    <div className="relative h-[10.0625rem] w-full overflow-hidden rounded-[0.75rem] bg-[#E9E9E9]">
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

      <h2 className="absolute top-[2.5rem] left-[1.5rem] text-smallTitle tracking-[-0.5px] text-[#151515]">
        Link a news story and we&rsquo;ll extract and organize it for you
      </h2>

      <form
        onSubmit={handleSubmit}
        className="absolute top-[5rem] left-[1.5rem] flex h-[2.5625rem] w-[34.375rem] max-w-[calc(100%-3rem)] items-center justify-between rounded-full bg-white/80 pr-[0.40625rem] pl-3"
      >
        <input
          value={url}
          onChange={event => setUrl(event.target.value)}
          placeholder="Paste news, podcast, tweet, blog URLs…"
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
