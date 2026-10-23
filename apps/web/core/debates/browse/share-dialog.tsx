'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import { useActionContext } from '~/core/action-context-provider';
import { capture } from '~/core/analytics';
import { observeOperation } from '~/core/analytics-operations';
import type { Debate } from '~/core/debates/api';
import { useDebateMedia } from '~/core/debates/hooks';
import { useToast } from '~/core/hooks/use-toast';
import { ID } from '~/core/id';
import { pushMarketingEvent } from '~/core/marketing-events';
import { copyShareLink, observeShareLinkHandoff } from '~/core/sharing/share-handoff';
import { type ShareMethod as LinkShareMethod, type ShareLink, createShareLink } from '~/core/sharing/share-link';
import { NavUtils } from '~/core/utils/utils';

import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { Close } from '~/design-system/icons/close';
import { Download } from '~/design-system/icons/download';
import { Link } from '~/design-system/icons/link';
import { LinkedIn } from '~/design-system/icons/linkedin';
import { Reddit } from '~/design-system/icons/reddit';
import { XIcon } from '~/design-system/icons/x';

import { hasSocialVideo } from '../playback-utils';
import { SocialVideoCaptionChoiceRows, useSocialVideoCaptionChoice } from '../social-video-caption-choice';
import {
  type PreparedSocialVideo,
  SOCIAL_VIDEO_VARIANTS,
  type SocialVideoCaptions,
  downloadPreparedVideo,
} from '../social-video-share';
import { xShareMessage } from './x-share-message';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debate: Debate;
  spaceId: string;
  openerRef: React.RefObject<HTMLElement | null>;
};

type ShareMethod = LinkShareMethod | 'download';

const SHARE_TAGLINE = 'Watch the debate on Geo!';

const REDDIT_TITLE_MAX = 300;
const LINKEDIN_TEXT_MAX = 700;

/**
 * The Share sheet for a debate: one-tap social hand-offs (Reddit, X, LinkedIn), a copy-link button,
 * and a download of the prepared debate video, with or without captions (GEO-3442).
 */
