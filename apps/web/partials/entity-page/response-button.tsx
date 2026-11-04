'use client';

import * as React from 'react';

import cx from 'classnames';

import { RESPONSE_CONFIRMING_COPY } from '~/core/responses/entity-response';
import {
  isResponseAnnouncer,
  registerResponseAnnouncer,
  subscribeResponseAnnouncer,
  unregisterResponseAnnouncer,
} from '~/core/responses/response-confirming-announcer';

import { Tooltip } from '~/design-system/tooltip';

/**
 * The behaviour every response control shares, in one place.
 *
 * Responding to an entity or a claim is drawn three ways — the inline vote arrows, the debate
 * overlay's pill of the same arrows, and the claim's side pills — and each used to decide for
 * itself what a press meant while a response was still confirming. They drifted, one PR at a time:
 * #2587 taught the pills to ignore presses in that window and #2598 gave them a wait cursor, both
 * of which the arrows lacked until #2581 copied them across by hand, and the debate overlay never
 * got either. This is the decision those PRs each edited separately: make it once, and the arrow
 * and pill presentations both move when it changes.
 *
 * The presentations stay free to look different — an arrow is not a pill, an inline row is not a
 * debate overlay — because everything here is about *behaviour* (which presses land, what the
 * pointer and assistive technology are told, whether the hover step applies) and nothing here is
 * about *look*. The look is the caller's `className` / `hoverClassName` / children.
 */
export type ResponseButtonBehaviour = {
  ariaPressed: boolean;
  ariaDisabled: true | undefined;
  disabled: boolean;
  title: string | undefined;
  acceptsPress: boolean;
  showProgressCursor: boolean;
  applyHover: boolean;
};

export function resolveResponseButtonBehaviour({
  selected,
  pending,
  disabled,
  actionTitle,
}: {
  selected: boolean;
  pending: boolean;
  disabled: boolean;
  actionTitle?: string;
}): ResponseButtonBehaviour {
  return {
    ariaPressed: selected,
    ariaDisabled: pending || undefined,
    disabled,
    title: pending ? RESPONSE_CONFIRMING_COPY : actionTitle,
    acceptsPress: !pending && !disabled,
    showProgressCursor: pending,
    applyHover: !pending && !disabled,
  };
}

type ResponseButtonProps = {
  selected: boolean;
  pending?: boolean;
  disabled?: boolean;
  actionTitle?: string;
  onPress: () => void;
  className?: string;
  hoverClassName?: string;
  pendingClassName?: string;
  ariaLabel?: string;
  tooltip?: boolean;
  buttonProps?: React.ButtonHTMLAttributes<HTMLButtonElement> & { [key: `data-${string}`]: string };
  children: React.ReactNode;
};

/**
 * One button, three presentations. The look is the caller's; the behaviour is
 * `resolveResponseButtonBehaviour`'s, and every response surface reaches it through here.
 */
export function ResponseButton({
  selected,
  pending = false,
  disabled = false,
  actionTitle,
  onPress,
  className,
  hoverClassName,
  pendingClassName = 'cursor-progress',
  ariaLabel,
  tooltip = false,
  buttonProps,
  children,
}: ResponseButtonProps) {
  const behaviour = resolveResponseButtonBehaviour({ selected, pending, disabled, actionTitle });

  const button = (
    <button
      type="button"
      {...buttonProps}
      aria-label={ariaLabel}
      aria-pressed={behaviour.ariaPressed}
      aria-disabled={behaviour.ariaDisabled}
      disabled={behaviour.disabled}
      title={tooltip ? undefined : behaviour.title}
      onClick={() => {
        if (behaviour.acceptsPress) onPress();
      }}
      className={cx(
        className,
        behaviour.applyHover && hoverClassName,
        behaviour.showProgressCursor && pendingClassName
      )}
    >
      {children}
    </button>
  );

  if (!tooltip || !behaviour.title) return button;

  return <Tooltip trigger={button} label={behaviour.title} />;
}

/**
 * One screen-reader confirmation for a response still being indexed. Hidden, and always mounted.
 *
 * A live region has to be in the document *before* its text changes for a screen reader to announce
 * that change, so the node stays and only its text comes and goes. `active` is held true across the
 * whole confirming window — through the reconciling⇄delayed retry flips — so the sentence goes in
 * once when the response enters that window and is cleared once when it is confirmed or dropped,
 * rather than removed and re-added on every flip and spoken again each time.
 *
 * `announceKey` identifies the response so that the same claim shown in several controls at once
 * speaks once, not once per control: only the elected announcer for a key fills its region, the
 * rest stay empty. Omit it and the control always announces for itself.
 *
 * `announceRunId` identifies the submission, so a switch or retraction mid-window re-announces.
 */
export function ResponseConfirmingAnnouncement({
  active,
  announceKey,
  announceRunId,
}: {
  active: boolean;
  announceKey?: string;
  announceRunId?: string | null;
}) {
  const isAnnouncer = useIsResponseAnnouncer(announceKey);
  const text = useConfirmingAnnouncementText(active && isAnnouncer, announceRunId ?? null);
  return (
    <span aria-live="polite" className="sr-only">
      {text}
    </span>
  );
}

/** Re-announces on each new runId by blanking the text a frame before restoring it. */
function useConfirmingAnnouncementText(speaking: boolean, runId: string | null): string | null {
  const [text, setText] = React.useState<string | null>(null);
  const spokenRunIdRef = React.useRef<string | null | undefined>(undefined);

  React.useEffect(() => {
    if (!speaking) {
      spokenRunIdRef.current = undefined;
      setText(null);
      return;
    }
    if (spokenRunIdRef.current === runId) return;
    const isReAnnounce = spokenRunIdRef.current !== undefined;
    spokenRunIdRef.current = runId;

    if (!isReAnnounce || typeof requestAnimationFrame === 'undefined') {
      setText(RESPONSE_CONFIRMING_COPY);
      return;
    }
    setText('');
    const frame = requestAnimationFrame(() => setText(RESPONSE_CONFIRMING_COPY));
    return () => cancelAnimationFrame(frame);
  }, [speaking, runId]);

  return text;
}

/** Elects one announcer per response identity among the controls mounted for it. */
function useIsResponseAnnouncer(announceKey: string | undefined): boolean {
  const idRef = React.useRef<symbol | null>(null);
  if (idRef.current === null) idRef.current = Symbol('response-announcer');
  const id = idRef.current;

  React.useEffect(() => {
    if (!announceKey) return;
    registerResponseAnnouncer(announceKey, id);
    return () => unregisterResponseAnnouncer(announceKey, id);
  }, [announceKey, id]);

  return React.useSyncExternalStore(
    React.useCallback(
      listener => (announceKey ? subscribeResponseAnnouncer(announceKey, listener) : () => {}),
      [announceKey]
    ),
    () => (announceKey ? isResponseAnnouncer(announceKey, id) : true),
    () => true
  );
}
