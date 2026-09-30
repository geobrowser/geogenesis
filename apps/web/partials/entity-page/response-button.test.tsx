import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { RESPONSE_CONFIRMING_COPY } from '~/core/responses/entity-response';

import { ResponseButton, resolveResponseButtonBehaviour } from './response-button';
import { VOTE_BUTTON_HOVER_CLASS, VOTE_BUTTON_RESTING_CLASS } from './vote-button-styles';

// Radix Tooltip measures its trigger with ResizeObserver, which jsdom does not implement.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

/**
 * The response arrows and the claim pills used to decide separately what a press meant while a
 * response was still confirming
 */
describe('resolveResponseButtonBehaviour', () => {
  it('accepts a press on a live control and tells assistive technology only that it is pressed', () => {
    const behaviour = resolveResponseButtonBehaviour({
      selected: true,
      pending: false,
      disabled: false,
      actionTitle: 'Remove upvote',
    });

    expect(behaviour.acceptsPress).toBe(true);
    expect(behaviour.ariaPressed).toBe(true);
    expect(behaviour.ariaDisabled).toBeUndefined();
    expect(behaviour.showProgressCursor).toBe(false);
    expect(behaviour.applyHover).toBe(true);
    expect(behaviour.title).toBe('Remove upvote');
  });

  it('drops the press while a response confirms, without giving up the taken look', () => {
    const behaviour = resolveResponseButtonBehaviour({
      selected: true,
      pending: true,
      disabled: false,
      actionTitle: 'Remove upvote',
    });

    // Ignored, not disabled: the side still reads as taken (#2587).
    expect(behaviour.acceptsPress).toBe(false);
    expect(behaviour.disabled).toBe(false);
    // Heard, and shown on the pointer — the two halves of "the press was taken" (#2598).
    expect(behaviour.ariaDisabled).toBe(true);
    expect(behaviour.showProgressCursor).toBe(true);
    // Nothing under the pointer is going to happen, so the hover step comes off.
    expect(behaviour.applyHover).toBe(false);
    // One sentence for the wait, everywhere.
    expect(behaviour.title).toBe(RESPONSE_CONFIRMING_COPY);
  });

  it('refuses a press on an account that genuinely cannot respond', () => {
    const behaviour = resolveResponseButtonBehaviour({
      selected: false,
      pending: false,
      disabled: true,
      actionTitle: 'Agree',
    });

    expect(behaviour.acceptsPress).toBe(false);
    expect(behaviour.disabled).toBe(true);
    // Disabled is not confirming: no wait cursor, and the title is still the action.
    expect(behaviour.showProgressCursor).toBe(false);
    expect(behaviour.title).toBe('Agree');
  });
});

/**
 * The point of the whole change: one behaviour, both presentations.
 */
const PRESENTATIONS = [
  {
    name: 'vote arrow',
    render: (props: { selected: boolean; pending: boolean; onPress: () => void }) => (
      <ResponseButton
        selected={props.selected}
        pending={props.pending}
        actionTitle="Agree"
        ariaLabel="Agree"
        tooltip
        onPress={props.onPress}
        className={`group/vote ${VOTE_BUTTON_RESTING_CLASS}`}
        hoverClassName={VOTE_BUTTON_HOVER_CLASS}
      >
        <svg aria-hidden />
      </ResponseButton>
    ),
    getButton: () => screen.getByRole('button', { name: 'Agree' }),
  },
  {
    name: 'claim pill',
    render: (props: { selected: boolean; pending: boolean; onPress: () => void }) => (
      <ResponseButton
        selected={props.selected}
        pending={props.pending}
        actionTitle="Agree"
        onPress={props.onPress}
        className="rounded-full border bg-white"
        hoverClassName="hover:border-text"
      >
        <span>Agree</span>
      </ResponseButton>
    ),
    getButton: () => screen.getByRole('button', { name: 'Agree' }),
  },
];

describe.each(PRESENTATIONS)('the shared behaviour reaches the $name', ({ render: renderPresentation, getButton }) => {
  it('takes a press while the control is live', async () => {
    const onPress = vi.fn();
    render(renderPresentation({ selected: false, pending: false, onPress }));

    await userEvent.click(getButton());

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(getButton()).not.toHaveAttribute('aria-disabled');
    expect(getButton().className).toMatch(/hover:/);
  });

  it('drops the press and shows the wait cursor while a response confirms', async () => {
    const onPress = vi.fn();
    render(renderPresentation({ selected: true, pending: true, onPress }));

    await userEvent.click(getButton());

    expect(onPress).not.toHaveBeenCalled();
    expect(getButton()).toHaveAttribute('aria-disabled', 'true');
    // Still enabled, so the side reads as taken rather than as one that never registered.
    expect(getButton()).toBeEnabled();
    expect(getButton()).toHaveClass('cursor-progress');
    // The hover step is gone in this window — for both skins.
    expect(getButton().className).not.toMatch(/hover:/);
  });

  it('announces which side the viewer holds', () => {
    render(renderPresentation({ selected: true, pending: false, onPress: () => {} }));
    expect(getButton()).toHaveAttribute('aria-pressed', 'true');
  });
});

/**
 * How the label is surfaced differs by presentation, and only that. The pills keep the native
 * `title` — their label is already on screen
 */
describe('the label', () => {
  it('rides the native title by default', () => {
    render(
      <ResponseButton selected={false} actionTitle="Agree" onPress={() => {}} className="pill">
        <span>Agree</span>
      </ResponseButton>
    );
    expect(screen.getByRole('button', { name: 'Agree' })).toHaveAttribute('title', 'Agree');
  });

  it('lets the native title carry the confirming copy while a response confirms', () => {
    render(
      <ResponseButton selected pending actionTitle="Remove agreement" onPress={() => {}} className="pill">
        <span>Agree</span>
      </ResponseButton>
    );
    expect(screen.getByRole('button', { name: 'Agree' })).toHaveAttribute('title', RESPONSE_CONFIRMING_COPY);
  });

  it('moves off the native title into a keyboard-reachable tooltip when asked', async () => {
    render(
      <ResponseButton
        tooltip
        selected={false}
        actionTitle="Agree"
        ariaLabel="Agree"
        onPress={() => {}}
        className="group/vote"
      >
        <svg aria-hidden />
      </ResponseButton>
    );

    const button = screen.getByRole('button', { name: 'Agree' });
    expect(button).not.toHaveAttribute('title');
    fireEvent.focus(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Agree');
  });

  it('puts the confirming copy in the tooltip while a response confirms', async () => {
    render(
      <ResponseButton
        tooltip
        selected
        pending
        actionTitle="Remove agreement"
        ariaLabel="Remove agreement"
        onPress={() => {}}
        className="group/vote"
      >
        <svg aria-hidden />
      </ResponseButton>
    );

    const button = screen.getByRole('button', { name: 'Remove agreement' });
    fireEvent.focus(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(RESPONSE_CONFIRMING_COPY);
  });
});
