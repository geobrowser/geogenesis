'use client';

import * as React from 'react';

import { useSetAtom } from 'jotai';

import type { IngestionLink } from '~/core/chat/ingestion-link';
import { resolveUrlIngestionSeed } from '~/core/chat/resolve-url-ingestion-seed';
import { assistantSeedAtom, isChatOpenAtom } from '~/core/state/chat-store';
import { normalizeHttpUrl } from '~/core/utils/normalize-http-url';

type Options = {
  logTag: string;
  onComplete?: () => void;
  /** The page the link is added from; the new source is linked back to it (GEO-3819). */
  link?: IngestionLink;
  /**
   * Runs before the link goes to the ingestion; resolving false stops it there, with the URL kept so
   * the viewer can try again. The Sources `+` joins a non-member to the space here (GEO-3819).
   */
  beforeIngest?: () => Promise<boolean>;
};

export function useUrlIngestionSubmit({ logTag, onComplete, link, beforeIngest }: Options) {
  const setSeed = useSetAtom(assistantSeedAtom);
  const setChatOpen = useSetAtom(isChatOpenAtom);
  const [url, setUrl] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;
  const linkRef = React.useRef(link);
  linkRef.current = link;
  const beforeIngestRef = React.useRef(beforeIngest);
  beforeIngestRef.current = beforeIngest;

  const normalizedUrl = normalizeHttpUrl(url);
  const canSubmit = normalizedUrl !== null && !submitting;

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!normalizedUrl || submitting) return;

      setSubmitting(true);
      try {
        if (beforeIngestRef.current && !(await beforeIngestRef.current())) return;
        const seed = await resolveUrlIngestionSeed(normalizedUrl, logTag, linkRef.current);
        setSeed(seed);
        setChatOpen(true);
        setUrl('');
        onCompleteRef.current?.();
      } finally {
        setSubmitting(false);
      }
    },
    [normalizedUrl, submitting, logTag, setSeed, setChatOpen]
  );

  return {
    url,
    setUrl,
    submitting,
    canSubmit,
    handleSubmit,
  };
}