export function DebateShareDialog({ open, onOpenChange, debate, spaceId, openerRef }: Props) {
  const getContext = useActionContext('share_dialog', 'debate', debate.id, {
    overlay: 'modal',
    overlay_entity_id: debate.id,
    overlay_entity_type: 'debate',
  });
  const media = useDebateMedia(debate.id, open);
  const socialVideoReady = hasSocialVideo(media.data);
  const [step, setStep] = React.useState<'share' | 'captions'>('share');
  const [, setToast] = useToast();

  React.useEffect(() => {
    if (!open) setStep('share');
  }, [open]);

  React.useEffect(() => {
    if (open) pushMarketingEvent('geo_share_open', { debate_id: debate.id, space_id: spaceId });
  }, [open, debate.id, spaceId]);

  const shareLink = (method: LinkShareMethod) =>
    createShareLink(
      `${window.location.origin}${NavUtils.toEntity(spaceId, ID.uuidToHex(debate.id))}`,
      'debate',
      debate.id,
      method
    );
  const participants = debate.participants?.map(participant => participant.profile_space_id);

  const shareMessage = (maxLength: number) => {
    if (maxLength <= 0) return '';
    const suffix = `. ${SHARE_TAGLINE}`;
    if (maxLength < suffix.length) return SHARE_TAGLINE.slice(0, maxLength);
    const claim = debate.claim.claim.trim();
    const claimRoom = maxLength - suffix.length;
    const trimmedClaim = claim.length > claimRoom ? `${claim.slice(0, Math.max(0, claimRoom - 1)).trimEnd()}…` : claim;
    return `${trimmedClaim}${suffix}`;
  };

  const openComposer = (href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  // Preserve synchronous user activation and the handler's original errors.
  const handoffShare = (
    method: ShareMethod,
    handoff: () => void,
    link?: ShareLink,
    properties: Record<string, unknown> = {}
  ) => {
    const context = getContext();
    const recordHandoff = link
      ? observeShareLinkHandoff(link, { ...context, space_id: spaceId }, participants)
      : undefined;
    const operation = observeOperation('share', 'debate', debate.id, undefined, context);
    try {
      handoff();
      recordHandoff?.('composer_requested');
      if (method === 'download') operation.succeeded({ method });
      else operation.failed('unknown');
    } catch (error) {
      operation.failed('unavailable');
      throw error;
    }
    try {
      capture('debate_share_action', { debate_id: debate.id, space_id: spaceId, method, ...properties });
    } catch {}
    pushMarketingEvent('geo_share', { debate_id: debate.id, space_id: spaceId, share_method: method });
  };

  const onReddit = () => {
    const link = shareLink('reddit');
    handoffShare(
      'reddit',
      () =>
        openComposer(
          `https://www.reddit.com/submit?url=${encodeURIComponent(link.url)}&title=${encodeURIComponent(shareMessage(REDDIT_TITLE_MAX))}`
        ),
      link
    );
  };

  const onX = () => {
    const link = shareLink('x');
    const url = link.url;
    const text = xShareMessage(debate.claim.claim, SHARE_TAGLINE);
    handoffShare(
      'x',
      () =>
        openComposer(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
        ),
      link
    );
  };

  const onLinkedIn = () => {
    const link = shareLink('linkedin');
    // `share-offsite` ignores any text param — it scrapes the page's OG tags. The feed composer is
    // the only hand-off that pre-fills text; putting the URL in the text still yields a link preview.
    handoffShare(
      'linkedin',
      () =>
        openComposer(
          `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(`${shareMessage(LINKEDIN_TEXT_MAX)}\n${link.url}`)}`
        ),
      link
    );
  };

  const onCopy = async () => {
    const context = getContext();
    const operation = observeOperation('share', 'debate', debate.id, undefined, context);
    try {
      await copyShareLink(shareLink('copy_link'), { ...context, space_id: spaceId }, participants);
      setToast(<span>Link copied!</span>);
      operation.succeeded({ method: 'copy_link' });
      capture('debate_share_action', { debate_id: debate.id, space_id: spaceId, method: 'copy_link' });
      pushMarketingEvent('geo_share', { debate_id: debate.id, space_id: spaceId, share_method: 'copy_link' });
    } catch {
      operation.failed('unavailable');
      setToast(<span>Could not copy link.</span>);
    }
  };

  const downloadVideo = (video: PreparedSocialVideo, captions: SocialVideoCaptions) => {
    const { downloadUrl, file } = video;
    if (!downloadUrl || !file) return;
    handoffShare('download', () => downloadPreparedVideo(downloadUrl, file.name), undefined, {
      captions: SOCIAL_VIDEO_VARIANTS[captions].captions,
    });
    setStep('share');
  };

  // Prepare only while the sheet is open: closing aborts the in-flight fetch and revokes the blob.
  const captionChoice = useSocialVideoCaptionChoice({
    debateId: debate.id,
    media: media.data,
    enabled: open && socialVideoReady,
    includePreview: false,
    handoff: (video, captions) => {
      try {
        downloadVideo(video, captions);
      } catch {
        // Only reached when the clean file finishes after the click, outside any handler.
        setToast(<span>Could not download the video.</span>);
      }
    },
    // A download needs no gesture, so a file that finishes preparing after the choice still saves.
    canHandoffWithoutGesture: () => true,
  });

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-[1000] bg-text/20" />
        <Content
          aria-describedby={undefined}
          onCloseAutoFocus={event => {
            event.preventDefault();
            openerRef.current?.focus();
          }}
          className="fixed top-1/2 left-1/2 z-[1001] -translate-x-1/2 -translate-y-1/2 focus:outline-hidden"
        >
          <div className="flex min-h-[142px] w-[316px] max-w-[calc(100vw-2rem)] flex-col rounded-xl bg-white px-6 py-5 shadow-card">
            <div className="relative flex items-center justify-center">
              {step === 'captions' && (
                <button
                  type="button"
                  aria-label="Back to share options"
                  onClick={() => {
                    captionChoice.cancel();
                    setStep('share');
                  }}
                  className="absolute left-0 grid size-4 place-items-center text-grey-04 transition-colors hover:text-text"
                >
                  <ArrowLeft />
                </button>
              )}
              <Title className="m-0 text-[22.4px] leading-[21px] font-medium tracking-[-0.672px] text-[#212B2E]">
                {step === 'captions' ? 'Download video' : 'Share'}
              </Title>
              <button
                type="button"
                aria-label="Close"
                onClick={() => onOpenChange(false)}
                className="absolute right-0 grid size-4 place-items-center text-grey-04 transition-colors hover:text-text"
              >
                <Close />
              </button>
            </div>

            {step === 'captions' ? (
              <div className="mt-5">
                <SocialVideoCaptionChoiceRows
                  options={captionChoice.options}
                  onChoose={captionChoice.choose}
                  readyAction="download"
                />
              </div>
            ) : (
              <div className="mt-5 flex justify-center gap-4">
                <ShareAction label="Reddit" ariaLabel="Share on Reddit" onClick={onReddit} tile={<Reddit />} />
                <ShareAction label="X" ariaLabel="Share on X" onClick={onX} tile={<XTile />} />
                <ShareAction label="Linkedin" ariaLabel="Share on LinkedIn" onClick={onLinkedIn} tile={<LinkedIn />} />
                <ShareAction
                  label="Copy link"
                  ariaLabel="Copy link"
                  onClick={onCopy}
                  tile={<GlyphTile icon={<Link />} />}
                />
                {socialVideoReady && (
                  <ShareAction
                    label="Download"
                    ariaLabel="Download debate video"
                    onClick={() => setStep('captions')}
                    tile={<GlyphTile icon={<Download />} />}
                  />
                )}
              </div>
            )}
          </div>
        </Content>
      </Portal>
    </Root>
  );
}

function ShareAction({
  label,
  ariaLabel,
  onClick,
  tile,
}: {
  label: string;
  ariaLabel: string;
  onClick: () => void;
  tile: React.ReactNode;
}) {
  return (
    // Tile stays 40×40; the column is only as wide as the tile so gap-4 is icon-to-icon spacing.
    // Labels may wrap inside that width so "Copy link" / "Linkedin" don't collide with neighbors.
    <div className="flex w-10 flex-col items-center gap-1.5">
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={onClick}
        className="grid size-10 shrink-0 place-items-center rounded-full transition-transform hover:scale-[1.06]"
      >
        {tile}
      </button>
      <span className="w-full text-center text-[11px] leading-tight text-grey-04">{label}</span>
    </div>
  );
}

function XTile() {
  return (
    <span className="grid size-10 place-items-center rounded-full bg-black text-white">
      <XIcon />
    </span>
  );
}

function GlyphTile({ icon }: { icon: React.ReactNode }) {
  return <span className="grid size-10 place-items-center rounded-full bg-divider text-text">{icon}</span>;
}
