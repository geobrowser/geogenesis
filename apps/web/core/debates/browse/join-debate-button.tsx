'use client';

import * as React from 'react';

import cx from 'classnames';

import { useGeoChatAuth } from '~/core/debates/hooks';
import { useDebatesHub } from '~/core/debates/matchmaking/use-debates-hub';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';

import { Button } from '~/design-system/button';

type JoinDebateButtonProps = {
  /**
   * Fired on every press, before anything is decided — including presses that go on to do nothing
   * because Privy has not settled. The full-screen feed makes the pressed debate the active one,
   * because its bar is reachable from 0% visibility while activation needs 60%, so mid-scroll the
   * hub would otherwise open from the debate being scrolled away from.
   */
  onPress?: () => void;
  /**
   * Fired immediately before the hub opens, including on the far side of a sign-in detour. The
   * full-screen feed closes its own in-flow panel here so the hub doesn't stack over one.
   */
  onBeforeOpen?: () => void;
  className?: string;
};

/**
 * "Join a debate" — the one control that takes a viewer from watching debates to being in one.
 *
 * Shared by the full-screen feed and the explore card so the two can't answer a press differently
 * (GEO-2912). What it decides is worth more than what it looks like: every path below was a bug
 * once, and a second copy of this is a second chance to get one of them wrong.
 */
export function JoinDebateButton({ onPress, onBeforeOpen, className }: JoinDebateButtonProps) {
  // Cross-space, and carrying the search, filters, counts and ranking a single space's claims
  // panel never had — which is why this opens the hub rather than a panel of local claims.
  const debatesHub = useDebatesHub();
  // Carry the intent across the login: signing in is a detour the viewer did not ask for, so
  // finish what they pressed rather than returning them to press it again.
  const openPrivySignIn = usePrivySignIn(() => {
    onBeforeOpen?.();
    debatesHub.open('lobby');
  });
  // Privy, not the smart account: `useSmartAccount` reports null while the account is restoring
  // and after an initialization failure as well as when nobody is signed in, and sending a
  // signed-in viewer back through login would wipe their half-finished onboarding.
  const { ready: authReady, authenticated } = useGeoChatAuth();

  const onClick = () => {
    onPress?.();
    // Decide nothing until Privy has restored the session: a press in that window is a no-op
    // rather than a wrong answer in either direction.
    if (!authReady) return;
    // Everything the hub offers — taking a position, standing ready, requesting a debate — needs
    // an account, so a signed-out viewer gets the same login voting gives them rather than a panel
    // whose every control refuses them.
    if (!authenticated) {
      openPrivySignIn();
      return;
    }
    // A second press closes it, the way the navbar's debate button behaves. Without this the
    // button is a one-way door and the only way out is the panel's own close control.
    if (debatesHub.isOpen) {
      debatesHub.close();
      return;
    }
    onBeforeOpen?.();
    debatesHub.open('lobby');
  };

  return (
    <Button
      type="button"
      // Exempts this button from the hub's outside-pointerdown dismissal, the same way the
      // navbar's opener is exempt. Without it the pointerdown closed the hub and the click
      // that followed reopened it, which read as a flicker.
      data-debates-hub-opener
      variant="secondary"
      small
      onClick={onClick}
      className={cx(
        '!h-7 shrink-0 !rounded-full !px-[11px] !py-0 !leading-[13px] !font-normal !tracking-[-0.35px] !shadow-none',
        className
      )}
    >
      Join a debate
    </Button>
  );
}
