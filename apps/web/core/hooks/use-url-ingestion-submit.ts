'use client';

import * as React from 'react';

import { useSetAtom } from 'jotai';

import { resolveUrlIngestionSeed } from '~/core/chat/resolve-url-ingestion-seed';
import { assistantSeedAtom, isChatOpenAtom } from '~/core/state/chat-store';
import { normalizeHttpUrl } from '~/core/utils/normalize-http-url';

type Options = {
  logTag: string;
  onComplete?: () => void;
};

export function useUrlIngestionSubmit({ logTag, onComplete }: Options) {
  const setSeed = useSetAtom(assistantSeedAtom);
  const setChatOpen = useSetAtom(isChatOpenAtom);
  const [url, setUrl] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;

  const normalizedUrl = normalizeHttpUrl(url);
  const canSubmit = normalizedUrl !== null && !submitting;

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!normalizedUrl || submitting) return;

      setSubmitting(true);
      try {
        const seed = await resolveUrlIngestionSeed(normalizedUrl, logTag);
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
