'use client';

import * as React from 'react';

import cx from 'classnames';

import { RESPONSE_CONFIRMING_COPY } from '~/core/responses/entity-response';

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
  buttonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
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

  if (!tooltip || !actionTitle) return button;

  return <Tooltip trigger={button} label={actionTitle} />;
}
