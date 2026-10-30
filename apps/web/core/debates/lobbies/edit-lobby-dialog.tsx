'use client';

import * as React from 'react';

import { useToast } from '~/core/hooks/use-toast';

import { DIALOG_ACTION_BUTTON_CLASS_NAME, DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME } from '~/design-system/button';
import { Input } from '~/design-system/input';
import { Text } from '~/design-system/text';

import { type DebateLobbyView, GeoChatRequestError, type UpdateDebateLobbyRequest } from '../api';
import { HubPillButton } from '../matchmaking/hub-pill-button';
import { useUpdateDebateLobby } from './hooks';
import { lobbyErrorMessage } from './lobby-format';
import { OpenLobbyClaimListsField, type PickedClaimList, claimListsRequestBody } from './open-lobby-claim-lists';
import {
  LobbyDialogFrame,
  LobbyStartFields,
  checkLobbyName,
  checkLobbyStart,
  toDateTimeLocalValue,
  useLobbyStartInput,
} from './open-lobby-dialog';

/** What the dialog reads from the lobby; the lobby page and the side panel both hold it. */
export type EditableLobby = Pick<
  DebateLobbyView,
  'lobby_id' | 'name' | 'purpose' | 'starts_at' | 'scheduled' | 'access' | 'reminder_count' | 'claim_lists'
> & { viewer: Pick<DebateLobbyView['viewer'], 'role' | 'hosting'> };

export const EDIT_LOBBY_COPY = {
  open: 'Edit lobby',
  title: 'Edit lobby',
  save: 'Save changes',
  saving: 'Saving…',
  saved: 'Lobby updated',
  opensEarly: 'Opens 10 minutes early.',
  /** Shown once the start is changed, while someone is going. */
  willEmail: (count: number) =>
    `We'll email the ${count === 1 ? 'person' : `${count} people`} going about the new time.`,
  failed: 'Could not save the lobby. Try again.',
  openedMeanwhile: 'This lobby has opened, so its start can’t change now.',
};

/** Why a save failed, in this dialog's words where the shared ones read as joining. */
function editErrorMessage(error: unknown) {
  if (error instanceof GeoChatRequestError && error.code === 'lobby_already_open')
    return EDIT_LOBBY_COPY.openedMeanwhile;
  return lobbyErrorMessage(error, EDIT_LOBBY_COPY.failed);
}

/**
 * Whether the viewer may edit the lobby (GEO-3540): any host, present or not, or the acting host,
 * until it closes. A space's call is edited through its series instead.
 */
export function canEditLobby(lobby: EditableLobby) {
  if (lobby.purpose === 'call') return false;
  if (lobby.access.status === 'closed' || lobby.access.status === 'banned') return false;
  return lobby.viewer.role === 'host' || lobby.viewer.hosting;
}

/** The start can move only while the lobby is scheduled and its door has not opened. */
export function canMoveLobby(lobby: Pick<EditableLobby, 'scheduled' | 'access'>) {
  return lobby.scheduled && lobby.access.status === 'not_yet_open';
}

function sameLists(a: readonly Pick<PickedClaimList, 'entityId' | 'spaceId'>[], b: typeof a) {
  return (
    a.length === b.length &&
    a.every((list, index) => list.entityId === b[index].entityId && list.spaceId === b[index].spaceId)
  );
}

/**
 * The PATCH body for the form: only what changed, or why it cannot be sent. `startsAtLocal` is
 * `null` when the start cannot move. An empty body means nothing changed.
 */
export function lobbyEditRequestFor(
  lobby: Pick<EditableLobby, 'name' | 'starts_at'>,
  initialLists: readonly Pick<PickedClaimList, 'entityId' | 'spaceId'>[],
  edits: {
    name: string;
    startsAtLocal: string | null;
    claimLists: readonly Pick<PickedClaimList, 'entityId' | 'spaceId'>[];
  },
  now: number = Date.now()
): { body: UpdateDebateLobbyRequest } | { error: string } {
  const body: UpdateDebateLobbyRequest = {};
  const name = checkLobbyName(edits.name);
  if ('error' in name) return name;
  if (name.value !== lobby.name) body.name = name.value;

  if (edits.startsAtLocal !== null && edits.startsAtLocal !== toDateTimeLocalValue(new Date(lobby.starts_at))) {
    const start = checkLobbyStart(edits.startsAtLocal, now);
    if ('error' in start) return start;
    body.starts_at = start.value;
  }

  if (!sameLists(edits.claimLists, initialLists)) body.claim_lists = claimListsRequestBody(edits.claimLists);
  return { body };
}

