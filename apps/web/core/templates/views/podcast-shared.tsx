'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { PodcastPersonModel, PodcastPlatformLinkModel, PodcastTopicChipModel } from '../models';
import { resolveTemplateImageUrl } from '../ontology';
import { ArrowUpRightIcon, EntityOverflowMenu } from '../primitives';

export function formatPodcastDuration(seconds: number | null | undefined): string | undefined {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return undefined;
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 1) return '< 1 min';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes} min`;
}

export function ApplePodcastsIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 20" fill="none" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M16.9571 6.81868C16.836 6.90869 14.6976 8.06281 14.6976 10.6291C14.6976 13.5974 17.4186 14.6475 17.5 14.6735C17.4875 14.7375 17.0677 16.1116 16.0654 17.5118C15.1717 18.7439 14.2382 19.974 12.8183 19.974C11.3983 19.974 11.0329 19.1839 9.39363 19.1839C7.79616 19.1839 7.22817 20 5.92931 20C4.63045 20 3.72417 18.8599 2.68216 17.4597C1.47519 15.8156 0.5 13.2613 0.5 10.8371C0.5 6.94869 3.13948 4.88649 5.73719 4.88649C7.11749 4.88649 8.26809 5.75458 9.13469 5.75458C9.95953 5.75458 11.2459 4.83448 12.8162 4.83448C13.4113 4.83448 15.5496 4.88649 16.9571 6.81868ZM12.0707 3.18832C12.7201 2.45024 13.1795 1.42614 13.1795 0.40204C13.1795 0.260026 13.167 0.116012 13.1398 0C12.0832 0.0380038 10.8261 0.674067 10.0681 1.51615C9.47298 2.16422 8.91752 3.18832 8.91752 4.22642C8.91752 4.38244 8.94466 4.53845 8.95719 4.58846C9.02401 4.60046 9.1326 4.61446 9.24119 4.61446C10.1892 4.61446 11.3816 4.0064 12.0707 3.18832Z"
      />
    </svg>
  );
}

export function SpotifyIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M10 0C4.47984 0 0 4.47984 0 10C0 15.5202 4.47984 20 10 20C15.5202 20 20 15.5202 20 10C20 4.47984 15.5202 0 10 0Z"
      />
      <path
        fill="#ffffff"
        d="M16.3953 8.996C16.1856 8.996 16.0566 8.94358 15.8752 8.83874C13.0042 7.12503 7.87113 6.71374 4.54854 7.64116C4.40338 7.68148 4.22193 7.746 4.02838 7.746C3.49613 7.746 3.08887 7.33068 3.08887 6.79439C3.08887 6.246 3.42758 5.93552 3.79048 5.83068C5.20984 5.41535 6.79854 5.21777 8.52838 5.21777C11.4719 5.21777 14.5566 5.83068 16.8106 7.14519C17.1252 7.32664 17.3308 7.57665 17.3308 8.05648C17.3308 8.60487 16.8873 8.996 16.3953 8.996ZM15.1453 12.0686C14.9356 12.0686 14.7945 11.9758 14.6494 11.8992C12.1292 10.4073 8.37113 9.80648 5.02838 10.7137C4.83483 10.7662 4.73 10.8186 4.54854 10.8186C4.11709 10.8186 3.76629 10.4678 3.76629 10.0363C3.76629 9.60487 3.97596 9.31858 4.39129 9.20165C5.51225 8.88713 6.65742 8.65326 8.33484 8.65326C10.9518 8.65326 13.48 9.30245 15.4719 10.4879C15.7985 10.6815 15.9276 10.9315 15.9276 11.2823C15.9235 11.7178 15.5848 12.0686 15.1453 12.0686ZM14.0606 14.7137C13.8913 14.7137 13.7864 14.6613 13.6292 14.5686C11.1131 13.0525 8.18564 12.9879 5.29451 13.5807C5.13725 13.621 4.93161 13.6855 4.81467 13.6855C4.42354 13.6855 4.17758 13.375 4.17758 13.0484C4.17758 12.6331 4.42354 12.4355 4.72596 12.371C8.02838 11.6412 11.4034 11.7057 14.2824 13.4275C14.5284 13.5847 14.6735 13.7258 14.6735 14.0928C14.6735 14.4597 14.3873 14.7137 14.0606 14.7137Z"
      />
    </svg>
  );
}

export function HeadphonesIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" strokeLinecap="round" />
      <rect x="3" y="13" width="4" height="7" rx="1.5" />
      <rect x="17" y="13" width="4" height="7" rx="1.5" />
    </svg>
  );
}

export function RssIcon({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden>
      <path d="M4 11a9 9 0 0 1 9 9" strokeLinecap="round" />
      <path d="M4 4a16 16 0 0 1 16 16" strokeLinecap="round" />
      <circle cx="5" cy="19" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PlatformIcon({ name }: { name: string }) {
  const lower = name.toLowerCase();
  if (lower.includes('apple')) return <ApplePodcastsIcon className="size-3.5 shrink-0" />;
  if (lower.includes('spotify')) return <SpotifyIcon className="size-3.5 shrink-0" />;
  return <HeadphonesIcon className="size-3.5 shrink-0" />;
}

export function PodcastArtwork({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  const resolved = resolveTemplateImageUrl(src);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [resolved]);

  return (
    <div className={cx('relative shrink-0 overflow-hidden border border-black/[0.06] bg-grey-01', className)}>
      {resolved && !failed ? (
        <img
          src={resolved}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-grey-03">
          <HeadphonesIcon className="size-7" />
        </div>
      )}
    </div>
  );
}

export function PodcastPlatformButtons({
  platforms,
  rssFeedUrl,
  className,
}: {
  platforms: readonly PodcastPlatformLinkModel[];
  rssFeedUrl?: string;
  className?: string;
}) {
  if (platforms.length === 0 && !rssFeedUrl) return null;

  return (
    <div className={cx('flex flex-wrap items-center gap-2', className)}>
      {platforms.map(platform => (
        <a
          key={platform.id}
          href={platform.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded-full border border-grey-02 bg-white px-3.5 text-[13.5px] font-medium text-text no-underline transition-colors hover:border-text"
        >
          <PlatformIcon name={platform.name} />
          <span>{platform.name}</span>
          <ArrowUpRightIcon className="size-3.5 text-grey-04" />
        </a>
      ))}
      {rssFeedUrl && (
        <a
          href={rssFeedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-grey-02 bg-white px-3.5 text-[13.5px] font-medium text-grey-04 no-underline transition-colors hover:border-text hover:text-text"
        >
          <RssIcon className="size-3.5" />
          <span>RSS</span>
          <ArrowUpRightIcon className="size-3.5" />
        </a>
      )}
    </div>
  );
}

export function PodcastTopicChips({
  topics,
  maxVisible = 8,
  className,
}: {
  topics: readonly PodcastTopicChipModel[];
  maxVisible?: number;
  className?: string;
}) {
  const [expanded, setExpanded] = React.useState(false);

  if (topics.length === 0) return null;
  const visible = expanded ? topics : topics.slice(0, maxVisible);
  const hiddenCount = Math.max(0, topics.length - maxVisible);

  return (
    <div className={cx('flex flex-wrap items-center gap-1.5', className)}>
      {visible.map(topic =>
        topic.href ? (
          <Link
            key={topic.id}
            href={topic.href}
            className="inline-flex h-7 items-center rounded-md border border-divider bg-white px-2.5 text-[13px] font-medium text-text no-underline transition-colors hover:border-text"
          >
            {topic.label}
          </Link>
        ) : topic.onSelect ? (
          <button
            key={topic.id}
            type="button"
            onClick={topic.onSelect}
            className="inline-flex h-7 cursor-pointer items-center rounded-md border border-divider bg-white px-2.5 text-[13px] font-medium text-text transition-colors hover:border-text"
          >
            {topic.label}
          </button>
        ) : (
          <span
            key={topic.id}
            className="inline-flex h-7 items-center rounded-md border border-divider bg-white px-2.5 text-[13px] font-medium text-grey-04"
          >
            {topic.label}
          </span>
        )
      )}
      {hiddenCount > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex h-7 cursor-pointer items-center rounded-md border border-transparent bg-grey-01 px-2 text-[12.5px] font-medium text-grey-04 transition-colors hover:text-text"
        >
          +{hiddenCount} more
        </button>
      )}
    </div>
  );
}

export function PodcastExpandableDescription({ description }: { description?: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const [isTruncated, setIsTruncated] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const paragraphs = React.useMemo(
    () =>
      (description ?? '')
        .split(/\n+/)
        .map(p => p.trim())
        .filter(Boolean),
    [description]
  );

  React.useLayoutEffect(() => {
    if (expanded) return;
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      setIsTruncated(el.scrollHeight > el.clientHeight + 2);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, paragraphs]);

  if (paragraphs.length === 0) return null;

  return (
    <section aria-label="Description" className="flex flex-col gap-2.5">
      <h2 className="m-0 text-mediumTitle font-semibold text-text">Description</h2>
      <div
        ref={containerRef}
        className={cx(
          'flex flex-col gap-3 text-[15.5px] leading-[25px] [overflow-wrap:anywhere] text-text/90',
          !expanded && 'line-clamp-5'
        )}
      >
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="m-0">
            {paragraph}
          </p>
        ))}
      </div>
      {(isTruncated || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded(prev => !prev)}
          className="cursor-pointer self-start border-0 bg-transparent p-0 text-[13.5px] font-medium text-grey-04 transition-colors hover:text-text"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </section>
  );
}

function initialsFrom(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('');
}

function PersonAvatarCircle({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const resolved = resolveTemplateImageUrl(avatarUrl);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [resolved]);

  return (
    <div className="relative size-16 shrink-0 overflow-hidden rounded-full border border-black/[0.06] bg-grey-01">
      {resolved && !failed ? (
        <img
          src={resolved}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-[15px] font-semibold text-grey-04">
          {initialsFrom(name) || '?'}
        </div>
      )}
    </div>
  );
}

export function PodcastPeopleSection({
  title,
  people,
  emptyText,
  headerAction,
  initialVisible = 8,
}: {
  title: string;
  people: readonly PodcastPersonModel[];
  emptyText?: string;
  headerAction?: React.ReactNode;
  initialVisible?: number;
}) {
  const [expanded, setExpanded] = React.useState(false);

  if (people.length === 0 && !emptyText) return null;

  const visiblePeople = expanded ? people : people.slice(0, initialVisible);
  const hiddenCount = Math.max(0, people.length - initialVisible);

  return (
    <section aria-label={title} className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-mediumTitle font-semibold text-text">{title}</h2>
        {headerAction}
      </div>

      {people.length === 0 ? (
        <p className="m-0 text-[14.5px] text-grey-04">{emptyText}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 @[540px]:grid-cols-3 @[760px]:grid-cols-4">
            {visiblePeople.map(person => {
              const inner = (
                <>
                  <PersonAvatarCircle name={person.name} avatarUrl={person.avatarUrl} />
                  <div className="flex min-w-0 flex-col items-center gap-0.5 text-center">
                    <span className="line-clamp-2 text-[14.5px] leading-[19px] font-semibold text-text transition-colors group-hover/person:text-[#4c1fd4]">
                      {person.name}
                    </span>
                    {person.role && <span className="text-[12.5px] text-grey-04">{person.role}</span>}
                  </div>
                </>
              );

              return (
                <div
                  key={person.id}
                  className="group/person relative flex flex-col items-center gap-2.5 rounded-xl border border-black/[0.03] bg-white px-3 py-4 shadow-[0_6px_24px_-6px_rgba(0,0,0,0.05),0_1px_4px_rgba(0,0,0,0.02)] transition-all duration-150 hover:-translate-y-[1px] hover:border-black/[0.06] hover:shadow-[0_12px_30px_-8px_rgba(0,0,0,0.08)]"
                >
                  <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover/person:opacity-100 focus-within:opacity-100">
                    <EntityOverflowMenu target={{ id: person.id, kind: person.role ?? 'Person', title: person.name }} />
                  </div>

                  {person.href ? (
                    <Link
                      href={person.href}
                      className="flex w-full flex-col items-center gap-2.5 text-text no-underline"
                    >
                      {inner}
                    </Link>
                  ) : person.onSelect ? (
                    <button
                      type="button"
                      onClick={person.onSelect}
                      className="flex w-full cursor-pointer flex-col items-center gap-2.5 border-0 bg-transparent p-0 text-text"
                    >
                      {inner}
                    </button>
                  ) : (
                    <div className="flex w-full flex-col items-center gap-2.5">{inner}</div>
                  )}
                </div>
              );
            })}
          </div>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(prev => !prev)}
              className="cursor-pointer self-start border-0 bg-transparent p-0 text-[13.5px] font-medium text-grey-04 transition-colors hover:text-text"
            >
              {expanded ? 'Show less' : `Show ${hiddenCount} more`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
