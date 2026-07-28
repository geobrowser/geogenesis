'use client';

import * as React from 'react';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import type { DebateParticipantSummary, ParticipantSlot } from './api';
import { DebateFormatDetails } from './format-details';
import { DebateFormatSelector } from './format-selector';
import type { DebateFormatId } from './formats';
import { speakerLabel } from './playback-utils';

export type DebateRequestDialogParticipant = DebateParticipantSummary & {
  participant_slot: ParticipantSlot;
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
}: DebateRequestDialogProps) {
  const titleId = React.useId();
  const turnParticipants = React.useMemo(
    () => [...participants].sort((a, b) => a.participant_slot - b.participant_slot),
    [participants]
  );
  const positionParticipants = React.useMemo(
    () =>
      [...turnParticipants].sort(
        (a, b) =>
          positionRank(a.position_label) - positionRank(b.position_label) ||
          a.participant_slot - b.participant_slot
      ),
    [turnParticipants]
  );
  const firstParticipant = positionParticipants[0];
  const secondParticipant = positionParticipants[1] ?? firstParticipant;

  React.useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalDocumentOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalDocumentOverflow;
    };
  }, []);

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
          <Text as="div" variant="metadata" color="text">
            Debate request
          </Text>
          <h2 id={titleId} className="mt-3 text-cardEntityTitle leading-[1.375rem]">
            {claim}
          </h2>
        </header>

        <div className="min-h-0 overflow-y-auto pr-1">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center rounded-lg bg-white py-5">
            <ParticipantSummary participant={firstParticipant} currentUserId={currentUserId} />
            <div className="relative grid w-16 place-items-center">
              <span
                aria-hidden="true"
                className="absolute top-1/2 left-1/2 h-14 w-px -translate-x-1/2 -translate-y-1/2 bg-divider"
              />
              <span className="relative grid h-7 w-7 place-items-center rounded-full border border-divider bg-white text-smallButton text-text">
                vs
              </span>
            </div>
            <ParticipantSummary participant={secondParticipant} currentUserId={currentUserId} />
          </div>

          <section className="mt-4 overflow-hidden rounded-lg border border-grey-02 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <Text as="h3" variant="metadata" color="text">
                Debate format
              </Text>
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
              <DebateFormatDetails
                formatId={formatId}
                participants={turnParticipants}
                currentUserId={currentUserId}
              />
            </div>
          </section>

          {error && (
            <Text as="p" variant="body" color="red-01" className="mt-3">
              {error}
            </Text>
          )}
        </div>

        <footer className="grid gap-3">
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            className="flex min-h-11 w-full items-center justify-center rounded-full bg-text px-5 text-button text-white transition-colors hover:bg-text/90 disabled:opacity-50"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="mx-auto min-h-10 px-4 text-button text-grey-04 hover:text-text disabled:opacity-50"
          >
            Reject
          </button>
        </footer>
      </section>
    </div>
  );
}

function positionRank(positionLabel: string) {
  if (positionLabel === 'Yes') return 0;
  if (positionLabel === 'No') return 1;
  return 2;
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
