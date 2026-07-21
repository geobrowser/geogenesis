'use client';

import * as React from 'react';

import { usePathname, useRouter } from 'next/navigation';

import { useDebatesEnabled } from '~/core/state/feature-flags';

import { Button } from '~/design-system/button';
import { Upload } from '~/design-system/icons/upload';
import { Text } from '~/design-system/text';

import { useDebateGateway } from './debate-gateway';
import { useDebateActivity, useDebateSharePrompts, useGeoChatAuth, useHandleDebateSharePrompt } from './hooks';
import { DebateMatchPrompt } from './match-prompt';
import { ProcessedDebatePlayer } from './processed-debate-player';

export function DebateCoordinator() {
  const router = useRouter();
  const pathname = usePathname();
  const isDebatesEnabled = useDebatesEnabled();
  const geoChatAuth = useGeoChatAuth();
  const gateway = useDebateGateway(
    isDebatesEnabled && geoChatAuth.ready && geoChatAuth.authenticated,
    geoChatAuth.getPrivyIdentityToken,
    geoChatAuth.accountKey
  );
  const activityQuery = useDebateActivity(isDebatesEnabled);
  const activity = activityQuery.data ?? null;
  const activeFlow = Boolean(activity?.match || activity?.debate || activity?.rematch);
  const sharePromptsQuery = useDebateSharePrompts(Boolean(activity) && !activeFlow);

  React.useEffect(() => {
    if (!activity) return;
    const debate = activity.debate;
    const viewingRematch = pathname.includes('/debates/rematches/');
    if (debate && !viewingRematch && !pathname.includes(`/debates/${debate.id}`)) {
      router.push(`/space/${debate.claim.space_id}/debates/${debate.id}`);
      return;
    }
    const rematch = activity.rematch;
    if (!rematch) return;
    if (rematch.status === 'deciding') {
      if (!pathname.includes(`/debates/${rematch.source_debate_id}`)) {
        router.push(`/space/${rematch.source_space_id}/debates/${rematch.source_debate_id}`);
      }
      return;
    }
    if (rematch.status === 'browsing' || rematch.status === 'request_pending') {
      // The debate room owns recording finalization before entering the browser.
      if (pathname.includes(`/debates/${rematch.source_debate_id}`)) return;
      const path = `/space/${rematch.source_space_id}/debates/rematches/${rematch.id}`;
      if (pathname !== path) router.push(path);
    }
  }, [activity, pathname, router]);

  const match = activity?.match;
  if (!isDebatesEnabled) return null;

  return (
    <>
      {gateway.paused && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed top-3 left-1/2 z-[1400] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-full bg-text px-4 py-2 text-center text-sm text-white shadow-card sm:w-auto"
        >
          Live debate updates are paused while reconnecting.
        </div>
      )}
      {match && (
        <DebateMatchPrompt
          spaceId={match.claim.space_id}
          matches={[match]}
          debates={activity?.debate ? [activity.debate] : []}
        />
      )}
      {!activeFlow && sharePromptsQuery.data?.prompts[0] && (
        <DebateSharePromptDialog
          key={sharePromptsQuery.data.prompts[0].id}
          prompt={sharePromptsQuery.data.prompts[0]}
          stackCount={sharePromptsQuery.data.prompts.length}
        />
      )}
    </>
  );
}

function DebateSharePromptDialog({
  prompt,
  stackCount,
}: {
  prompt: { id: string; debate_id: string; source_space_id: string; claim: string };
  stackCount: number;
}) {
  const handlePrompt = useHandleDebateSharePrompt();
  const [shareError, setShareError] = React.useState<string | null>(null);
  const publicUrl =
    typeof window === 'undefined'
      ? ''
      : `${window.location.origin}/space/${prompt.source_space_id}/debates/${prompt.debate_id}/recording`;

  React.useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, []);

  const dismiss = () => handlePrompt.mutate({ promptId: prompt.id, action: 'dismissed' });
  const share = async () => {
    setShareError(null);
    try {
      if (navigator.share) {
        await navigator.share({ title: prompt.claim, url: publicUrl });
      } else {
        await navigator.clipboard.writeText(publicUrl);
      }
      handlePrompt.mutate({ promptId: prompt.id, action: 'shared' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareError(error instanceof Error ? error.message : 'Could not share the debate.');
    }
  };

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center overflow-y-auto bg-text/55 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="debate-share-title"
        className="relative w-[min(370px,100%)] rounded-lg bg-bg p-5 shadow-card"
      >
        {stackCount > 1 && (
          <span aria-hidden="true" className="absolute inset-x-4 top-4 -bottom-3 -z-10 rounded-xl bg-grey-02" />
        )}
        {stackCount > 2 && (
          <span aria-hidden="true" className="absolute inset-x-7 top-7 -bottom-6 -z-20 rounded-xl bg-grey-03" />
        )}
        <header className="flex items-start justify-between gap-4">
          <h2 id="debate-share-title" className="text-cardEntityTitle">
            Your debate is ready to share!
          </h2>
          <button
            type="button"
            aria-label="Close share prompt"
            onClick={dismiss}
            disabled={handlePrompt.isPending}
            className="grid size-9 shrink-0 place-items-center rounded-full text-2xl text-grey-04 hover:bg-grey-02"
          >
            ×
          </button>
        </header>

        <div className="mx-auto mt-5 w-full max-w-[270px] overflow-hidden rounded-lg bg-text text-white shadow-card">
          <div className="bg-purple px-4 py-3 text-center">
            <Text as="div" variant="smallButton" color="white">
              Geo
            </Text>
            <div className="mt-1 text-[1.25rem] leading-[1.2] font-medium">{prompt.claim}</div>
          </div>
          <ProcessedDebatePlayer
            debateId={prompt.debate_id}
            label={`Processed video for ${prompt.claim}`}
            className="w-full rounded-none shadow-none"
          />
        </div>

        {shareError && (
          <Text color="red-01" className="mt-3 text-center">
            {shareError}
          </Text>
        )}
        <div className="mt-5 flex justify-center">
          <Button
            type="button"
            onClick={share}
            disabled={handlePrompt.isPending || !publicUrl}
            icon={<Upload />}
            className="gap-2 rounded-full"
          >
            Share
          </Button>
        </div>
      </section>
    </div>
  );
}
