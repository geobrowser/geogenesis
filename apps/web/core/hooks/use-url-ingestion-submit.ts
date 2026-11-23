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
};

export function useUrlIngestionSubmit({ logTag, onComplete, link }: Options) {
  const setSeed = useSetAtom(assistantSeedAtom);
  const setChatOpen = useSetAtom(isChatOpenAtom);
  const [url, setUrl] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;
  const linkRef = React.useRef(link);
  linkRef.current = link;

  const normalizedUrl = normalizeHttpUrl(url);
  const canSubmit = normalizedUrl !== null && !submitting;

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!normalizedUrl || submitting) return;

      setSubmitting(true);
      try {
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
