'use client';

import * as React from 'react';

import type { EntityChoice } from '~/core/profile/stage-history';
import type { SearchResult } from '~/core/types';

import { Button, SmallButton, SquareButton } from '~/design-system/button';
import { CheckCloseSmall } from '~/design-system/icons/check-close-small';
import { CloseSmall } from '~/design-system/icons/close-small';
import { inputStyles } from '~/design-system/input';
import { SelectEntity } from '~/design-system/select-entity';
import { TextButton } from '~/design-system/text-button';

type Props = {
  title: string;
  isSaving: boolean;
  canSave: boolean;
  onCancel: () => void;
  onSave: () => void;
  children: React.ReactNode;
};

/**
 * The chrome shared by the two sheets: a back title, the fields, and a footer
 * that says what Done actually does.
 *
 * Nothing here publishes. It used to, and the footer still said so long after
 * the sheets were changed to hand their draft back to the modal — so the note
 * now describes the thing that happens, and the button says Done rather than
 * naming a save that is not one.
 *
 * Rendered in place of the modal's own body rather than over it — one thing on
 * screen at a time, and the fields underneath have nothing to do with the
 * position being added.
 */
export function HistorySheet({ title, isSaving, canSave, onCancel, onSave, children }: Props) {
  return (
    <div className="flex flex-col">
      <header className="flex items-center gap-2 px-5 py-4">
        <SquareButton onClick={onCancel} disabled={isSaving} icon={<CheckCloseSmall />} aria-label="Back" />
        <h2 className="text-smallTitle text-text">{title}</h2>
      </header>

      <div className="flex flex-col gap-4 px-5">{children}</div>

      <footer className="mt-5 flex items-center justify-between gap-3 border-t border-grey-02 px-5 py-4">
        <p className="text-metadata text-grey-04">Added to your profile when you save it.</p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={!canSave}>
            Done
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
 *
 * Both pickers pass `deferCreate` alongside it, which is what makes that true.
 * Creating otherwise names the entity in the store there and then — so closing
 * the sheet, or the modal, left the name behind on an entity nothing pointed at,
 * and a later failed publish would snapshot and restore that stray write. The
 * name this sheet does want is written by `newEntityRows` when the modal saves.
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
          <div className="shrink-0">
            <TextButton type="button" onClick={onClear}>
              Change
            </TextButton>
          </div>
        )}
      </div>
      {note && <span className="text-metadata text-grey-04">{note}</span>}
    </div>
  );
}

/**
 * A label above a control. The pickers below are buttons rather than form
 * controls, so this is a `div` and the label is a `span` — wrapping a button in
 * a `<label>` names nothing.
 *
 * Which leaves the label unattached, so `children` is given the span's id to
 * point at. A search box that does not take it is announced by its placeholder
 * instead: "Example: Microsoft" where the field is called "Company".
 */
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode | ((labelId: string) => React.ReactNode);
}) {
  const labelId = React.useId();

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-metadataMedium text-grey-04">
        {label}
      </span>
      {typeof children === 'function' ? children(labelId) : children}
    </div>
  );
}

/** The same, for a native control that a `<label>` can actually name. */
export function LabelledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-metadataMedium text-grey-04">{label}</span>
      {children}
    </label>
  );
}

/**
 * One entity, picked or created.
 *
 * `locked` is the promotion case: the company is already answered and stays
 * visible so the row reads as attaching to it, rather than disappearing and
 * leaving the reader to wonder where it went.
 */
export function EntityField({
  label,
  value,
  locked,
  onChange,
  onClear,
  spaceId,
  relationValueTypes,
  placeholder,
  alsoSearchSpaceIds,
  autoFocus,
  ...picker
}: {
  label: string;
  value: EntityChoice | null;
  locked?: { name: string | null; note: string };
  onChange: (choice: EntityChoice) => void;
  onClear: () => void;
  spaceId: string;
  relationValueTypes?: { id: string; name: string | null }[];
  placeholder: string;
  alsoSearchSpaceIds?: string[];
  autoFocus?: boolean;
  pinnedResults?: SearchResult[];
  pinnedLabel?: string;
  restLabel?: string;
}) {
  return (
    <Field label={label}>
      {labelId =>
        locked ? (
          <PickedEntity name={locked.name} note={locked.note} />
        ) : value ? (
          <PickedEntity name={value.name} onClear={onClear} />
        ) : (
          <SelectEntity
            spaceId={spaceId}
            relationValueTypes={relationValueTypes}
            placeholder={placeholder}
            alsoSearchSpaceIds={alsoSearchSpaceIds}
            autoFocus={autoFocus}
            inputLabelledBy={labelId}
            onCreateEntity={findOrCreate}
            deferCreate
            onDone={(result, fromCreateFn) =>
              onChange({ id: result.id, name: result.name, isNew: Boolean(fromCreateFn) })
            }
            width="full"
            {...picker}
          />
        )
      }
    </Field>
  );
}

