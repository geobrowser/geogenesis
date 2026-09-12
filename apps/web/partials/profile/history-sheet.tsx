'use client';

import * as React from 'react';

import { Button, SquareButton } from '~/design-system/button';
import { CheckCloseSmall } from '~/design-system/icons/check-close-small';

type Props = {
  title: string;
  saveLabel: string;
  isSaving: boolean;
  canSave: boolean;
  onCancel: () => void;
  onSave: () => void;
  children: React.ReactNode;
};

/**
 * The chrome shared by the two sheets: a back title, the fields, and a footer
 * that says where the save lands before it is clicked.
 *
 * Rendered in place of the modal's own body rather than over it — one thing on
 * screen at a time, and the fields underneath have nothing to do with the
 * position being added.
 */
export function HistorySheet({ title, saveLabel, isSaving, canSave, onCancel, onSave, children }: Props) {
  return (
    <div className="flex flex-col">
      <header className="flex items-center gap-2 px-5 py-4">
        <SquareButton onClick={onCancel} disabled={isSaving} icon={<CheckCloseSmall />} aria-label="Back" />
        <h2 className="text-smallTitle text-text">{title}</h2>
      </header>

      <div className="flex flex-col gap-4 px-5">{children}</div>

      <footer className="mt-5 flex items-center justify-between gap-3 border-t border-grey-02 px-5 py-4">
        <p className="text-footnote text-grey-04">
          {isSaving
            ? 'Publishing to your space. This usually takes about 10 seconds.'
            : 'Saving publishes to your space.'}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={!canSave}>
            {isSaving ? 'Saving' : saveLabel}
          </Button>
        </div>
      </footer>
    </div>
  );
}

/**
 * Turns a `SelectEntity` search box into the find-or-create the rest of the app
 * uses.
 *
 * Its "Create new" footer only renders when an `onCreateEntity` is supplied —
 * the prop is there so a caller can decorate the new entity, but its presence is
 * also what offers the option at all. Without it these pickers could only find a
 * company that somebody else had already entered.
 *
 * Nothing to decorate here: the sheet types and names what it creates when the
 * modal saves, so this only has to exist. Returning nothing keeps the id
 * `SelectEntity` minted, which is the one it hands back to `onDone`.
 */
export function findOrCreate() {
  return undefined;
}

/**
 * What a picker shows once it has an answer. `SelectEntity` is a search box, so
 * without this the chosen company disappears back into a placeholder the moment
 * focus leaves it.
 */
export function PickedEntity({ name, note, onClear }: { name: string | null; note?: string; onClear?: () => void }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 rounded border border-grey-02 px-[10px] py-[9px]">
        <span className="truncate text-input text-text">{name ?? 'Untitled'}</span>
        {onClear && (
          <button type="button" onClick={onClear} className="shrink-0 text-footnote text-grey-04 hover:underline">
            Change
          </button>
        )}
      </div>
      {note && <span className="text-footnote text-grey-04">{note}</span>}
    </div>
  );
}
