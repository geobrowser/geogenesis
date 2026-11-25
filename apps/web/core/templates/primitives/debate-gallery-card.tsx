'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { TopicRecentDebateModel, TopicRecentDebateParticipantModel } from '../models';
import { PlayIcon } from './icons';
import { TEMPLATE_CARD_SURFACE } from './template-shell';

/**
 * The Topic page gallery's card width: most of the row on a phone, two across from 540px and three
 * from 860px, measured against the nearest `@container` (the visible row, not the viewport).
 */
export const DEBATE_GALLERY_CARD_WIDTH_CLASS =
  'w-[84cqw] @[540px]:w-[calc((100cqw-1rem)/2)] @[860px]:w-[calc((100cqw-2rem)/3)]';

export interface DebateGalleryCardProps {
  debate: TopicRecentDebateModel;
  /** Width and any extra layout. Defaults to {@link DEBATE_GALLERY_CARD_WIDTH_CLASS}. */
  className?: string;
  /** Called when the card is opened, before navigation. For attribution only. */
  onOpen?: () => void;
  /**
   * A control that belongs to the surface rather than the debate, such as a profile owner's Hide.
   * Drawn on a white chip at the bottom-right of the video, outside the link, so pressing it never
   * opens the debate.
   */
  action?: React.ReactNode;
}

function initialsFrom(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0] ?? '')
    .join('')
    .toUpperCase();
}

/**
 * One debate in a horizontal gallery, as drawn on the Topic page's Recent debates (#3202).
 *
 * The card is only the video: two stacked 480:289 speaker stills, the claim over the top-left (two
 * lines max), each speaker's chip at the bottom-left of their own panel and a play button on the
 * seam. Voting and the overflow menu live on the debate page.
 */
export function DebateGalleryCard({
  debate,
  className = DEBATE_GALLERY_CARD_WIDTH_CLASS,
  onOpen,
  action,
}: DebateGalleryCardProps) {
  const [slot1, slot2] = debate.participants;

  const mediaContent = (
    <div className="relative flex flex-col overflow-hidden bg-[#18191c]">
      <SpeakerVideoStill participant={slot1} tone="top" />
      <div className="h-px w-full bg-white/15" aria-hidden />
      <SpeakerVideoStill participant={slot2} tone="bottom" />

      {/* Claim over the top of the video, two lines max, on a dark scrim so it reads on any frame */}
      <div
        data-debate-claim-overlay
        className="pointer-events-none absolute inset-x-0 top-0 z-[3] bg-gradient-to-b from-black/80 via-black/45 to-transparent px-3 pt-2.5 pb-8"
      >
        <span className="line-clamp-2 text-[15px] leading-[20px] font-semibold text-pretty text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">
          {debate.claimTitle}
        </span>
      </div>

      {/* Centered Play trigger across the two-speaker seam (matches Genesis debate cards) */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 z-[4] grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-text shadow-[0_6px_20px_rgba(0,0,0,0.28)] transition-transform duration-150 group-hover/media:scale-105"
      >
        <PlayIcon className="ml-0.5 size-4" />
      </span>

      {debate.duration && !action && (
        <span className="pointer-events-none absolute right-2.5 bottom-2.5 z-[4] rounded-md bg-black/70 px-1.5 py-0.5 text-[12px] leading-[15px] font-medium text-white tabular-nums backdrop-blur-xs">
          {debate.duration}
        </span>
      )}
    </div>
  );

  return (
    <article
      data-debate-gallery-card
      className={cx(
        'relative flex shrink-0 snap-start flex-col overflow-hidden transition-all duration-200 hover:-translate-y-[1.5px] hover:border-black/[0.06] hover:shadow-[0_18px_40px_-8px_rgba(0,0,0,0.095),0_4px_14px_-2px_rgba(0,0,0,0.04)]',
        TEMPLATE_CARD_SURFACE,
        className
      )}
    >
      {debate.href ? (
        <Link
          href={debate.href}
          onClick={onOpen}
          aria-label={`Watch debate: ${debate.claimTitle}`}
          className="group/media block no-underline"
        >
          {mediaContent}
        </Link>
      ) : debate.onSelect ? (
        <button
          type="button"
          onClick={() => {
            onOpen?.();
            debate.onSelect?.();
          }}
          aria-label={`Watch debate: ${debate.claimTitle}`}
          className="group/media block w-full cursor-pointer border-0 bg-transparent p-0 text-left"
        >
          {mediaContent}
        </button>
      ) : (
        mediaContent
      )}

      {action ? (
        <div
          data-debate-gallery-card-action
          className="shadow-sm absolute right-2 bottom-2 z-[5] rounded-md bg-white/95"
        >
          {action}
        </div>
      ) : null}
    </article>
  );
}

function SpeakerProfileAvatar({
  name,
  avatarUrl,
  communityColor,
  size = 'sm',
}: {
  name: string;
  avatarUrl?: string | null;
  communityColor: string;
  size?: 'sm' | 'lg';
}) {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [avatarUrl]);

  const showPhoto = Boolean(avatarUrl) && !failed;
  const isLarge = size === 'lg';

  if (showPhoto) {
    return (
      <img
        src={avatarUrl ?? undefined}
        alt=""
        aria-hidden
        onError={() => setFailed(true)}
        className={cx(
          'shrink-0 rounded-full object-cover',
          isLarge
            ? 'size-15 border border-white/20 shadow-[0_6px_20px_rgba(0,0,0,0.35)]'
            : 'size-4.5 ring-1 ring-white/25'
        )}
        draggable={false}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cx(
        'inline-grid shrink-0 place-items-center rounded-full font-semibold text-white/95',
        isLarge
          ? 'size-15 border border-white/15 bg-white/10 text-[16px] tracking-[0.02em] backdrop-blur-xs'
          : 'size-4.5 bg-white/15 text-[9px] ring-1 ring-white/20'
      )}
      style={isLarge ? { boxShadow: `0 0 0 2px ${communityColor}66` } : undefined}
    >
      {initialsFrom(name)}
    </span>
  );
}

