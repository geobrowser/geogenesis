'use client';

import * as React from 'react';

import cx from 'classnames';

import { Text } from '~/design-system/text';

import type { DebateLobbyMember, DebateLobbyMemberAction, DebateLobbyView } from '../api';
import { debateActionAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { HubPillButton } from '../matchmaking/hub-pill-button';
import {
  MEMBER_ACTION_LABEL,
  type MemberActionTarget,
  memberActions,
  moderationErrorMessage,
  personName,
} from './lobby-format';
import { useIsCallRoom } from './lobby-purpose';
import { useModerateLobbyMember } from './moderation-hooks';

/** Step down rather than "Remove as host" on yourself. */
const STEP_DOWN_LABEL = 'Step down as host';
/** A call's editor who stepped down, on themselves (GEO-3419). */
const HOST_AGAIN_LABEL = 'Take hosting back';

/** Whether a host could act on `member` at all; the menu trigger hides otherwise. */
export function hasMemberActions(lobby: Pick<DebateLobbyView, 'viewer'>, member: MemberActionTarget, isSelf: boolean) {
  return memberActions(lobby.viewer, member, isSelf).length > 0;
}

/**
 * The host actions on one person, as a list of rows, in the person menu. Renders nothing for
 * someone the viewer may not act on.
 */
export function LobbyMemberActions({
  lobby,
  member,
  isSelf,
  micOn,
  onDone,
}: {
  lobby: Pick<DebateLobbyView, 'lobby_id' | 'viewer'>;
  member: DebateLobbyMember;
  isSelf: boolean;
  /** From voice, when known; Mute hides for a mic that is off. */
  micOn?: boolean;
  /** After an action succeeds, e.g. to close the menu. */
  onDone?: () => void;
}) {
  const moderate = useModerateLobbyMember(lobby.lobby_id);
  const call = useIsCallRoom();
  const [confirmingBan, setConfirmingBan] = React.useState(false);
  const actions = memberActions(lobby.viewer, member, isSelf).filter(action => action !== 'mute' || micOn !== false);
  if (actions.length === 0) return null;

  const run = (action: DebateLobbyMemberAction) =>
    moderate.mutate(
      { userId: member.user_id, action },
      {
        onSuccess: () => {
          setConfirmingBan(false);
          onDone?.();
        },
      }
    );
  const name = personName(member);

  return (
    <div className="flex flex-col" data-testid="lobby-member-actions">
      <Text as="p" variant="footnote" color="grey-04" className="px-3 pt-2 pb-1">
        Host controls
      </Text>
      {confirmingBan ? (
        <div className="flex flex-col gap-2 px-3 py-2">
          <Text as="p" variant="metadata">
            Ban {name}? They can’t rejoin this {call ? 'call' : 'lobby'} until a host unbans them.
          </Text>
          <div className="flex flex-wrap gap-2">
            <HubPillButton
              variant="primary"
              analyticsLabel="Lobby ban confirm"
              pending={moderate.isPending}
              pendingLabel="Banning…"
              onClick={() => run('ban')}
            >
              Ban
            </HubPillButton>
            <HubPillButton
              analyticsLabel="Lobby ban cancel"
              onClick={() => {
                setConfirmingBan(false);
                moderate.reset();
              }}
            >
              Cancel
            </HubPillButton>
          </div>
        </div>
      ) : (
        actions.map(action => (
          <button
            key={action}
            type="button"
            disabled={moderate.isPending}
            {...debateActionAnalyticsAttributes('hub', `Lobby ${MEMBER_ACTION_LABEL[action]}`, 'moderate_lobby_member')}
            onClick={() => (action === 'ban' ? setConfirmingBan(true) : run(action))}
            className={cx(
              'flex w-full items-center bg-white px-3 py-2.5 text-left text-button hover:bg-bg disabled:opacity-50',
              action === 'ban' || action === 'remove' ? 'text-red-01' : 'text-text'
            )}
          >
            {isSelf && action === 'remove-host'
              ? STEP_DOWN_LABEL
              : isSelf && action === 'promote'
                ? HOST_AGAIN_LABEL
                : call && action === 'remove'
                  ? 'Remove from call'
                  : call && action === 'ban'
                    ? 'Ban from call'
                    : MEMBER_ACTION_LABEL[action]}
          </button>
        ))
      )}
      {moderate.isError ? (
        <Text as="p" variant="footnote" color="red-01" className="px-3 pb-2">
          {moderationErrorMessage(moderate.error, undefined, call ? 'call' : 'lobby')}
        </Text>
      ) : null}
    </div>
  );
}
