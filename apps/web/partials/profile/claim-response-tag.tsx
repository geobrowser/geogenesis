'use client';

import * as React from 'react';

import type { ClaimResponse } from '~/core/profile/person-position-order';

/**
 * How the person whose record this is answered a claim (GEO-2859).
 *
 * A visitor reading somebody's Positions could see *which* claims they had
 * answered and not *how* — the list was a record of attention with the verdict
 * left out, which is the one thing it exists to report.
 *
 * **Worded from the claim's own question.** A claim marked factual asks Verify
 * or Dispute rather than Agree or Disagree, so a tag that always said "agreed"
 * would contradict the buttons beside it on exactly the claims where the
 * distinction matters. The card resolves that kind — the same claim can be
 * factual in one space and not in another — and hands it here.
 *
 * Phrased rather than badged, and deliberately: the card already carries
 * Agree/Disagree controls for *the viewer*, and a second pair of coloured pills
 * reading the same words would be two things that look alike and mean different
 * people. "They agreed" cannot be mistaken for a control.
 */
export function ClaimResponseTag({
  response,
  responseKind,
}: {
  response: ClaimResponse | undefined;
  responseKind: 'stance' | 'veracity';
}) {
  const side = responseKind === 'veracity' ? response?.veracity : response?.stance;
  // Nothing to say: they have not answered this question, or answered "neither".
  // An absent tag is the honest rendering of both — a greyed one would imply a
  // verdict that was never given.
  if (!side) return null;

  const word = RESPONSE_WORD[responseKind][side];

  return (
    <span className="text-breadcrumb whitespace-nowrap text-grey-04">
      They <span className={side === 'agree' ? 'text-green' : 'text-red-01'}>{word}</span>
    </span>
  );
}

/**
 * The past tense of each answer, per question.
 *
 * Taken from the same pair of verbs the response controls use, so the record and
 * the buttons cannot describe one act two ways.
 */
const RESPONSE_WORD = {
  stance: { agree: 'agreed', disagree: 'disagreed' },
  veracity: { agree: 'verified', disagree: 'disputed' },
} as const;