function SpeakerVideoStill({
  participant,
  tone,
}: {
  participant: TopicRecentDebateParticipantModel;
  tone: 'top' | 'bottom';
}) {
  const [imgFailed, setImgFailed] = React.useState(false);
  const [imgLoaded, setImgLoaded] = React.useState(false);

  React.useEffect(() => {
    setImgFailed(false);
    setImgLoaded(false);
  }, [participant.avatarUrl]);

  const showImage = Boolean(participant.avatarUrl) && !imgFailed;

  return (
    <div
      className="relative aspect-[480/289] w-full overflow-hidden"
      style={{
        background:
          tone === 'top'
            ? `radial-gradient(circle at 50% 42%, ${participant.communityColor}30 0%, #23252a 56%, #141518 100%)`
            : `radial-gradient(circle at 50% 42%, ${participant.communityColor}2e 0%, #1f2228 56%, #131417 100%)`,
      }}
    >
      {/* Portrait fallback shown while still loads or whenever a debate has no cut speaker still */}
      {(!showImage || !imgLoaded) && (
        <div className="absolute inset-0 grid place-items-center">
          <SpeakerProfileAvatar
            name={participant.name}
            avatarUrl={participant.profileAvatarUrl}
            communityColor={participant.communityColor}
            size="lg"
          />
        </div>
      )}

      {showImage && (
        <img
          src={participant.avatarUrl}
          alt={participant.name}
          decoding="async"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgFailed(true)}
          className={cx(
            'relative z-[1] h-full w-full object-cover transition-opacity duration-200',
            imgLoaded ? 'opacity-100' : 'opacity-0'
          )}
          draggable={false}
        />
      )}

      {/* Subtle bottom-edge scrim + speaker avatar, name & stance chip. Both speakers' chips sit at the
          bottom-left of their own panel; the top of the video carries the claim. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-12 bg-gradient-to-t from-black/65 to-transparent"
      />
      <div
        data-speaker-chip={tone}
        className={cx(
          'pointer-events-none absolute right-2.5 left-2.5 z-[3] flex max-w-[calc(100%-20px)] items-center gap-1.5 self-start',
          // The play button straddles the seam right under the top chip, so the chip rides just above it at
          // every card width; a long name would otherwise slide under the button.
          tone === 'top' ? 'bottom-7' : 'bottom-2'
        )}
      >
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-black/60 py-0.5 pr-2.5 pl-1 text-[12px] leading-[16px] text-white backdrop-blur-xs">
          <SpeakerProfileAvatar
            name={participant.name}
            avatarUrl={participant.profileAvatarUrl}
            communityColor={participant.communityColor}
            size="sm"
          />
          <span className="truncate font-medium">{participant.name}</span>
          <span className="shrink-0 text-white/70">· {participant.position}</span>
        </span>
      </div>
    </div>
  );
}
