'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { EntityActionCallbacks, PostContextNoteModel, PostTemplateModel } from '../models';
import { resolveTemplateImageUrl } from '../ontology';
import {
  ArrowUpRightIcon,
  CheckIcon,
  EntityContextAndDisputes,
  EntityContextTogglePill,
  EntityOverflowMenu,
  PlusIcon,
  RelatedListSection,
  SourceChipList,
  SplitBars,
  TEMPLATE_CARD_SURFACE,
  TemplateBadge,
  TemplateShell,
  TemplateTitleRow,
} from '../primitives';

export interface PostTemplateProps {
  model: PostTemplateModel;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  actionCallbacks?: EntityActionCallbacks;
  compact?: boolean;
  className?: string;
}

const NOTE_TAGS = ['Old footage', 'Missing context', 'Disputed figure', 'Verified context'] as const;
const MAX_NOTE_LENGTH = 280;

/**
 * Pure, data-driven Post template for viral / external social posts with bridging Community Notes.
 */
export function PostTemplate({
  model,
  headerActions,
  footer,
  actionCallbacks,
  compact = false,
  className,
}: PostTemplateProps) {
  const [composing, setComposing] = React.useState(false);
  const [draftTag, setDraftTag] = React.useState<string>('');
  const [draftText, setDraftText] = React.useState('');
  const [draftSource, setDraftSource] = React.useState('');
  const [selectedEvidenceIds, setSelectedEvidenceIds] = React.useState<string[]>([]);
  const [draftError, setDraftError] = React.useState<string | null>(null);
  const resolvedMediaUrl = resolveTemplateImageUrl(model.mediaUrl);
  const postTitle =
    model.title?.trim() ||
    (model.authorName.toLowerCase() === model.platform.toLowerCase()
      ? model.authorName
      : `${model.authorName} on ${model.platform}`);

  const toggleEvidence = (id: string) => {
    setSelectedEvidenceIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
    setDraftError(null);
  };

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
    model.onAddNote?.({
      tag: draftTag,
      text: draftText.trim(),
      sourceUrl: draftSource.trim(),
      selectedEvidenceIds,
    });
    setDraftTag('');
    setDraftText('');
    setDraftSource('');
    setSelectedEvidenceIds([]);
    setDraftError(null);
    setComposing(false);
  };

  return (
    <TemplateShell
      maxWidth={1040}
      breadcrumbs={model.breadcrumbs}
      compact={compact}
      contextByEntityId={model.contextByEntityId}
      actionCallbacks={actionCallbacks}
      className={className}
    >
      <header className="flex flex-col gap-3.5">
        <TemplateTitleRow
          meta={
            <>
              <TemplateBadge tone="post">Post</TemplateBadge>
              <TemplateBadge tone="neutral">{model.platform}</TemplateBadge>
              {model.viewsLabel && <TemplateBadge tone="neutral">{model.viewsLabel}</TemplateBadge>}
              {model.when && <TemplateBadge tone="neutral">{model.when}</TemplateBadge>}
            </>
          }
          actions={
            <>
              <EntityContextTogglePill />
              {headerActions ?? (
                <EntityOverflowMenu target={{ id: model.id, kind: 'Post', title: postTitle }} isPageRoot size="md" />
              )}
            </>
          }
        >
          <h1 className="m-0 text-entityTitle text-pretty text-text">{postTitle}</h1>
        </TemplateTitleRow>
      </header>

      <div className="grid grid-cols-1 items-start gap-7 @[780px]:grid-cols-[minmax(0,410px)_minmax(0,1fr)]">
        {/* Left: post card */}
        <article className={cx('flex flex-col gap-4 p-5 @[780px]:sticky @[780px]:top-20', TEMPLATE_CARD_SURFACE)}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <PostAuthorAvatar avatarUrl={model.authorAvatarUrl} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[17px] font-semibold text-text">{model.authorName}</span>
                {model.authorHandle && <span className="truncate text-[14px] text-grey-04">{model.authorHandle}</span>}
              </div>
            </div>
            <TemplateBadge tone="neutral">{model.platform}</TemplateBadge>
          </div>

          <p className="m-0 text-[16px] leading-[24px] whitespace-pre-line text-text">{model.body}</p>

          {resolvedMediaUrl && (
            <div className="overflow-hidden rounded-lg border border-divider bg-grey-01">
              <img
                src={resolvedMediaUrl}
                alt={model.mediaAlt ?? model.authorName}
                className="max-h-[260px] w-full object-cover"
              />
            </div>
          )}

          {model.engagement && model.engagement.length > 0 && (
            <div className="flex flex-wrap gap-5 border-t border-divider pt-3 text-[14px] text-grey-04">
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
              className="inline-flex items-center gap-1.5 self-start text-[15px] font-medium text-ctaPrimary no-underline hover:text-ctaHover"
            >
              <span>View original post on {model.platform}</span>
              <ArrowUpRightIcon className="size-4" />
            </a>
          )}
        </article>

        {/* Right: claims + bridging context notes */}
        <div className="flex min-w-0 flex-col gap-6">
          {model.claims.length > 0 && (
            <section aria-label="Claims in this post" className={cx('flex flex-col gap-3 p-5', TEMPLATE_CARD_SURFACE)}>
              <h2 className="m-0 text-smallTitle text-text">Claims in this post</h2>
              <div className="divide-y divide-divider">
                {model.claims.map(({ claim, stanceLabel }) => (
                  <div key={claim.id} className="flex flex-col gap-2.5 py-3.5 first:pt-1 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      {claim.href ? (
                        <Link
                          href={claim.href}
                          className="text-[17px] leading-[23px] font-semibold text-text no-underline hover:text-[#4c1fd4]"
                        >
                          {claim.title}
                        </Link>
                      ) : claim.onSelect ? (
                        <button
                          type="button"
                          onClick={claim.onSelect}
                          className="cursor-pointer border-0 bg-transparent p-0 text-left text-[17px] leading-[23px] font-semibold text-text hover:text-[#4c1fd4]"
                        >
                          {claim.title}
                        </button>
                      ) : (
                        <span className="text-[17px] leading-[23px] font-semibold text-text">{claim.title}</span>
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
          <section aria-label="Context notes" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="m-0 text-mediumTitle font-semibold text-text">Context notes</h2>
              {model.onAddNote && !composing && (
                <button
                  type="button"
                  onClick={() => setComposing(true)}
                  aria-label="Add context note"
                  title="Add context note"
                  className="inline-grid size-7 cursor-pointer place-items-center border-0 bg-transparent text-grey-04 transition-colors hover:text-text"
                >
                  <PlusIcon className="size-4" />
                </button>
              )}
            </div>

            {model.bridgingRule && <p className="m-0 text-[15px] leading-[22px] text-grey-04">{model.bridgingRule}</p>}

            {composing && model.onAddNote && (
              <form
                onSubmit={handleSubmitNote}
                className="flex flex-col gap-4 rounded-xl border border-text bg-white p-5"
              >
                <div className="flex items-center justify-between">
                  <strong className="text-[17px] text-text">Add a context note</strong>
                  <button
                    type="button"
                    onClick={() => {
                      setComposing(false);
                      setDraftError(null);
                    }}
                    className="cursor-pointer border-0 bg-transparent p-0 text-[14px] text-grey-04 hover:text-text"
                  >
                    Cancel
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
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
                        'cursor-pointer rounded-full border px-3.5 py-1.5 text-[14px] font-medium transition-colors',
                        draftTag === tag
                          ? 'border-text bg-text text-white'
                          : 'border-grey-02 bg-white text-text hover:border-text'
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="post-context-note-body" className="text-[15px] font-medium text-text">
                      What do the sources show?
                    </label>
                    <span className="text-[13px] font-normal text-grey-04 tabular-nums">
                      {draftText.length} / {MAX_NOTE_LENGTH}
                    </span>
                  </div>
                  <textarea
                    id="post-context-note-body"
                    value={draftText}
                    onChange={e => setDraftText(e.target.value.slice(0, MAX_NOTE_LENGTH))}
                    rows={3}
                    placeholder="Write a concise, sourced explanation..."
                    className="w-full rounded-lg border border-grey-02 p-3 text-[16px] font-normal text-text focus:border-text focus:outline-hidden"
                  />
                </div>

                {model.suggestedEvidence && model.suggestedEvidence.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[15px] font-medium text-text">Attach suggested evidence</span>
                    <div className="flex flex-col gap-2">
                      {model.suggestedEvidence.map(item => {
                        const isSelected = selectedEvidenceIds.includes(item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => toggleEvidence(item.id)}
                            className={cx(
                              'flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors',
                              isSelected
                                ? 'border-ctaPrimary bg-ctaTertiary/40 text-text'
                                : 'border-divider bg-bg text-text hover:border-grey-02'
                            )}
                          >
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <span className="text-[15px] font-medium text-text">{item.title}</span>
                              <span className="text-[13.5px] text-grey-04">{item.meta}</span>
                            </span>
                            <span
                              className={cx(
                                'grid size-7 shrink-0 place-items-center rounded-full border',
                                isSelected
                                  ? 'border-ctaPrimary bg-ctaPrimary text-white'
                                  : 'border-grey-02 bg-white text-grey-04'
                              )}
                            >
                              {isSelected ? <CheckIcon className="size-3.5" /> : <PlusIcon className="size-3.5" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <label className="flex flex-col gap-1.5 text-[15px] font-medium text-text">
                  Additional source link (optional)
                  <input
                    type="url"
                    value={draftSource}
                    onChange={e => setDraftSource(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-grey-02 px-3 py-2.5 text-[16px] font-normal text-text focus:border-text focus:outline-hidden"
                  />
                </label>

                {draftTag && (
                  <div className="flex flex-col gap-2 rounded-lg border border-divider bg-bg p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13.5px] font-medium text-grey-04">Live preview</span>
                      <span className="text-[13px] text-grey-04">
                        {selectedEvidenceIds.length + (draftSource.trim() ? 1 : 0)}{' '}
                        {selectedEvidenceIds.length + (draftSource.trim() ? 1 : 0) === 1 ? 'source' : 'sources'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <TemplateBadge tone="post">{draftTag}</TemplateBadge>
                      <span className="text-[14px] text-grey-04">Needs ratings from both communities</span>
                    </div>
                    <p className="m-0 text-[15px] leading-[22px] text-text">
                      {draftText.trim() || 'Your explanation will appear here as you type.'}
                    </p>
                  </div>
                )}

                {draftError && <p className="m-0 text-[14px] font-medium text-red-01">{draftError}</p>}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="inline-flex h-10 cursor-pointer items-center rounded-full border border-text bg-text px-5 text-button text-white hover:opacity-90"
                  >
                    Submit note
                  </button>
                </div>
              </form>
            )}

            {model.notes.length === 0 ? (
              <p className="m-0 rounded-xl border border-dashed border-grey-02 p-5 text-[15px] text-grey-04">
                No context notes yet.
              </p>
            ) : (
              <div className="flex flex-col gap-3.5">
                {model.notes.map(note => (
                  <ContextNoteCard key={note.id} note={note} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {model.sections.length > 0 && (
        <div className="flex flex-col gap-8">
          {model.sections.map(section => (
            <RelatedListSection key={section.id} section={section} />
          ))}
        </div>
      )}

      <EntityContextAndDisputes
        groups={model.graphConnections}
        target={{ id: model.id, kind: 'Post', title: postTitle }}
      />

      {footer}
    </TemplateShell>
  );
}

function ContextNoteCard({ note }: { note: PostContextNoteModel }) {
  const isShown = note.status === 'shown';

  return (
    <article
      className={cx(
        'flex flex-col gap-3.5 p-5 text-[15px] leading-[23px]',
        isShown
          ? TEMPLATE_CARD_SURFACE
          : note.status === 'mine'
            ? 'rounded-xl border border-ctaPrimary/25 bg-ctaTertiary/25 shadow-[0_2px_10px_rgba(57,99,254,0.06)]'
            : 'rounded-xl border border-dashed border-grey-02 bg-white shadow-[0_1px_6px_rgba(0,0,0,0.03)]'
      )}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <TemplateBadge tone={isShown ? 'post' : 'neutral'}>{note.tag}</TemplateBadge>
        <span className={cx('text-[14px]', isShown ? 'font-medium text-text' : 'text-grey-04')}>
          {note.statusLabel}
        </span>
      </div>

      <p className="m-0 text-text">{note.text}</p>

      {note.sources.length > 0 && <SourceChipList sources={note.sources} />}

      {note.authorLabel && (
        <div className="flex items-center gap-2 text-[14px] text-grey-04">
          {note.authorColor && (
            <span
              aria-hidden
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: note.authorColor }}
            />
          )}
          <span>{note.authorLabel}</span>
        </div>
      )}

      {note.helpfulnessSplit && note.helpfulnessSplit.rows.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-divider pt-3">
          {note.ratingCountLabel && <span className="text-[14px] text-grey-04">{note.ratingCountLabel}</span>}
          <SplitBars rows={note.helpfulnessSplit.rows} density="compact" />
        </div>
      )}

      {note.waitReason && (
        <p className="m-0 rounded-lg bg-grey-01 px-3.5 py-2.5 text-[14px] text-grey-05">{note.waitReason}</p>
      )}

      {note.onRate && (
        <div className="flex flex-wrap items-center gap-2.5 pt-1 text-[15px] text-grey-04">
          <span>Is this helpful?</span>
          <button
            type="button"
            aria-pressed={note.userRating === 'helpful'}
            onClick={() => note.onRate?.('helpful')}
            className={cx(
              'cursor-pointer rounded-full border px-3.5 py-1.5 text-[14px] font-medium transition-colors',
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
              'cursor-pointer rounded-full border px-3.5 py-1.5 text-[14px] font-medium transition-colors',
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

/** The author's face on the post card; nothing at all when the graph has no avatar or it fails to load. */
function PostAuthorAvatar({ avatarUrl }: { avatarUrl?: string | null }) {
  const resolved = resolveTemplateImageUrl(avatarUrl);
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);

  if (!resolved || failedUrl === resolved) return null;

  return (
    <img
      src={resolved}
      alt=""
      loading="lazy"
      onError={() => setFailedUrl(resolved)}
      className="size-11 shrink-0 rounded-full border border-black/[0.06] bg-grey-01 object-cover"
    />
  );
}
