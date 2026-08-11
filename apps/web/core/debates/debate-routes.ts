import type { Debate } from './api';

/** A debate room always lives under the space its claim came from. */
export function debatePath(debate: Pick<Debate, 'id' | 'claim'>) {
  return `/space/${debate.claim.space_id}/debates/${debate.id}`;
}