/** A fixed set of options, as a native select — see the note at each caller. */
export function OptionField<T extends { id: string; name: string }>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: { id: string } | null;
  options: readonly T[];
  onChange: (option: T | null) => void;
  disabled?: boolean;
}) {
  return (
    <LabelledField label={label}>
      <select
        value={value?.id ?? ''}
        disabled={disabled}
        onChange={event => onChange(options.find(option => option.id === event.currentTarget.value) ?? null)}
        className={inputStyles()}
      >
        <option value="">Please select</option>
        {options.map(option => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </LabelledField>
  );
}

/** There is no design-system textarea; `inputStyles` exists so one can borrow the chrome. */
export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <LabelledField label={label}>
      <textarea
        value={value}
        onChange={event => onChange(event.currentTarget.value)}
        disabled={disabled}
        rows={3}
        placeholder={placeholder}
        className={`${inputStyles()} resize-none`}
      />
    </LabelledField>
  );
}

/**
 * A repeating entity picker: chips for what is chosen, a search that adds one,
 * and a link back to that search once the list is not empty.
 *
 * Skills and Fields of study are the same control with different words — both
 * repeat, both create what they cannot find. `extra` is where the position sheet
 * hangs its recommendations.
 */
export function MultiEntityField({
  label,
  noun,
  addLabel,
  items,
  onChange,
  spaceId,
  relationValueTypes,
  placeholder,
  disabled,
  alsoSearchSpaceIds,
  pinnedResults,
  pinnedLabel,
  restLabel,
  extra,
}: {
  label: string;
  /** Used in the remove button's name, so it says what is being removed. */
  noun: string;
  addLabel: string;
  items: EntityChoice[];
  onChange: (next: EntityChoice[]) => void;
  spaceId: string;
  relationValueTypes: { id: string; name: string | null }[];
  placeholder: string;
  disabled?: boolean;
  alsoSearchSpaceIds?: string[];
  pinnedResults?: SearchResult[];
  pinnedLabel?: string;
  restLabel?: string;
  extra?: React.ReactNode;
}) {
  const [isAdding, setIsAdding] = React.useState(false);

  const add = (item: EntityChoice) => {
    if (!items.some(picked => picked.id === item.id)) onChange([...items, item]);
    setIsAdding(false);
  };

  return (
    <Field label={label}>
      {labelId => (
        <>
          {items.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {items.map(item => (
                <li key={item.id}>
                  <SmallButton
                    onClick={() => onChange(items.filter(other => other.id !== item.id))}
                    disabled={disabled}
                    aria-label={`Remove ${noun} ${item.name ?? noun}`}
                  >
                    <span>{item.name ?? 'Untitled'}</span>
                    {item.isNew && <span className="text-ctaPrimary">NEW</span>}
                    <CloseSmall />
                  </SmallButton>
                </li>
              ))}
            </ul>
          )}

          {isAdding || items.length === 0 ? (
            <SelectEntity
              spaceId={spaceId}
              relationValueTypes={relationValueTypes}
              placeholder={placeholder}
              alsoSearchSpaceIds={alsoSearchSpaceIds}
              autoFocus={isAdding}
              inputLabelledBy={labelId}
              pinnedResults={pinnedResults}
              pinnedLabel={pinnedLabel}
              restLabel={restLabel}
              onCreateEntity={findOrCreate}
              deferCreate
              onDone={(result, fromCreateFn) => add({ id: result.id, name: result.name, isNew: Boolean(fromCreateFn) })}
              width="full"
            />
          ) : (
            <div className="self-start">
              <TextButton type="button" color="ctaPrimary" onClick={() => setIsAdding(true)} disabled={disabled}>
                {addLabel}
              </TextButton>
            </div>
          )}

          {extra}
        </>
      )}
    </Field>
  );
}
