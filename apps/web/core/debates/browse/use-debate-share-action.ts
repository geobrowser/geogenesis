'use client';

import * as React from 'react';

import type { Debate } from '~/core/debates/api';
import {
  getPreparedSocialVideoHandoffMethod,
  handoffPreparedSocialVideo,
  isAbortError,
  usePreparedSocialVideo,
} from '~/core/debates/social-video-share';

import type { DebateShareAction } from './debate-interaction-bar';

const SHARE_PREPARATION_DWELL_MS = 5_000;

/**
 * The Share control's state machine for a debate video, shared by the full-screen feed and the
 * explore-feed card so sharing behaves identically everywhere. Preparation only starts after the
 * viewer has dwelled on an active debate for a few seconds (so idle scrolling doesn't render
 * videos), and deactivating resets it.
 */
export function useDebateShareAction(debate: Debate, active: boolean): DebateShareAction {
  const [preparationEnabled, setPreparationEnabled] = React.useState(false);
  const [isSharing, setIsSharing] = React.useState(false);
  const [shareError, setShareError] = React.useState<string | null>(null);
  const sharingRef = React.useRef(false);
  const activationGenerationRef = React.useRef(0);
  const preparedVideo = usePreparedSocialVideo(debate.id, {
    enabled: active && preparationEnabled,
    includePreview: false,
  });

  React.useEffect(() => {
    setShareError(null);
    if (!active) {
      activationGenerationRef.current += 1;
      setPreparationEnabled(false);
      return;
    }

    const dwellTimer = window.setTimeout(() => setPreparationEnabled(true), SHARE_PREPARATION_DWELL_MS);
    return () => window.clearTimeout(dwellTimer);
  }, [active]);

  const handoffMethod = React.useMemo(
    () => (preparedVideo.file ? getPreparedSocialVideoHandoffMethod(preparedVideo.file) : null),
    [preparedVideo.file]
  );
  let state: DebateShareAction['state'] = 'preparing';
  if (isSharing) state = 'sharing';
  else if (active && (shareError || preparedVideo.status === 'error')) state = 'error';
  else if (active && preparedVideo.status === 'ready') state = 'ready';
  const tooltipMessage = getShareTooltipMessage({
    state,
    method: handoffMethod,
    error: shareError ?? preparedVideo.error,
  });

  const onActivate = () => {
    if (!active || sharingRef.current) return;
    if (preparedVideo.status === 'error') {
      setShareError(null);
      preparedVideo.retry();
      return;
    }
    if (!preparedVideo.file || !preparedVideo.downloadUrl) return;

    const file = preparedVideo.file;
    const downloadUrl = preparedVideo.downloadUrl;
    const activationGeneration = activationGenerationRef.current;
    sharingRef.current = true;
    setIsSharing(true);
    setShareError(null);
    const handoff = handoffPreparedSocialVideo({
      debateId: debate.id,
      title: debate.claim.claim,
      file,
      downloadUrl,
    });
    void handoff
      .catch(error => {
        if (activationGenerationRef.current === activationGeneration && !isAbortError(error)) {
          setShareError(error instanceof Error ? error.message : 'Could not share the video.');
        }
      })
      .finally(() => {
        sharingRef.current = false;
        setIsSharing(false);
      });
  };

  return { state, method: handoffMethod, tooltipMessage, onActivate };
}

function getShareTooltipMessage({
  state,
  method,
  error,
}: Pick<DebateShareAction, 'state' | 'method'> & { error: string | null }) {
  if (state === 'preparing') return 'Preparing video for sharing… You can share soon.';
  if (state === 'sharing') return undefined;
  if (state === 'error') {
    const fallback = method ? 'Could not share the video.' : 'Could not prepare the video.';
    return `${error ?? fallback} Select to try again.`;
  }
  return method === 'download' ? 'Download the debate video.' : undefined;
}
