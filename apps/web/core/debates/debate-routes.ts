import type { Debate, DebateRematchSession } from './api';

/** A debate room always lives under the space its claim came from. */
export function debatePath(debate: Pick<Debate, 'id' | 'claim'>) {
  return `/space/${debate.claim.space_id}/debates/${debate.id}`;
}

/** The moments editor for a debate (GEO-3671), media admins only. */
export function momentsEditorPath(debate: Pick<Debate, 'id' | 'claim'>) {
  return `${debatePath(debate)}/moments`;
}

/** The editor in a tab of its own, from the Best debates popup (GEO-3742): its Done closes the tab. */
export const MOMENTS_EDITOR_CLOSEABLE_PARAM = 'close';

export function momentsEditorTabPath(spaceId: string, debateId: string) {
  return `/space/${spaceId}/debates/${debateId}/moments?${MOMENTS_EDITOR_CLOSEABLE_PARAM}=1`;
}

/** A debate-again picker lives under the space that created its session. */
export function debateRematchPath(session: Pick<DebateRematchSession, 'id' | 'source_space_id'>) {
  return `/space/${session.source_space_id}/debates/rematches/${session.id}`;
}
