'use client';

import { Content, Description, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import { useEditProfile } from '~/core/hooks/use-edit-profile';
import { useProfileHistory } from '~/core/hooks/use-profile-history';
import type { EducationEntry, EmploymentEntry, HistoryCard, HistoryEntry } from '~/core/profile/normalize-history';
import {
  type EducationDraft,
  type PositionDraft,
  educationDraftFromEntry,
  positionDraftFromEntry,
} from '~/core/profile/stage-history';

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

/** This dialog edits one section; the header fields are not its business. */
const UNCHANGED = { kind: 'unchanged' } as const;

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
 *
 * And it publishes through the modal's own `useEditProfile.publish`, which is
 * the part that has to be shared rather than copied. Writing the staged rows
 * and handing the same array to `makeProposal` publishes an addition correctly
 * and an *edit* not at all: an edit is a removal plus a rewrite, and the
 * tombstone the publish needs is the one `storage.relations.delete` puts in the
 * store — not the row that was passed to it. `publish` writes the rows, then
 * re-collects from the store and sends what it finds, which is why the modal
 * has always saved edits and this dialog did not.
 *
 * The profile draft handed over is `current` unchanged, so nothing touches the
 * name, description or images: this dialog edits one section and says so.
 */
export function EditRecordDialog({ kind, onOpenChange, entityId, spaceId }: Props) {
  const history = useProfileHistory({ entityId, spaceId, enabled: kind !== null });
  const { canEdit, current, publish, status, errorMessage, reset } = useEditProfile({ isOpen: kind !== null });

  const isSaving = status === 'publishing';
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
    // Dismissing during a publish never cancels it, and the staged rows stay put
    // so a retry can re-send them — the same rule the Edit profile modal keeps.
    if (!isSaving) {
      reset();
      history.discard();
      setSheet(null);
    }
    onOpenChange(false);
  };

  const save = () => {
    if (!history.hasPendingChanges) {
      close();
      return;
    }

    // Handed to the status bar rather than held on screen: the publish runs to
    // tens of seconds and the bar carries all of it, the same way Save does in
    // the Edit profile modal.
    //
    // No `settle()` here. The queue is cleared when the publish *lands* — see the
    // effect below — because a failure has to leave the rows where they are so
    // the dialog can come back with the work intact.
    void publish(
      {
        name: current.name,
        tagline: current.tagline,
        description: current.description,
        banner: UNCHANGED,
        avatar: UNCHANGED,
      },
      history.stagePending()
    );

    setSheet(null);
    onOpenChange(false);
  };

  /**
   * A finished publish clears the queue, and a failed one reopens on it.
   *
   * Both outlive this dialog: `useEditProfile` is kept alive by the navbar so a
   * publish the user walked away from still lands, and the answer then has
   * nowhere else to go. The same pair the Edit profile modal keeps.
   */
  React.useEffect(() => {
    if (status !== 'published') return;
    reset();
    history.settle();
  }, [history, reset, status]);

  React.useEffect(() => {
    if (status !== 'error' || kind !== null) return;
    onOpenChange(true);
  }, [kind, onOpenChange, status]);

  const copy = kind ? COPY[kind] : COPY.employment;

  return (
    <Root open={kind !== null} onOpenChange={next => (next ? onOpenChange(true) : close())}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/20" />
        <Content // `px-4` so the card clears the screen edges on a phone, where
          // `max-w-[560px]` is wider than the viewport and the dialog would
          // otherwise run edge to edge.
          className="fixed inset-0 z-101 flex items-start justify-center overflow-y-auto px-4 focus:outline-hidden"
        >
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

                <footer className="flex items-center justify-between gap-3 border-t border-grey-02 px-5 py-4">
                  <p className="text-metadata text-grey-04">
                    {status === 'error' && errorMessage ? errorMessage : 'Saving publishes to your space.'}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" onClick={close} disabled={isSaving}>
                      Cancel
                    </Button>
                    {/* `canEdit` is false while the viewer's own space is still
                        resolving, and publishing then returns without doing
                        anything at all — a Save that reports nothing and writes
                        nothing is the worst of both. */}
                    <Button onClick={save} disabled={isSaving || !canEdit || !history.hasPendingChanges}>
                      Save
                    </Button>
                  </div>
                </footer>
              </>
            )}
          </div>
        </Content>
      </Portal>
    </Root>
  );
}
