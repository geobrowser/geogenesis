'use client';

import * as React from 'react';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import type { DebateParticipantSummary, ParticipantSlot } from './api';
import { DebateFormatDetails } from './format-details';
import { DebateFormatSelector } from './format-selector';
import type { DebateFormatId } from './formats';
import { speakerLabel } from './playback-utils';
import { useScrollLock } from './use-scroll-lock';

export type DebateRequestDialogParticipant = DebateParticipantSummary & {
  participant_slot: ParticipantSlot;
  position: boolean;
  position_label: string;
};

type DebateRequestDialogFormatSelector = {
  value: DebateFormatId;
  selectedFormatId?: string | null;
  name: string;
  onChange: (formatId: DebateFormatId) => void;
};

type DebateRequestDialogProps = {
  claim: string;
  participants: readonly DebateRequestDialogParticipant[];
  currentUserId: string;
  formatId: string | null | undefined;
  formatSelector?: DebateRequestDialogFormatSelector;
  busy: boolean;
  error: string | null;
  onAccept: () => void;
  onReject: () => void;
  /** Defaults to "Accept". The GEO-2514 ready prompt says "Join debate" — there is nothing left
   * to accept by then, only a room to walk into. */
  acceptLabel?: string;
  /** Defaults to "Reject". GEO-2430 request popups say "Not now" instead. */
  rejectLabel?: string;
  /**
   * `stacked` (the default) leads with Accept and puts the reject below it — right for a match,
   * which you are expected to take. `split` sets them side by side, which is what GEO-2430's
   * request popup does: turning a request down is an ordinary answer, not a way out.
   */
  actionsLayout?: 'stacked' | 'split';
  /** Replaces the plain "Debate request" eyebrow, e.g. with the claim's space. */
  eyebrow?: React.ReactNode;
  /** GEO-2430: a text action beside the "Debate format" heading, e.g. "Dismiss forever". */
  formatAction?: { label: string; onClick: () => void };
  /** Rendered centred under the claim, e.g. the claim's response control. */
  headerNote?: React.ReactNode;
  /** GEO-2430: overflow ("…") menu anchored to the participants card, e.g. to block a user. */
  overflowMenu?: React.ReactNode;
};

