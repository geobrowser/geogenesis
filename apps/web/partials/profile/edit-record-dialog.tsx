'use client';

import { Content, Description, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import { useProfileHistory } from '~/core/hooks/use-profile-history';
import { usePublish } from '~/core/hooks/use-publish';
import type { EducationEntry, EmploymentEntry, HistoryCard, HistoryEntry } from '~/core/profile/normalize-history';
import {
  type EducationDraft,
  type PositionDraft,
  educationDraftFromEntry,
  positionDraftFromEntry,
} from '~/core/profile/stage-history';
import { useMutate } from '~/core/sync/use-mutate';

import { Button, SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';

import { AddEducationSheet } from './add-education-sheet';
import { AddPositionSheet } from './add-position-sheet';
import { HistorySection } from './history-section';

type Kind = 'employment' | 'education';

type Props = {
  kind: Kind | null;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  spaceId: string;
};

type Organization = { id: string; name: string | null; stintId: string; isNew?: boolean };
type Editing = { card: HistoryCard<HistoryEntry>; entry: HistoryEntry };

const COPY: Record<Kind, { title: string; description: string }> = {
  employment: {
    title: 'Edit experience',
    description: 'Add, change or remove the roles shown on your profile. Saving publishes to your personal space.',
  },
  education: {
    title: 'Edit education',
    description: 'Add, change or remove the degrees shown on your profile. Saving publishes to your personal space.',
  },
};

/**
 * One section of a profile's history, managed in place (GEO-2859).
 *
 * The pen beside Experience or Education opens this rather than the whole Edit
 * profile modal. A section's own control should offer everything that can be
 * done to that section — the earlier `+` could add and nothing else, so removing
 * a role meant leaving the profile for a modal that also edits your banner.
 *
 * `HistorySection` and the two sheets are the ones the edit modal already uses,
 * wired to the same `useProfileHistory` handlers. This is a second call site,
 * not a second implementation, which is what keeps the two from drifting.
 */
export function EditRecordDialog({ kind, onOpenChange, entityId, spaceId }: Props) {
  const { storage } = useMutate();
  const { makeProposal } = usePublish();
  const history = useProfileHistory({ entityId, spaceId, enabled: kind !== null });

  const [isSaving, setIsSaving] = React.useState(false);
  const [sheet, setSheet] = React.useState<
    | { kind: 'position'; company?: Organization; editing?: Editing }
    | { kind: 'education'; school?: Organization; editing?: Editing }
    | null
  >(null);

  const cards = kind === 'education' ? history.education : history.employment;

  const openSheetFor = (card?: HistoryCard<HistoryEntry>) => {
    // Any of the card's edges will do as the one to hang a new row off; a card
    // holds more than one only where the same employer was recorded twice.
    const org = card?.edges[0]
      ? {
          id: card.organization.id,
          name: card.organization.name,
          stintId: card.edges[0].stintId,
          // Carried, not assumed false: a card for a company typed into this
          // dialog is one whose name has not been written yet.
          isNew: card.organization.isNew,
        }
      : undefined;
    setSheet(kind === 'employment' ? { kind: 'position', company: org } : { kind: 'education', school: org });
  };

  const openSheetOn = (card: HistoryCard<HistoryEntry>, entry: HistoryEntry) => {
    const editing = { card, entry };
    setSheet(kind === 'employment' ? { kind: 'position', editing } : { kind: 'education', editing });
  };

  const close = () => {
    if (isSaving) return;
    // Everything staged here is discarded, which is what Cancel has to mean —
    // the rows live in a queue until Save publishes them.
    history.discard();
    setSheet(null);
    onOpenChange(false);
  };

  const save = async () => {
    if (!history.hasPendingChanges) {
      close();
      return;
    }

    setIsSaving(true);
    const rows = history.stagePending();

    // Written into the store first so the publish layer collects them the way it
    // collects everything else, and so a failure leaves them recoverable rather
    // than lost between a form and a request.
    rows.values.forEach(value => (value.isDeleted ? storage.values.delete(value) : storage.values.set(value)));
    rows.relations.forEach(relation =>
      relation.isDeleted ? storage.relations.delete(relation) : storage.relations.set(relation)
    );

    await makeProposal({
      values: rows.values,
      relations: rows.relations,
      spaceId,
      name: 'Update profile',
      onSuccess: () => {
        history.settle();
        setIsSaving(false);
        setSheet(null);
        onOpenChange(false);
      },
      onError: () => setIsSaving(false),
    });
  };

  const copy = kind ? COPY[kind] : COPY.employment;

  return (
    <Root open={kind !== null} onOpenChange={next => (next ? onOpenChange(true) : close())}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/20" />
        <Content className="fixed inset-0 z-101 flex items-start justify-center overflow-y-auto focus:outline-hidden">
          <div className="my-10 flex w-full max-w-[560px] flex-col rounded-lg border border-grey-02 bg-white shadow-dropdown">
            {sheet ? (
              sheet.kind === 'position' ? (
                <AddPositionSheet
                  spaceId={spaceId}
                  company={sheet.company}
                  initial={
                    sheet.editing &&
                    // The original where there is one: a reconstruction cannot
                    // know the company was created here and still needs its name
                    // written.
                    ((history.draftFor(sheet.editing.entry) as PositionDraft | undefined) ??
                      positionDraftFromEntry(sheet.editing.card.organization, sheet.editing.entry as EmploymentEntry))
                  }
                  onCancel={() => setSheet(null)}
                  onSave={draft => {
                    const editing = sheet.editing;
                    if (editing) history.editEntry(editing.card, editing.entry, 'employment', draft);
                    else history.addPosition(draft);
                    setSheet(null);
                  }}
                />
              ) : (
                <AddEducationSheet
                  spaceId={spaceId}
                  school={sheet.school}
                  initial={
                    sheet.editing &&
                    ((history.draftFor(sheet.editing.entry) as EducationDraft | undefined) ??
                      educationDraftFromEntry(sheet.editing.card.organization, sheet.editing.entry as EducationEntry))
                  }
                  onCancel={() => setSheet(null)}
                  onSave={draft => {
                    const editing = sheet.editing;
                    if (editing) history.editEntry(editing.card, editing.entry, 'education', draft);
                    else history.addEducation(draft);
                    setSheet(null);
                  }}
                />
              )
            ) : (
              <>
                <header className="flex items-center justify-between px-5 py-4">
                  <Title className="text-smallTitle text-text">{copy.title}</Title>
                  <SquareButton type="button" onClick={close} icon={<Close />} aria-label="Close" />
                </header>

                <Description className="sr-only">{copy.description}</Description>

                <div className="px-5 pb-4">
                  <HistorySection
                    kind={kind ?? 'employment'}
                    cards={cards}
                    spaceId={spaceId}
                    disabled={isSaving}
                    isUnavailable={history.isUnavailable}
                    onAdd={() => openSheetFor()}
                    onAddTo={card => openSheetFor(card)}
                    onEditEntry={(card, entry) => openSheetOn(card, entry)}
                    onRemoveEntry={(card, entry) => history.removeEntry(card, entry, kind ?? 'employment')}
                  />
                </div>

                <footer className="flex items-center justify-end gap-2 border-t border-grey-02 px-5 py-4">
                  <Button variant="secondary" onClick={close} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button onClick={save} disabled={isSaving}>
                    {isSaving ? 'Saving…' : 'Save'}
                  </Button>
                </footer>
              </>
            )}
          </div>
        </Content>
      </Portal>
    </Root>
  );
}
