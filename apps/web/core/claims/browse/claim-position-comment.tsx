'use client';

import * as React from 'react';

import cx from 'classnames';

import type { DebateClaimPositionSummary, MatchmakingReadiness } from '~/core/debates/api';
import { PositionRow } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { useCreateComment } from '~/core/hooks/use-create-comment';
import { ENTITY_RESPONSE_COPY } from '~/core/responses/entity-response';

const MAX_COMMENT_HEIGHT_PX = 120;

function fitCommentTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = 'auto';
  const contentHeight = textarea.scrollHeight;
  textarea.style.height = `${Math.min(contentHeight, MAX_COMMENT_HEIGHT_PX)}px`;
  textarea.style.overflowY = contentHeight > MAX_COMMENT_HEIGHT_PX ? 'auto' : 'hidden';
}

/**
 * Position controls for the two surfaces where GEO-2979 invites an explanation.
 *
 * The explanation is a normal top-level comment on the claim. That keeps it in the existing
 * thread, comment count and activity model instead of creating a private second kind of comment.
 * Clearing an already-held side remains a single click; taking or changing a side records that
 * response immediately, keeps the controls in place, and opens an optional composer beneath them.
 */
export function ClaimPositionCommentControl({
  entityId,
  spaceId,
  positions,
  responseKind,
  viewerPosition,
  onRespond,
  promptForComment,
  disabled,
  titleFor,
  noteFor,
  positionRowClassName,
}: {
  entityId: string;
  spaceId: string;
  positions: DebateClaimPositionSummary[];
  responseKind: MatchmakingReadiness['response_kind'];
  viewerPosition: boolean | null;
  onRespond: (position: boolean) => void;
  /** False while signed out; the first click should open sign-in rather than an unusable composer. */
  promptForComment: boolean;
  disabled?: boolean;
  titleFor?: (position: boolean) => string;
  noteFor?: (position: boolean) => React.ReactNode;
  positionRowClassName?: string;
}) {
  const [promptedPosition, setPromptedPosition] = React.useState<boolean | null>(null);
  const [comment, setComment] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const { createComment } = useCreateComment(entityId);

  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    fitCommentTextarea(textarea);
  }, [comment, promptedPosition]);

  // A hint or draft can wrap when the card changes width without changing its value. Re-measure
  // on width changes so Agree can remain one line while the longer Disagree hint naturally makes
  // the textarea two lines on a phone. Ignore height-only observations to avoid a resize loop.
  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || typeof ResizeObserver === 'undefined') return;
    let width = textarea.getBoundingClientRect().width;
    const observer = new ResizeObserver(entries => {
      const nextWidth = entries[0]?.contentRect.width ?? textarea.getBoundingClientRect().width;
      if (nextWidth === width) return;
      width = nextWidth;
      fitCommentTextarea(textarea);
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [promptedPosition]);

  const choosePosition = (position: boolean) => {
    // The position is recorded by the original one-click path first. The composer is an optional
    // follow-up, never a confirmation step standing between the reader and the response they chose.
    onRespond(position);

    // Pressing the held side withdraws it. Asking why somebody *stopped* holding a position would
    // invert the prompt's meaning, so close any invitation that was open.
    if (viewerPosition === position || !promptForComment) {
      setPromptedPosition(null);
      setComment('');
      return;
    }
    setComment('');
    setPromptedPosition(position);
  };

  const publishComment = async () => {
    if (promptedPosition === null || isSubmitting) return;
    const text = comment.trim();
    if (!text) return;
    setIsSubmitting(true);
    await createComment({ text, targetSpaceId: spaceId });

    setPromptedPosition(null);
    setComment('');
    setIsSubmitting(false);
  };

  const copy = ENTITY_RESPONSE_COPY[responseKind];
  const action = promptedPosition === null ? null : promptedPosition ? copy.positiveAction : copy.negativeAction;

  return (
    <div className="flex flex-col gap-3">
      <div className={positionRowClassName}>
        <PositionRow
          positions={positions}
          responseKind={responseKind}
          viewerPosition={viewerPosition}
          onRespond={choosePosition}
          disabled={disabled}
          titleFor={titleFor}
          noteFor={noteFor}
        />
      </div>
      {action ? (
        <div className="@container flex items-center gap-2 rounded-xl border border-grey-02 bg-white p-3">
          <textarea
            ref={textareaRef}
            value={comment}
            onChange={event => setComment(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void publishComment();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setPromptedPosition(null);
                setComment('');
              }
            }}
            placeholder={`Why do you ${action.toLowerCase()}?`}
            aria-label={`Why do you ${action.toLowerCase()}?`}
            autoFocus
            wrap="soft"
            rows={1}
            disabled={isSubmitting}
            className="min-h-5 w-full max-w-[132px] min-w-0 flex-1 resize-none bg-transparent text-body text-text outline-none placeholder:text-grey-03 disabled:opacity-60 @[400px]:max-w-none"
          />
          <div className="ml-auto flex shrink-0 items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => {
                setPromptedPosition(null);
                setComment('');
              }}
              disabled={isSubmitting}
              className="h-7 rounded-full px-3 text-button text-text/70 disabled:opacity-60"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => void publishComment()}
              disabled={isSubmitting || !comment.trim()}
              className={cx(
                'h-7 rounded-full px-3 text-button disabled:opacity-60',
                comment.trim() ? 'bg-text text-white' : 'border border-grey-02 bg-white text-grey-04',
                isSubmitting && 'cursor-wait'
              )}
            >
              {isSubmitting ? 'Publishing…' : 'Comment'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
