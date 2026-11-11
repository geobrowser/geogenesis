'use client';

import cx from 'classnames';

const EXPLANATION =
  "You left this space while on review only, so you can't request to join again. Copy a link and send it to one of its editors. Opening it lets them add you back.";

interface Props {
  copied: boolean;
  onCopy: () => void;
  className?: string;
}

/** Stands in for Join when the viewer can only get back in through an editor. */
export function AskEditorToAddBackButton({ copied, onCopy, className }: Props) {
  return (
    <button
      type="button"
      onClick={onCopy}
      title={EXPLANATION}
      aria-label={`Ask an editor. ${EXPLANATION}`}
      className={cx(className)}
    >
      {copied ? 'Link copied' : 'Ask an editor'}
    </button>
  );
}
