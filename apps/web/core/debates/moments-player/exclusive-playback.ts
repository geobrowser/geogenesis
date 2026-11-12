'use client';

import * as React from 'react';

/**
 * One player at a time (GEO-3687): when a moments player starts, every other one in its group
 * pauses. The ranking compare view puts two debates side by side, and two soundtracks at once is
 * noise, not a comparison.
 *
 * Module-level rather than a context, so two players anywhere on a page coordinate without a
 * provider. `group` keeps unrelated sets apart when a page wants that; most pages use the default.
 */
type Member = { pause: () => void };

const groups = new Map<string, Set<Member>>();

export const DEFAULT_PLAYBACK_GROUP = 'debate-moments';

function membersOf(group: string): Set<Member> {
  let members = groups.get(group);
  if (!members) {
    members = new Set();
    groups.set(group, members);
  }
  return members;
}

/** Joins `group`; returns the leave function. */
export function joinPlaybackGroup(group: string, member: Member): () => void {
  const members = membersOf(group);
  members.add(member);
  return () => {
    members.delete(member);
    if (members.size === 0) groups.delete(group);
  };
}

/** `member` started playing: pause everyone else in its group. */
export function claimPlayback(group: string, member: Member): void {
  for (const other of [...(groups.get(group) ?? [])]) {
    if (other !== member) other.pause();
  }
}

/**
 * The hook form: `pause` is called when another player in the group starts; call the returned
 * `claim` whenever this one starts (on the media element's `play` event, so a start from any
 * control counts).
 */
export function useExclusivePlayback(pause: () => void, group: string = DEFAULT_PLAYBACK_GROUP): () => void {
  const pauseRef = React.useRef(pause);
  React.useEffect(() => {
    pauseRef.current = pause;
  }, [pause]);
  const member = React.useMemo<Member>(() => ({ pause: () => pauseRef.current() }), []);
  React.useEffect(() => joinPlaybackGroup(group, member), [group, member]);
  return React.useCallback(() => claimPlayback(group, member), [group, member]);
}
