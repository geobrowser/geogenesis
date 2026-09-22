'use client';

import * as React from 'react';

import { capture } from '~/core/analytics';
import type { Debate } from '~/core/debates/api';
import { useDebateMedia } from '~/core/debates/hooks';
import { useToast } from '~/core/hooks/use-toast';

import { hasSocialVideo } from '../playback-utils';
import {
  isAbortError,
  isUnretryableShareError,
  preparedSocialVideoFile,
  usePreparedSocialVideo,
} from '../social-video-share';
import { shareDebateWithSystemSheet } from '../system-share';
import { debateShareMessage, debateShareUrl } from './share-text';

export type DebateSystemShareStatus = 'idle' | 'preparing' | 'armed';

export type DebateSystemShare = {
  status: DebateSystemShareStatus;
  /** Download progress of the social cut, where the response declared a size. */
  progressPercent: number | null;
  onShare: () => void;
};

/** What the button is waiting on, once the tap has asked for a share. */
type PreparationOutcome = 'waiting' | 'video' | 'no-video';

/**
 * The mobile Share button: it waits for the debate's social cut, then hands it to the OS share
 * sheet.
 *
 * Nothing is fetched until someone taps. The cut is not rendered in the background the way it was
 * before the in-app sheet landed — that cost every viewer who paused on a debate a whole MP4,
 * which is what made the old button sit disabled on arrival. Here the wait belongs to the tap that
 * asked for it, and the button reports its progress while it runs.
 *
 * ## Why sharing can take a second tap
 *
 * `navigator.share` needs the tap's transient activation, and rendering a video outlives it. So the
 * hand-off is attempted the moment the cut lands — browsers that still honour the tap open the
 * sheet right there, and the share is one tap. Where the activation has expired the button arms
 * instead: the cut is now in memory, a toast says so, and the next tap opens the sheet
 * instantly. Arming is also what a debate with no cut, or a render that failed, falls back to —
 * that next tap shares the debate's link rather than nothing.
 */
export function useDebateSystemShare(
  debate: Debate | null,
  spaceId: string,
  { enabled, onRefused }: { enabled: boolean; onRefused: () => void }
): DebateSystemShare {
  const [requested, setRequested] = React.useState(false);
  const [armed, setArmed] = React.useState(false);
  const [, setToast] = useToast();

  const debateId = debate?.id ?? null;
  const active = enabled && requested && debateId !== null;

  // Both of these share a cache entry with the player's own lookup, so on the debate being watched
  // the media is already loaded and only the cut itself is actually fetched here.
  const media = useDebateMedia(debateId ?? '', active);
  const socialVideoReady = hasSocialVideo(media.data);
  const prepared = usePreparedSocialVideo(debateId ?? '', {
    enabled: active && socialVideoReady,
    includePreview: false,
  });

  let outcome: PreparationOutcome = 'waiting';
  if (media.isError || (media.isSuccess && !socialVideoReady)) outcome = 'no-video';
  else if (socialVideoReady && prepared.status === 'ready') outcome = 'video';
  else if (socialVideoReady && prepared.status === 'error') outcome = 'no-video';

  const shareNow = React.useCallback(
    ({ withinGesture }: { withinGesture: boolean }) => {
      if (!debate) return;

      const claim = debate.claim.claim;
      let handoff: ReturnType<typeof shareDebateWithSystemSheet>;
      try {
        handoff = shareDebateWithSystemSheet({
          title: claim.trim(),
          text: debateShareMessage(claim),
          url: debateShareUrl(spaceId, debate.id),
          file: preparedSocialVideoFile(debate.id),
        });
      } catch {
        onRefused();
        return;
      }

      void handoff.shared
        .then(() => {
          // On resolve rather than on tap, unlike the in-app sheet's composer hand-offs: the OS
          // sheet is the one surface that tells us whether the share actually happened.
          try {
            capture('debate_share_action', {
              debate_id: debate.id,
              space_id: spaceId,
              method: 'native_share',
              payload: handoff.payload,
            });
          } catch {}
        })
        .catch(error => {
          // They dismissed the sheet. Nothing to report and nothing to fall back to.
          if (isAbortError(error)) return;
          if (!isUnretryableShareError(error)) return;
          // Inside the gesture, this is the browser declining the capability outright — the same
          // refusal the download fallback was added for — and the in-app sheet is the way through.
          // Outside it, on the attempt made the moment the cut lands, the far likelier cause is the
          // tap's activation expiring while the video rendered, and the next tap restores it.
          if (withinGesture) onRefused();
          else setToast(<span>Video ready — tap Share to send it.</span>);
        });
    },
    [debate, onRefused, setToast, spaceId]
  );

  // Settle the wait the moment there is something to settle it with.
  React.useEffect(() => {
    if (!active || armed || outcome === 'waiting') return;

    setArmed(true);
    if (outcome === 'video') {
      shareNow({ withinGesture: false });
      return;
    }
    setToast(<span>{prepared.error ?? 'No video for this debate — tap Share to send the link.'}</span>);
  }, [active, armed, outcome, prepared.error, shareNow, setToast]);

  // A card is per-debate on both surfaces, so this is a guard rather than a path — but a Share
  // left armed for a debate the host swapped underneath would share the wrong one.
  React.useEffect(() => {
    setRequested(false);
    setArmed(false);
  }, [debateId]);

  const onShare = React.useCallback(() => {
    if (!debate) return;
    // Preparing. The button is already inert; a second tap must not start a second wait.
    if (requested && !armed) return;
    if (armed || preparedSocialVideoFile(debate.id)) {
      shareNow({ withinGesture: true });
      return;
    }
    setRequested(true);
  }, [armed, debate, requested, shareNow]);

  return {
    status: !active ? 'idle' : armed ? 'armed' : 'preparing',
    progressPercent: active && !armed ? prepared.progressPercent : null,
    onShare,
  };
}
