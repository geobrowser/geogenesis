'use client';

import * as React from 'react';

import { useActionContext } from '~/core/action-context-provider';
import { recordAction } from '~/core/analytics-operations';
import type { Debate } from '~/core/debates/api';
import { useGeoChatAuth } from '~/core/debates/hooks';

import { type MainClaimResponse, useMainClaimResponse } from './use-main-claim-response';

/**
 * Where the full-screen player is in the debate's opening.
 *
 * - `deciding`: the viewer's side on the claim has not answered yet. Playback is held so that a
 *   viewer who already voted does not see the question flash up and vanish.
 * - `stance`: no side taken. The debaters loop silently and the panel asks "Where do you stand?".
 *   Voting, or "Just watch", starts the debate.
 * - `live`: the debate is playing (or ready to), as it always has.
 */
export type StagePhase = 'deciding' | 'stance' | 'live';

/**
 * The inline sign-up for a signed-out viewer who voted.
 *
 * `open` in the claim panel (email, then code); `onboarding` once the code verifies, for a new
 * account's profile steps, still in the panel; `collapsed` to a chip after "Not now" at either
 * point; `confirmed` for the beat when it is all done, when the panel says the vote counts before
 * handing back to the claims.
 */
export type SignupState = 'hidden' | 'open' | 'onboarding' | 'collapsed' | 'confirmed';

/** How long "✓ Your vote counts" stays in the panel before the claims take it back. */
const CONFIRMED_MS = 2_500;

/**
 * The full-screen player's opening: vote to start, and the inline sign-up a signed-out vote leads to.
 *
 * Only the full-screen debate view runs this (`immersive`). Every other player — the explore card,
 * a profile's activity gallery — keeps autoplaying exactly as before.
 *
 * A signed-out vote is not lost and not blocked. The video starts anyway, the side is held here, and
 * it is published once the account can publish it. **This replay is a stand-in**: the PR that makes
 * signed-out votes survive sign-up for every claim control will own that path, and this should move
 * onto it once that lands.
 */
export function useDebateStage({
  debate,
  immersive,
  enabled,
  initialSeekSeconds,
}: {
  debate: Debate;
  /** The full-screen debate view. Off, this reports `live` and does nothing else. */
  immersive: boolean;
  /** Whether the main claim's reads may start — the active card and the one being preloaded. */
  enabled: boolean;
  /** A link that named a moment skips the question: the reader asked to be taken somewhere. */
  initialSeekSeconds: number | null;
}) {
  const main = useMainClaimResponse(debate, immersive && enabled);
  const { ready: authReady, authenticated } = useGeoChatAuth();
  const getContext = useActionContext('debate_stance_panel', 'debate', debate.id, { debate_id: debate.id });

  // Per debate: a card the feed re-ranks onto a different debate starts its opening again.
  const [startedFor, setStartedFor] = React.useState<string | null>(null);
  const started = startedFor === debate.id;
  const [pendingStance, setPendingStance] = React.useState<boolean | null>(null);
  const [signup, setSignup] = React.useState<SignupState>('hidden');
  React.useEffect(() => {
    setPendingStance(null);
    setSignup('hidden');
  }, [debate.id]);

  const viewerPosition = main.control.viewerPosition;

  const phase: StagePhase = !immersive
    ? 'live'
    : started || initialSeekSeconds != null
      ? 'live'
      : !main.known
        ? 'deciding'
        : viewerPosition !== null
          ? 'live'
          : 'stance';

  /**
   * Take a side and start the debate.
   *
   * Signed in, the side is published now through the claim's own control — the same path every
   * other claim surface uses, analytics included. Signed out, it is held and the panel turns into
   * the sign-up; nothing about the video waits on it.
   */
  const vote = React.useCallback(
    (position: boolean) => {
      setStartedFor(debate.id);
      if (authenticated) {
        if (main.control.viewerPosition !== position) main.control.respond(position);
        return;
      }
      setPendingStance(position);
      setSignup('open');
      try {
        recordAction('stance_hold', getContext(), { position: position ? 'agree' : 'disagree' });
      } catch {
        /* Analytics must never block the vote. */
      }
    },
    [authenticated, debate.id, getContext, main.control]
  );

  const justWatch = React.useCallback(
    (via: 'link' | 'video_tap') => {
      setStartedFor(debate.id);
      try {
        recordAction('just_watch', getContext(), { via });
      } catch {
        /* Analytics must never block playback. */
      }
    },
    [debate.id, getContext]
  );

  /**
   * Change side from the end screen — or take one, for a viewer who chose "Just watch".
   *
   * The same two paths as {@link vote}: published now when signed in, held for the sign-up when
   * not. Recorded with where it came from, which is the changed-your-mind measurement.
   */
  const switchStance = React.useCallback(
    (position: boolean) => {
      const from = main.control.viewerPosition ?? pendingStance;
      if (from === position) return;
      if (authenticated) {
        main.control.respond(position);
      } else {
        setPendingStance(position);
        setSignup('open');
      }
      try {
        const label = (side: boolean | null) => (side === null ? 'none' : side ? 'agree' : 'disagree');
        recordAction('stance_switch', getContext(), { from: label(from), to: label(position) });
      } catch {
        /* Analytics must never block the vote. */
      }
    },
    [authenticated, getContext, main.control, pendingStance]
  );

  // The held side, published once the account can publish it. Waits on `canRespond` rather than on
  // `authenticated` alone: a brand-new account has no personal space for the first few seconds, and
  // responding before then would only open the sign-in prompt again.
  const respondNow = React.useEffectEvent((position: boolean) => main.control.respond(position));
  React.useEffect(() => {
    if (pendingStance === null || !authenticated || !main.known) return;
    if (viewerPosition !== null) {
      setPendingStance(null);
      return;
    }
    if (!main.control.canRespond) return;
    respondNow(pendingStance);
    setPendingStance(null);
  }, [authenticated, main.control.canRespond, main.known, pendingStance, viewerPosition]);

  // Signing in moves the sign-up on to onboarding, in the same panel. The panel works out whether
  // this account needs any (an existing one does not) and calls `finishOnboarding` when it is done.
  React.useEffect(() => {
    if (!authenticated) return;
    setSignup(current => (current === 'open' ? 'onboarding' : current));
  }, [authenticated]);
  React.useEffect(() => {
    if (signup !== 'confirmed') return;
    const timer = setTimeout(() => setSignup('hidden'), CONFIRMED_MS);
    return () => clearTimeout(timer);
  }, [signup]);

  return {
    phase,
    main,
    /** The side to show as the viewer's: published, or held for sign-up. */
    stance: viewerPosition ?? pendingStance,
    /** True while the viewer's side is only held, waiting on an account. */
    stanceHeld: pendingStance !== null && viewerPosition === null,
    signup: authReady ? signup : 'hidden',
    authenticated,
    vote,
    justWatch,
    switchStance,
    collapseSignup: () =>
      setSignup(current => (current === 'open' || current === 'onboarding' ? 'collapsed' : current)),
    reopenSignup: () =>
      setSignup(current => (current === 'collapsed' ? (authenticated ? 'onboarding' : 'open') : current)),
    finishOnboarding: () =>
      setSignup(current => (current === 'onboarding' || current === 'collapsed' ? 'confirmed' : current)),
  };
}

export type DebateStage = ReturnType<typeof useDebateStage>;
export type { MainClaimResponse };
