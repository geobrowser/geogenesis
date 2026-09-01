'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import type { Debate } from '~/core/debates/api';
import { useDebateMedia } from '~/core/debates/hooks';
import { useToast } from '~/core/hooks/use-toast';
import { NavUtils } from '~/core/utils/utils';

import { Close } from '~/design-system/icons/close';
import { Download } from '~/design-system/icons/download';
import { Link } from '~/design-system/icons/link';
import { LinkedIn } from '~/design-system/icons/linkedin';
import { Reddit } from '~/design-system/icons/reddit';
import { RetrySmall } from '~/design-system/icons/retry-small';
import { XIcon } from '~/design-system/icons/x';
import { Spinner } from '~/design-system/spinner';

import { hasSocialVideo } from '../playback-utils';
import { downloadPreparedVideo, usePreparedSocialVideo } from '../social-video-share';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debate: Debate;
  spaceId: string;
};

const SHARE_TAGLINE = 'Watch the debate on Geo!';

const REDDIT_TITLE_MAX = 300;
const X_TWEET_MAX = 280;
const LINKEDIN_TEXT_MAX = 700;

/**
 * The Share sheet for a debate: one-tap social hand-offs (Reddit, X, LinkedIn), a copy-link button,
 * and a download of the prepared debate video.
 */
export function DebateShareDialog({ open, onOpenChange, debate, spaceId }: Props) {
  const media = useDebateMedia(debate.id, open);
  const socialVideoReady = hasSocialVideo(media.data);
  const download = useDebateVideoDownload(debate.id, open && socialVideoReady);
  const [, setToast] = useToast();

  const shareUrl = () => `${window.location.origin}${NavUtils.toEntity(spaceId, debate.id)}`;

  const shareMessage = (maxLength: number) => {
    const suffix = `. ${SHARE_TAGLINE}`;
    const claim = debate.claim.claim.trim();
    const claimRoom = maxLength - suffix.length;
    const trimmedClaim = claim.length > claimRoom ? `${claim.slice(0, Math.max(0, claimRoom - 1)).trimEnd()}…` : claim;
    return `${trimmedClaim}${suffix}`;
  };

  const openComposer = (href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const onReddit = () => {
    openComposer(
      `https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl())}&title=${encodeURIComponent(shareMessage(REDDIT_TITLE_MAX))}`
    );
  };

  const onX = () => {
    const url = shareUrl();
    const text = shareMessage(X_TWEET_MAX - url.length - 1);
    openComposer(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`);
  };

  const onLinkedIn = () => {
    // `share-offsite` ignores any text param — it scrapes the page's OG tags. The feed composer is
    // the only hand-off that pre-fills text; putting the URL in the text still yields a link preview.
    openComposer(
      `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(`${shareMessage(LINKEDIN_TEXT_MAX)}\n${shareUrl()}`)}`
    );
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setToast(<span>Link copied!</span>);
    } catch {
      setToast(<span>Could not copy link.</span>);
    }
  };

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-[1000] bg-text/20" />
        <Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-[1001] -translate-x-1/2 -translate-y-1/2 focus:outline-hidden"
        >
          <div className="flex h-[142px] w-[316px] max-w-[calc(100vw-2rem)] flex-col rounded-xl bg-white px-6 py-5 shadow-card">
            <div className="relative flex items-center justify-center">
              <Title className="m-0 text-[22.4px] leading-[21px] font-medium tracking-[-0.672px] text-[#212B2E]">
                Share
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
                  label={download.status === 'error' ? 'Retry' : 'Download'}
                  ariaLabel={download.status === 'error' ? 'Retry preparing debate video' : 'Download debate video'}
                  onClick={() => {
                    if (download.status === 'error') {
                      setToast(<span>{download.error ?? 'Could not prepare the video for download.'}</span>);
                    }
                    download.download();
                  }}
                  disabled={download.status === 'preparing'}
                  tile={
                    <GlyphTile
                      icon={
                        download.status === 'preparing' ? (
                          <Spinner />
                        ) : download.status === 'error' ? (
                          <RetrySmall />
                        ) : (
                          <Download />
                        )
                      }
                    />
                  }
                />
              )}
            </div>
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
  disabled,
}: {
  label: string;
  ariaLabel: string;
  onClick: () => void;
  tile: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    // Tile stays 40×40; the column is only as wide as the tile so gap-4 is icon-to-icon spacing.
    // Labels may wrap inside that width so "Copy link" / "Linkedin" don't collide with neighbors.
    <div className="flex w-10 flex-col items-center gap-1.5">
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={onClick}
        disabled={disabled}
        className="grid size-10 shrink-0 place-items-center rounded-full transition-transform hover:scale-[1.06] disabled:cursor-not-allowed disabled:opacity-60"
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

type DownloadStatus = 'preparing' | 'ready' | 'error';

/**
 * Prepares the debate's social video as soon as the sheet opens, so that pressing Download hands off
 * an already-ready blob synchronously.
 */
function useDebateVideoDownload(debateId: string, enabled: boolean) {
  const prepared = usePreparedSocialVideo(debateId, { enabled, includePreview: false });

  const status: DownloadStatus = prepared.status;

  const download = () => {
    if (prepared.status === 'ready' && prepared.downloadUrl && prepared.file) {
      downloadPreparedVideo(prepared.downloadUrl, prepared.file.name);
      return;
    }
    if (prepared.status === 'error') {
      prepared.retry();
    }
  };

  return { status, error: prepared.error, download };
}