export function DebateRequestDialog({
  claim,
  participants,
  currentUserId,
  formatId,
  formatSelector,
  busy,
  error,
  onAccept,
  onReject,
  acceptLabel = 'Accept',
  rejectLabel = 'Reject',
  actionsLayout = 'stacked',
  eyebrow,
  formatAction,
  headerNote,
  overflowMenu,
}: DebateRequestDialogProps) {
  const titleId = React.useId();
  const turnParticipants = React.useMemo(
    () => [...participants].sort((a, b) => a.participant_slot - b.participant_slot),
    [participants]
  );
  const positionParticipants = React.useMemo(
    () =>
      [...turnParticipants].sort(
        (a, b) => Number(b.position) - Number(a.position) || a.participant_slot - b.participant_slot
      ),
    [turnParticipants]
  );
  const firstParticipant = positionParticipants[0];
  const secondParticipant = positionParticipants[1] ?? firstParticipant;

  useScrollLock();

  if (!firstParticipant || !secondParticipant) return null;

  return (
    <div className="max-sm:items-end max-sm:p-0 fixed inset-0 z-1200 flex items-center justify-center bg-text/45 p-5 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-sm:max-h-[calc(100dvh-1rem)] max-sm:rounded-b-none max-sm:border-b-0 max-sm:px-4 max-sm:py-5 grid max-h-[calc(100dvh-2rem)] w-[min(370px,100%)] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 overflow-hidden rounded-lg bg-bg p-5 text-text shadow-card"
      >
        <header className="min-w-0 text-center">
          {eyebrow ?? (
            <Text as="div" variant="metadata" color="text">
              Debate request
            </Text>
          )}
          <h2 id={titleId} className="mt-3 text-cardEntityTitle leading-[1.375rem]">
            {claim}
          </h2>
          {headerNote ? <div className="mt-3 flex justify-center">{headerNote}</div> : null}
        </header>

        <div className="min-h-0 overflow-y-auto pr-1">
          <div className="relative grid grid-cols-[1fr_auto_1fr] items-center rounded-lg bg-white py-5">
            {overflowMenu ? <div className="absolute top-2 right-2">{overflowMenu}</div> : null}
            <ParticipantSummary participant={firstParticipant} currentUserId={currentUserId} />
            <div className="relative grid w-16 place-items-center">
              <span
                aria-hidden="true"
                className="absolute top-1/2 left-1/2 h-14 w-px -translate-x-1/2 -translate-y-1/2 bg-divider"
              />
              <span className="relative grid h-7 w-7 place-items-center rounded-full border border-divider bg-white text-tag text-text">
                VS
              </span>
            </div>
            <ParticipantSummary participant={secondParticipant} currentUserId={currentUserId} />
          </div>

          <section className="mt-4 overflow-hidden rounded-lg border border-grey-02 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <Text as="h3" variant="metadata" color="text">
                Debate format
              </Text>
              {formatAction && (
                <button
                  type="button"
                  onClick={formatAction.onClick}
                  disabled={busy}
                  className="text-metadata text-grey-04 underline transition-colors hover:text-text disabled:opacity-50"
                >
                  {formatAction.label}
                </button>
              )}
              {formatSelector && (
                <DebateFormatSelector
                  value={formatSelector.value}
                  selectedFormatId={formatSelector.selectedFormatId}
                  canChoose
                  disabled={busy}
                  onChange={formatSelector.onChange}
                  name={formatSelector.name}
                  className="w-[min(260px,100%)]"
                />
              )}
            </div>
            <div className="px-1 pb-1">
              <DebateFormatDetails formatId={formatId} participants={turnParticipants} currentUserId={currentUserId} />
            </div>
          </section>

          {error && (
            <Text as="p" variant="body" color="red-01" className="mt-3">
              {error}
            </Text>
          )}
        </div>

        <footer className="grid gap-5">
          {actionsLayout === 'split' ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onReject}
                disabled={busy}
                className="flex h-7 w-full items-center justify-center rounded-full border border-grey-02 px-4 text-metadata text-text transition-colors hover:bg-grey-01 disabled:opacity-50"
              >
                {rejectLabel}
              </button>
              <button
                type="button"
                onClick={onAccept}
                disabled={busy}
                className="flex h-7 w-full items-center justify-center rounded-full bg-text px-4 text-metadata text-white transition-colors hover:bg-text/90 disabled:opacity-50"
              >
                {acceptLabel}
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={onAccept}
                disabled={busy}
                className="flex h-7 w-full items-center justify-center rounded-full bg-text px-4 text-metadata text-white transition-colors hover:bg-text/90 disabled:opacity-50"
              >
                {acceptLabel}
              </button>
              <button
                type="button"
                onClick={onReject}
                disabled={busy}
                className="mx-auto px-4 py-1 text-metadata text-grey-04 hover:text-text disabled:opacity-50"
              >
                {rejectLabel}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}

function ParticipantSummary({
  participant,
  currentUserId,
}: {
  participant: DebateRequestDialogParticipant;
  currentUserId: string;
}) {
  const label = participant.user_id === currentUserId ? 'You' : speakerLabel(participant);

  return (
    <div className="grid min-w-0 justify-items-center gap-2 text-center">
      <span className="h-5 w-5 overflow-hidden rounded-full">
        <Avatar
          avatarUrl={participant.avatar_cid}
          value={participant.profile_space_id}
          alt={speakerLabel(participant)}
          size={20}
        />
      </span>
      <Text as="div" variant="metadata" color="text" className="max-w-full truncate">
        {label}
      </Text>
      <Text as="span" variant="smallButton" color="text" className="rounded-full bg-grey-02 px-2 py-0.5">
        {participant.position_label}
      </Text>
    </div>
  );
}
