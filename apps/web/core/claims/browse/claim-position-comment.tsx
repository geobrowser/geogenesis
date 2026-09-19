'use client';

import * as React from 'react';

import cx from 'classnames';

import type { DebateClaimPositionSummary, MatchmakingReadiness } from '~/core/debates/api';
import { PositionRow } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { useCreateComment } from '~/core/hooks/use-create-comment';
import { ENTITY_RESPONSE_COPY } from '~/core/responses/entity-response';

/**
 * Position controls for the two surfaces where GEO-2979 invites an explanation.
 *
 * The explanation is a normal top-level comment on the claim. That keeps it in the existing
 * thread, comment count and activity model instead of creating a private second kind of comment.
 * Clearing an already-held side remains a single click; taking or changing a side opens this
 * optional composer first.
 */
export function ClaimPositionCommentControl({
  entityId,
  spaceId,
  positions,
  responseKind,
  viewerPosition,
  onRespond,
  onRespondAsync,
  promptForComment,
  disabled,
  titleFor,
  noteFor,
}: {
  entityId: string;
  spaceId: string;
  positions: DebateClaimPositionSummary[];
  responseKind: MatchmakingReadiness['response_kind'];
  viewerPosition: boolean | null;
  onRespond: (position: boolean) => void;
  onRespondAsync: (position: boolean) => Promise<boolean>;
  /** False while signed out; the first click should open sign-in rather than an unusable composer. */
  promptForComment: boolean;
  disabled?: boolean;
  titleFor?: (position: boolean) => string;
  noteFor?: (position: boolean) => React.ReactNode;
}) {
  const [promptedPosition, setPromptedPosition] = React.useState<boolean | null>(null);
  const [comment, setComment] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const { createComment } = useCreateComment(entityId);

  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [comment, promptedPosition]);

  const choosePosition = (position: boolean) => {
    // Pressing the held side withdraws it. Asking why somebody *stopped* holding a position would
    // invert the prompt's meaning, so preserve the direct one-click behavior here.
    if (viewerPosition === position || !promptForComment) {
      onRespond(position);
      return;
    }
    setComment('');
    setPromptedPosition(position);
  };

  const publishPosition = async (includeComment: boolean) => {
    if (promptedPosition === null || isSubmitting) return;
    setIsSubmitting(true);
    const published = await onRespondAsync(promptedPosition);
    if (!published) {
      setIsSubmitting(false);
      return;
    }

    const text = comment.trim();
    // The response transaction has landed before the comment is sent. If the comment write fails,
    // `useCreateComment` reports it through the shared status bar without retrying the response and
    // accidentally turning the newly selected side back off.
    if (includeComment && text) {
      await createComment({ text, targetSpaceId: spaceId });
    }

    setPromptedPosition(null);
    setComment('');
    setIsSubmitting(false);
  };

  if (promptedPosition === null) {
    return (
      <PositionRow
        positions={positions}
        responseKind={responseKind}
        viewerPosition={viewerPosition}
        onRespond={choosePosition}
        disabled={disabled}
        titleFor={titleFor}
        noteFor={noteFor}
      />
    );
  }

  const copy = ENTITY_RESPONSE_COPY[responseKind];
  const action = promptedPosition ? copy.positiveAction : copy.negativeAction;

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-grey-02 bg-white p-3">
      <textarea
        ref={textareaRef}
        value={comment}
        onChange={event => setComment(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void publishPosition(true);
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setPromptedPosition(null);
            setComment('');
          }
        }}
        placeholder={`Why do you ${action.toLowerCase()}?…`}
        aria-label={`Why do you ${action.toLowerCase()}?`}
        autoFocus
        rows={1}
        disabled={isSubmitting}
        className="min-h-5 w-full resize-none overflow-hidden bg-transparent text-body text-text outline-none placeholder:text-grey-03 disabled:opacity-60"
      />
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            setPromptedPosition(null);
            setComment('');
          }}
          disabled={isSubmitting}
          className="text-button text-text/70 disabled:opacity-60"
        >
          Back
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void publishPosition(false)}
            disabled={isSubmitting}
            className="h-7 rounded-full px-3 text-button text-text/70 disabled:opacity-60"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={() => void publishPosition(true)}
            disabled={isSubmitting}
            className={cx(
              'h-7 rounded-full bg-text px-3 text-button text-white disabled:opacity-60',
              isSubmitting && 'cursor-wait'
            )}
          >
            {isSubmitting ? 'Publishing…' : action}
          </button>
        </div>
      </div>
    </div>
  );
}
