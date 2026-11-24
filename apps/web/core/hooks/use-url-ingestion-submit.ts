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
   * Picks the space the import writes into, before the link goes to the ingestion (the Sources `+`,
   * GEO-3819). Without it the import writes into the route's space.
   */
  resolveSpace?: (url: string) => Promise<IngestionSpaceDecision>;
};

/**
 * Where an import goes:
 * - `ingest`: now, into `spaceId` (the route's space when absent).
 * - `queued`: held until the viewer's account is ready, and started from the queue then; the form
 *   clears and closes as if it had been sent.
 * - `blocked`: not at all; the URL stays so the viewer can try again.
 */
export type IngestionSpaceDecision = { kind: 'ingest'; spaceId?: string } | { kind: 'queued' } | { kind: 'blocked' };

/** Starts an ingestion: classifies the URL and hands the assistant its seed. */
export function useStartUrlIngestion() {
  const setSeed = useSetAtom(assistantSeedAtom);
  const setChatOpen = useSetAtom(isChatOpenAtom);
  return React.useCallback(
    async ({ url, logTag, link, spaceId }: { url: string; logTag: string; link?: IngestionLink; spaceId?: string }) => {
      const seed = await resolveUrlIngestionSeed(url, logTag, link, spaceId);
      setSeed(seed);
      setChatOpen(true);
    },
    [setSeed, setChatOpen]
  );
}

export function useUrlIngestionSubmit({ logTag, onComplete, link, resolveSpace }: Options) {
  const startIngestion = useStartUrlIngestion();
  const [url, setUrl] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;
  const linkRef = React.useRef(link);
  linkRef.current = link;
  const resolveSpaceRef = React.useRef(resolveSpace);
  resolveSpaceRef.current = resolveSpace;

  const normalizedUrl = normalizeHttpUrl(url);
  const canSubmit = normalizedUrl !== null && !submitting;

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!normalizedUrl || submitting) return;

      setSubmitting(true);
      try {
        const decision: IngestionSpaceDecision = resolveSpaceRef.current
          ? await resolveSpaceRef.current(normalizedUrl)
          : { kind: 'ingest' };
        if (decision.kind === 'blocked') return;
        if (decision.kind === 'ingest') {
          await startIngestion({ url: normalizedUrl, logTag, link: linkRef.current, spaceId: decision.spaceId });
        }
        setUrl('');
        onCompleteRef.current?.();
      } finally {
        setSubmitting(false);
      }
    },
    [normalizedUrl, submitting, logTag, startIngestion]
  );

  return {
    url,
    setUrl,
    submitting,
    canSubmit,
    handleSubmit,
  };
}
