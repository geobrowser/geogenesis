'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { ClaimTopicPillModel } from '../models';
import { resolveTemplateImageUrl } from '../ontology';

const INITIAL_VISIBLE_TOPICS = 9;

function TopicPillThumbnail({ label, imageUrl }: { label: string; imageUrl?: string | null }) {
  const resolved = resolveTemplateImageUrl(imageUrl);
  const [failed, setFailed] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [resolved]);

  const initial = label.trim()[0]?.toUpperCase() ?? '';
  const showImage = Boolean(resolved) && !failed;

  return (
    <span
      aria-hidden
      className="relative inline-grid size-5 shrink-0 place-items-center overflow-hidden rounded-full bg-grey-01 text-[10px] font-semibold text-grey-04"
    >
      {(!showImage || !loaded) && <span>{initial}</span>}
      {showImage && (
        <img
          src={resolved ?? undefined}
          alt=""
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cx(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-150',
            loaded ? 'opacity-100' : 'opacity-0'
          )}
        />
      )}
    </span>
  );
}

/**
 * Rounded Topic pills with circular thumbnail images (matching Geo Genesis's `SpacePill` aesthetic),
 * monogram fallback when a topic has no Avatar/Cover image, and `Show N more` toggle past 9 pills.
 */
export function TopicImagePills({
  topics,
  title = 'Topics',
  className,
}: {
  topics: readonly ClaimTopicPillModel[];
  title?: string;
  className?: string;
}) {
  const [showAll, setShowAll] = React.useState(false);

  if (topics.length === 0) return null;

  const visible = showAll ? topics : topics.slice(0, INITIAL_VISIBLE_TOPICS);
  const hidden = Math.max(0, topics.length - INITIAL_VISIBLE_TOPICS);

  const pillClasses =
    'inline-flex max-w-full items-center gap-2 rounded-full border border-grey-02 bg-white py-1.5 pr-3 pl-2 text-[14.5px] leading-[18px] font-medium text-text no-underline transition-colors hover:border-text';

  return (
    <section aria-label={title} className={cx('flex flex-col gap-3.5', className)}>
      <h2 className="m-0 text-mediumTitle font-semibold text-text">{title}</h2>
      <div className="flex flex-wrap items-center gap-2">
        {visible.map(topic =>
          topic.href ? (
            <Link key={topic.id} href={topic.href} className={pillClasses}>
              <TopicPillThumbnail label={topic.label} imageUrl={topic.imageUrl} />
              <span className="min-w-0 truncate">{topic.label}</span>
            </Link>
          ) : topic.onSelect ? (
            <button key={topic.id} type="button" onClick={topic.onSelect} className={cx(pillClasses, 'cursor-pointer')}>
              <TopicPillThumbnail label={topic.label} imageUrl={topic.imageUrl} />
              <span className="min-w-0 truncate">{topic.label}</span>
            </button>
          ) : (
            <span key={topic.id} className={pillClasses}>
              <TopicPillThumbnail label={topic.label} imageUrl={topic.imageUrl} />
              <span className="min-w-0 truncate">{topic.label}</span>
            </span>
          )
        )}
        {hidden > 0 && (
          <button
            type="button"
            aria-expanded={showAll}
            onClick={() => setShowAll(prev => !prev)}
            className="inline-flex cursor-pointer items-center rounded-full border border-grey-02 bg-white px-3 py-1.5 text-[14px] leading-[18px] font-medium text-grey-04 transition-colors hover:border-text hover:text-text"
          >
            {showAll ? 'Show less' : `Show ${hidden} more`}
          </button>
        )}
      </div>
    </section>
  );
}
