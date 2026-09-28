import type { Debate, DebateRematchSession } from './api';

/** A debate room always lives under the space its claim came from. */
export function debatePath(debate: Pick<Debate, 'id' | 'claim'>) {
  return `/space/${debate.claim.space_id}/debates/${debate.id}`;
}

/** A debate-again picker lives under the space that created its session. */
export function debateRematchPath(session: Pick<DebateRematchSession, 'id' | 'source_space_id'>) {
  return `/space/${session.source_space_id}/debates/rematches/${session.id}`;
}
