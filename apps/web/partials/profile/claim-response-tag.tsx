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
 * **Under the button that matches.** It renders inside one of the two response
 * cells, so "Susan agrees" sits beneath Agree and "Susan disagrees" beneath
 * Disagree. That is why it takes `forPosition` and returns nothing for the other
 * side: the placement carries half the meaning, and a note that could appear
 * under either button would have to say which side it meant in words.
 *
 * **Named, not "they".** The buttons above it are the *viewer's* — they publish
 * the viewer's own position — so an unnamed verdict beneath them is one sentence
 * about two different people with nothing saying which is which. The first name
 * alone: it sits under a page titled with the full one, and the full name ran to
 * the width of the control it sits beneath.
 *
 * **Present tense.** This is a position somebody currently holds, not something
 * they did once — a retracted one is not listed at all (see `decodeVoteOrder`).
 * "Susan agrees" is a fact about the claim as it stands, which is the same thing
 * the tally to the right of it reports.
 *
 * **Worded from the claim's own question.** A claim marked factual asks Verify
 * or Dispute rather than Agree or Disagree, so a tag that always said "agrees"
 * would contradict the button directly above it on exactly the claims where the
 * distinction matters. The card resolves that kind — the same claim can be
 * factual in one space and not in another — and hands it here.
 */
export function ClaimResponseTag({
  response,
  responseKind,
  personName,
  forPosition,
}: {
  response: ClaimResponse | undefined;
  responseKind: 'stance' | 'veracity';
  /** The profile's owner. Falls back to "They" where the name has not loaded. */
  personName?: string | null;
  /**
   * Which button this is rendering under. The tag appears under one of them and
   * is nothing under the other.
   */
  forPosition: boolean;
}) {
  const side = responseKind === 'veracity' ? response?.veracity : response?.stance;

  // Nothing to say: they have not answered this question, or answered the other
  // one — a stance where the card asks about veracity. An absent tag is the
  // honest rendering of both; a greyed one would imply a verdict never given.
  //
  // Not the retracted case, which is filtered out of the tab entirely rather
  // than rendered blank here: `decodeVoteOrder` drops a claim whose answer has
  // been taken back.
  if (!side) return null;
  if ((side === 'agree') !== forPosition) return null;

  const word = RESPONSE_WORD[responseKind][side];

  return (
    <p className="mt-1.5 text-center text-breadcrumb text-grey-04">
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
 * Each answer as a position held, per question.
 *
 * Taken from the same pair of verbs the response controls use, so the record and
 * the button above it cannot describe one act two ways.
 */
const RESPONSE_WORD = {
  stance: { agree: 'agrees', disagree: 'disagrees' },
  veracity: { agree: 'verifies', disagree: 'disputes' },
} as const;
