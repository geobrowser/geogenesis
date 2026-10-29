'use client';

import * as React from 'react';

import Textarea from 'react-textarea-autosize';

import { HubPillButton } from '~/core/debates/matchmaking/hub-pill-button';
import { renderMarkdownDocument } from '~/core/state/editor/markdown-render';

import { Text } from '~/design-system/text';

export const CALL_AGENDA_COPY = {
  title: 'Agenda',
  empty: 'No agenda yet.',
  edit: 'Edit agenda',
  add: 'Add agenda',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  placeholder: 'Topics, speakers and links. Markdown works.',
} as const;

/**
 * A call's agenda (GEO-3420): markdown anyone can read; hosts edit in place. A save's base is the
 * agenda the edit started from, or the newer one a conflict reported; a rejection keeps the draft.
 */
export function CallAgenda({
  markdown,
  updatedAt,
  note,
  canEdit,
  onSave,
  errorMessage,
  conflictBase,
}: {
  markdown: string;
  /** The stored agenda's stamp, `null` when there is none. */
  updatedAt: string | null;
  /** Under the agenda, e.g. that it is the series' default. */
  note?: string | null;
  canEdit: boolean;
  onSave: (markdown: string, base: string | null) => Promise<unknown>;
  errorMessage: (error: unknown) => string;
  /** A conflict's current stamp, `undefined` for any other failure. */
  conflictBase: (error: unknown) => string | null | undefined;
}) {
  const [editing, setEditing] = React.useState<{ draft: string; base: string | null } | null>(null);
  const draft = editing?.draft ?? null;
  const [saving, setSaving] = React.useState(false);
  const [failed, setFailed] = React.useState<string | null>(null);
  const hasAgenda = markdown.trim().length > 0;

  const save = async () => {
    if (editing === null) return;
    setSaving(true);
    setFailed(null);
    try {
      await onSave(editing.draft.trim(), editing.base);
      setEditing(null);
    } catch (error) {
      const base = conflictBase(error);
      if (base !== undefined) setEditing(current => (current ? { ...current, base } : current));
      setFailed(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label={CALL_AGENDA_COPY.title} className="flex flex-col gap-3" data-testid="call-agenda">
      <div className="flex items-center justify-between gap-2">
        <Text as="h2" variant="smallTitle">
          {CALL_AGENDA_COPY.title}
        </Text>
        {canEdit && draft === null ? (
          <HubPillButton
            analyticsLabel="Call agenda edit"
            onClick={() => setEditing({ draft: markdown, base: updatedAt })}
          >
            {hasAgenda ? CALL_AGENDA_COPY.edit : CALL_AGENDA_COPY.add}
          </HubPillButton>
        ) : null}
      </div>

      {draft !== null ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={event => setEditing(current => (current ? { ...current, draft: event.target.value } : current))}
            minRows={6}
            autoFocus
            aria-label={CALL_AGENDA_COPY.title}
            placeholder={CALL_AGENDA_COPY.placeholder}
            className="w-full resize-none rounded-lg border border-grey-02 p-3 text-metadata outline-none placeholder:text-grey-03"
          />
          {failed ? (
            <Text as="p" variant="footnote" color="red-01">
              {failed}
            </Text>
          ) : null}
          <div className="flex justify-end gap-2">
            <HubPillButton
              analyticsLabel="Call agenda cancel"
              disabled={saving}
              onClick={() => {
                setEditing(null);
                setFailed(null);
              }}
            >
              {CALL_AGENDA_COPY.cancel}
            </HubPillButton>
            <HubPillButton
              variant="primary"
              analyticsLabel="Call agenda save"
              pending={saving}
              pendingLabel={CALL_AGENDA_COPY.saving}
              onClick={save}
            >
              {CALL_AGENDA_COPY.save}
            </HubPillButton>
          </div>
        </div>
      ) : hasAgenda ? (
        <div className="flex flex-col gap-2">
          <div className="text-metadata text-text">{renderMarkdownDocument(markdown)}</div>
          {note ? (
            <Text as="p" variant="footnote" color="grey-04">
              {note}
            </Text>
          ) : null}
        </div>
      ) : (
        <Text as="p" variant="metadata" color="grey-04">
          {CALL_AGENDA_COPY.empty}
        </Text>
      )}
    </section>
  );
}
