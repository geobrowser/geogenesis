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
 * **Named, not "they".** The card already carries Agree/Disagree controls for
 * the *viewer*, so an unnamed verdict beside them is one sentence about two
 * different people with nothing on screen saying which is which. The first name
 * alone: it sits under a page titled with the full one, and the full name ran to
 * the width of the controls it sits beneath.
 *
 * **Worded from the claim's own question.** A claim marked factual asks Verify
 * or Dispute rather than Agree or Disagree, so a tag that always said "agreed"
 * would contradict the buttons beside it on exactly the claims where the
 * distinction matters. The card resolves that kind — the same claim can be
 * factual in one space and not in another — and hands it here.
 *
 * Phrased rather than badged, and deliberately: a second pair of coloured pills
 * reading the same words as the controls would be two things that look alike and
 * mean different people. "Susan agreed" cannot be mistaken for a control.
 */
export function ClaimResponseTag({
  response,
  responseKind,
  personName,
}: {
  response: ClaimResponse | undefined;
  responseKind: 'stance' | 'veracity';
  /** The profile's owner. Falls back to "They" where the name has not loaded. */
  personName?: string | null;
}) {
  const side = responseKind === 'veracity' ? response?.veracity : response?.stance;
  // Nothing to say: they have not answered this question. An absent tag is the
  // honest rendering — a greyed one would imply a verdict that was never given.
  //
  // Not the retracted case, which is filtered out of the tab entirely rather
  // than rendered blank here: `decodeVoteOrder` drops a claim whose answer has
  // been taken back, so a listed claim has a side for one of the two questions.
  // It can still be the other one — a stance where the card asks about veracity
  // — and that is what this returns nothing for.
  if (!side) return null;

  const word = RESPONSE_WORD[responseKind][side];

  return (
    <p className="mt-2 text-breadcrumb text-grey-04">
      {firstName(personName) ?? 'They'} <span className={side === 'agree' ? 'text-green' : 'text-red-01'}>{word}</span>
    </p>
  );
}

/**
 * The first word of a name.
 *
 * Names in the graph are freely entered, so this is a display convenience and
 * not an assertion about how the name is structured: a mononym returns itself,
 * and anything with spaces in it gets its first run of non-space characters.
 */
export function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
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
