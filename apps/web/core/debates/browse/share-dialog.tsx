'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import type { Debate } from '~/core/debates/api';
import { useToast } from '~/core/hooks/use-toast';
import { NavUtils } from '~/core/utils/utils';

import { Close } from '~/design-system/icons/close';
import { Download } from '~/design-system/icons/download';
import { Link } from '~/design-system/icons/link';
import { LinkedIn } from '~/design-system/icons/linkedin';
import { Reddit } from '~/design-system/icons/reddit';
import { XIcon } from '~/design-system/icons/x';
import { Spinner } from '~/design-system/spinner';

import { downloadPreparedVideo, usePreparedSocialVideo } from '../social-video-share';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debate: Debate;
  spaceId: string;
};

/**
 * The Share sheet for a debate: one-tap social hand-offs (Reddit, X, LinkedIn), a copy-link button,
 * and a download of the prepared debate video.
 */
export function DebateShareDialog({ open, onOpenChange, debate, spaceId }: Props) {
  const download = useDebateVideoDownload(debate.id, open);
  const [, setToast] = useToast();

  const shareUrl = () => `${window.location.origin}${NavUtils.toEntity(spaceId, debate.id)}`;
  const shareText = 'Watch the debate on Geo!';

  const openComposer = (href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const onReddit = () => {
    const url = shareUrl();
    openComposer(`https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(shareText)}`);
  };

  const onX = () => {
    const url = shareUrl();
    openComposer(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`
    );
  };

  const onLinkedIn = () => {
    // `share-offsite` ignores any text param — it scrapes the page's OG tags. The feed composer is
    // the only hand-off that pre-fills text; putting the URL in the text still yields a link preview.
    openComposer(
      `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(`${shareText} ${shareUrl()}`)}`
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
              <ShareAction
                label="Download"
                ariaLabel="Download debate video"
                onClick={download.download}
                disabled={download.status === 'preparing'}
                tile={<GlyphTile icon={download.status === 'preparing' ? <Spinner /> : <Download />} />}
              />
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

type DownloadStatus = 'idle' | 'preparing' | 'ready' | 'error';

/**
 * Prepares and downloads the debate's social video, but only once the viewer actually presses
 * Download.
 */
function useDebateVideoDownload(debateId: string, enabled: boolean) {
  const [requested, setRequested] = React.useState(false);
  const autoDownloadRef = React.useRef(false);
  const prepared = usePreparedSocialVideo(debateId, { enabled: enabled && requested, includePreview: false });

  React.useEffect(() => {
    if (!enabled) {
      setRequested(false);
      autoDownloadRef.current = false;
    }
  }, [enabled]);

  React.useEffect(() => {
    if (!autoDownloadRef.current) return;
    if (prepared.status === 'ready' && prepared.downloadUrl && prepared.file) {
      autoDownloadRef.current = false;
      downloadPreparedVideo(prepared.downloadUrl, prepared.file.name);
    }
  }, [prepared.status, prepared.downloadUrl, prepared.file]);

  const status: DownloadStatus = requested ? prepared.status : 'idle';

  const download = () => {
    if (prepared.status === 'ready' && prepared.downloadUrl && prepared.file) {
      downloadPreparedVideo(prepared.downloadUrl, prepared.file.name);
      return;
    }
    autoDownloadRef.current = true;
    if (prepared.status === 'error') {
      prepared.retry();
      return;
    }
    setRequested(true);
  };

  return { status, download };
}
