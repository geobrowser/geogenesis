'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { PostContextNoteModel, PostTemplateModel } from '../models';
import { RelatedListSection, SourceChipList, SplitBars, TemplateBadge, TemplateShell } from '../primitives';

export interface PostTemplateProps {
  model: PostTemplateModel;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

const NOTE_TAGS = ['Old footage', 'Missing context', 'Disputed figure', 'Verified context'] as const;

/**
 * Pure, data-driven Post template for viral / external social posts with bridging Community Notes.
 *
 * Uses a 2-column container-query layout (sticky post card on left, claims & bridging notes on right)
 * that stacks cleanly in the side panel and on mobile.
 */
export function PostTemplate({ model, headerActions, footer, className }: PostTemplateProps) {
  const [composing, setComposing] = React.useState(false);
  const [draftTag, setDraftTag] = React.useState<string>('');
  const [draftText, setDraftText] = React.useState('');
  const [draftSource, setDraftSource] = React.useState('');
  const [draftError, setDraftError] = React.useState<string | null>(null);

  const handleSubmitNote = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draftTag) {
      setDraftError('Pick a context label first.');
      return;
    }
    if (draftText.trim().length < 20) {
      setDraftError('Write at least a sentence explaining what the sources show.');
      return;
    }
    model.onAddNote?.({ tag: draftTag, text: draftText.trim(), sourceUrl: draftSource.trim() });
    setDraftTag('');
    setDraftText('');
    setDraftSource('');
    setDraftError(null);
    setComposing(false);
  };

  return (
    <TemplateShell maxWidth={1020} breadcrumbs={model.breadcrumbs} className={className}>
      <header className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <TemplateBadge tone="post">Post</TemplateBadge>
            <TemplateBadge tone="neutral">{model.platform}</TemplateBadge>
            {model.viewsLabel && <TemplateBadge tone="neutral">{model.viewsLabel}</TemplateBadge>}
            {model.when && <TemplateBadge tone="neutral">{model.when}</TemplateBadge>}
          </div>
          {headerActions}
        </div>
        <h1 className="m-0 text-largeTitle text-pretty text-text">
          {model.authorName} on {model.platform}
        </h1>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 @[780px]:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        {/* Left: post card */}
        <article className="flex flex-col gap-3 rounded-xl border border-grey-02/80 bg-white p-4 @[780px]:sticky @[780px]:top-20">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-[15px] font-semibold text-text">{model.authorName}</span>
              {model.authorHandle && <span className="text-[13px] text-grey-04">{model.authorHandle}</span>}
            </div>
            <TemplateBadge tone="neutral">{model.platform}</TemplateBadge>
          </div>

          <p className="m-0 text-[16px] leading-[24px] whitespace-pre-line text-text">{model.body}</p>

          {model.mediaUrl && (
            <div className="overflow-hidden rounded-lg border border-divider bg-grey-01">
              <img
                src={model.mediaUrl}
                alt={model.mediaAlt ?? model.authorName}
                className="max-h-[260px] w-full object-cover"
              />
            </div>
          )}

          {model.engagement && model.engagement.length > 0 && (
            <div className="flex flex-wrap gap-4 border-t border-divider pt-2.5 text-[12px] text-grey-04">
              {model.engagement.map(metric => (
                <span key={metric.label}>
                  <strong className="font-semibold text-text">{metric.value}</strong> {metric.label}
                </span>
              ))}
            </div>
          )}

          {model.externalUrl && (
            <a
              href={model.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="self-start text-[13px] font-medium text-ctaPrimary no-underline hover:text-ctaHover"
            >
              View original post on {model.platform} ↗
            </a>
          )}
        </article>

        {/* Right: claims + bridging context notes */}
        <div className="flex min-w-0 flex-col gap-5">
          {model.claims.length > 0 && (
            <section
              aria-label="Claims in this post"
              className="flex flex-col gap-2.5 rounded-xl border border-grey-02/70 bg-white p-4"
            >
              <h2 className="m-0 text-[15px] font-semibold text-text">Claims in this post</h2>
              <div className="divide-y divide-divider">
                {model.claims.map(({ claim, stanceLabel }) => (
                  <div key={claim.id} className="flex flex-col gap-2 py-3 first:pt-1 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      {claim.href ? (
                        <Link
                          href={claim.href}
                          className="text-[15px] leading-[21px] font-semibold text-text no-underline hover:text-ctaPrimary"
                        >
                          {claim.title}
                        </Link>
                      ) : claim.onSelect ? (
                        <button
                          type="button"
                          onClick={claim.onSelect}
                          className="cursor-pointer border-0 bg-transparent p-0 text-left text-[15px] leading-[21px] font-semibold text-text hover:text-ctaPrimary"
                        >
                          {claim.title}
                        </button>
                      ) : (
                        <span className="text-[15px] leading-[21px] font-semibold text-text">{claim.title}</span>
                      )}
                      <TemplateBadge tone="neutral">{stanceLabel}</TemplateBadge>
                    </div>
                    <SplitBars rows={claim.split.rows} density="compact" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Community context notes */}
          <section aria-label="Context notes" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-smallTitle text-text">Context notes ({model.notes.length})</h2>
              {model.onAddNote && !composing && (
                <button
                  type="button"
                  onClick={() => setComposing(true)}
                  className="inline-flex h-8 cursor-pointer items-center rounded-full border border-text bg-text px-3.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
                >
                  + Add context
                </button>
              )}
            </div>

            {model.bridgingRule && <p className="m-0 text-[13px] leading-[18px] text-grey-04">{model.bridgingRule}</p>}

            {composing && model.onAddNote && (
              <form
                onSubmit={handleSubmitNote}
                className="flex flex-col gap-3 rounded-xl border border-text bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <strong className="text-[15px] text-text">Add a context note</strong>
                  <button
                    type="button"
                    onClick={() => {
                      setComposing(false);
                      setDraftError(null);
                    }}
                    className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-grey-04 hover:text-text"
                  >
                    Cancel
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {NOTE_TAGS.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={draftTag === tag}
                      onClick={() => {
                        setDraftTag(tag);
                        setDraftError(null);
                      }}
                      className={cx(
                        'cursor-pointer rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
                        draftTag === tag
                          ? 'border-text bg-text text-white'
                          : 'border-grey-02 bg-white text-text hover:border-text'
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                <label className="flex flex-col gap-1 text-[13px] font-medium text-text">
                  What do the sources show?
                  <textarea
                    value={draftText}
                    onChange={e => setDraftText(e.target.value)}
                    rows={3}
                    placeholder="Write a concise, sourced explanation..."
                    className="w-full rounded-lg border border-grey-02 p-2.5 text-[14px] font-normal text-text focus:border-text focus:outline-hidden"
                  />
                </label>

                <label className="flex flex-col gap-1 text-[13px] font-medium text-text">
                  Source link (optional)
                  <input
                    type="url"
                    value={draftSource}
                    onChange={e => setDraftSource(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-grey-02 px-2.5 py-2 text-[14px] font-normal text-text focus:border-text focus:outline-hidden"
                  />
                </label>

                {draftError && <p className="m-0 text-[13px] font-medium text-red-01">{draftError}</p>}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="inline-flex h-9 cursor-pointer items-center rounded-full border border-text bg-text px-4 text-button text-white hover:opacity-90"
                  >
                    Submit note
                  </button>
                </div>
              </form>
            )}

            {model.notes.length === 0 ? (
              <p className="m-0 rounded-xl border border-dashed border-grey-02 p-4 text-[13px] text-grey-04">
                No context notes yet.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {model.notes.map(note => (
                  <ContextNoteCard key={note.id} note={note} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {model.sections.length > 0 && (
        <div className="flex flex-col gap-6">
          {model.sections.map(section => (
            <RelatedListSection key={section.id} section={section} />
          ))}
        </div>
      )}

      {footer}
    </TemplateShell>
  );
}

function ContextNoteCard({ note }: { note: PostContextNoteModel }) {
  const isShown = note.status === 'shown';

  return (
    <article
      className={cx(
        'flex flex-col gap-2.5 rounded-xl border p-4 text-[14px] leading-[20px]',
        isShown
          ? 'border-l-2 border-grey-02/80 border-l-purple bg-white'
          : note.status === 'mine'
            ? 'border-ctaPrimary/40 bg-ctaTertiary/30'
            : 'border-dashed border-grey-02 bg-white'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold tracking-wide text-purple uppercase">{note.tag}</span>
        <span className={cx('text-[12px]', isShown ? 'font-medium text-text' : 'text-grey-04')}>
          {note.statusLabel}
        </span>
      </div>

      <p className="m-0 text-text">{note.text}</p>

      {note.sources.length > 0 && <SourceChipList sources={note.sources} />}

      {note.authorLabel && (
        <div className="flex items-center gap-1.5 text-[12px] text-grey-04">
          {note.authorColor && (
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: note.authorColor }}
            />
          )}
          <span>{note.authorLabel}</span>
        </div>
      )}

      {note.helpfulnessSplit && note.helpfulnessSplit.rows.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-black/5 pt-2.5">
          {note.ratingCountLabel && <span className="text-[12px] text-grey-04">{note.ratingCountLabel}</span>}
          <SplitBars rows={note.helpfulnessSplit.rows} density="compact" />
        </div>
      )}

      {note.waitReason && (
        <p className="m-0 rounded-lg bg-grey-01 px-2.5 py-1.5 text-[12px] text-grey-05">{note.waitReason}</p>
      )}

      {note.onRate && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[13px] text-grey-05">
          <span>Is this helpful?</span>
          <button
            type="button"
            aria-pressed={note.userRating === 'helpful'}
            onClick={() => note.onRate?.('helpful')}
            className={cx(
              'cursor-pointer rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
              note.userRating === 'helpful'
                ? 'border-text bg-text text-white'
                : 'border-grey-02 bg-white text-text hover:border-text'
            )}
          >
            Helpful
          </button>
          <button
            type="button"
            aria-pressed={note.userRating === 'not-helpful'}
            onClick={() => note.onRate?.('not-helpful')}
            className={cx(
              'cursor-pointer rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
              note.userRating === 'not-helpful'
                ? 'border-text bg-text text-white'
                : 'border-grey-02 bg-white text-text hover:border-text'
            )}
          >
            Not helpful
          </button>
        </div>
      )}
    </article>
  );
}