/** "Edit lobby" and the dialog it opens, for a host (GEO-3540). Nothing for anyone else. */
export function EditLobbyButton({ lobby, label = EDIT_LOBBY_COPY.open }: { lobby: EditableLobby; label?: string }) {
  const [open, setOpen] = React.useState(false);
  if (!canEditLobby(lobby)) return null;
  return (
    <>
      <HubPillButton analyticsLabel="Lobby edit" onClick={() => setOpen(true)}>
        {label}
      </HubPillButton>
      {open ? <EditLobbyDialog lobby={lobby} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * The Open a debate lobby form, for a lobby that exists: its name, its start while it can still
 * move, and its claim lists. Saving a new start emails everyone going (geo-chat resends their
 * calendar invite).
 */
export function EditLobbyDialog({ lobby, onClose }: { lobby: EditableLobby; onClose: () => void }) {
  const titleId = React.useId();
  const update = useUpdateDebateLobby(lobby.lobby_id);
  const [, setToast] = useToast();
  const movable = canMoveLobby(lobby);
  const [initialStart] = React.useState(() => toDateTimeLocalValue(new Date(lobby.starts_at)));
  const [initialLists] = React.useState<PickedClaimList[]>(() =>
    // Names are read from the graph by each chip.
    (lobby.claim_lists ?? []).map(list => ({ entityId: list.entity_id, spaceId: list.space_id, name: '' }))
  );
  const [name, setName] = React.useState(lobby.name);
  const start = useLobbyStartInput(initialStart);
  const [claimLists, setClaimLists] = React.useState<PickedClaimList[]>(initialLists);
  const [formError, setFormError] = React.useState<string | null>(null);

  const startsAtLocal = movable ? start.startsAtLocal : null;
  const moving = movable && startsAtLocal !== initialStart;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const request = lobbyEditRequestFor(lobby, initialLists, { name, startsAtLocal, claimLists });
    if ('error' in request) {
      setFormError(request.error);
      return;
    }
    setFormError(null);
    if (Object.keys(request.body).length === 0) {
      onClose();
      return;
    }
    update.mutate(request.body, {
      onSuccess: () => {
        setToast(<span>{EDIT_LOBBY_COPY.saved}</span>);
        onClose();
      },
    });
  };

  return (
    <LobbyDialogFrame titleId={titleId} onClose={onClose}>
      <h2 id={titleId}>
        <Text as="span" variant="smallTitle">
          {EDIT_LOBBY_COPY.title}
        </Text>
      </h2>
      <form className="grid gap-4" onSubmit={submit}>
        <label className="grid gap-1.5">
          <Text as="span" variant="footnoteMedium">
            Name
          </Text>
          <Input value={name} onChange={event => setName(event.target.value)} autoFocus />
        </label>

        {movable ? (
          <LobbyStartFields
            start={start}
            note={
              <>
                {EDIT_LOBBY_COPY.opensEarly}
                {moving && lobby.reminder_count > 0 ? ` ${EDIT_LOBBY_COPY.willEmail(lobby.reminder_count)}` : null}
              </>
            }
          />
        ) : null}

        <OpenLobbyClaimListsField value={claimLists} onChange={setClaimLists} />

        {formError || update.error ? (
          <Text as="p" variant="footnote" color="red-01">
            {formError ?? editErrorMessage(update.error)}
          </Text>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className={DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME}>
            Cancel
          </button>
          <button type="submit" disabled={update.isPending} className={DIALOG_ACTION_BUTTON_CLASS_NAME}>
            {update.isPending ? EDIT_LOBBY_COPY.saving : EDIT_LOBBY_COPY.save}
          </button>
        </div>
      </form>
    </LobbyDialogFrame>
  );
}
