/** Remembers debates/rematches this tab left, so the leaver does not see "Opponent left". */
const leftDebateIds = new Set<string>();
const leftRematchIds = new Set<string>();
export function markLocalDebateLeave(debateId: string) {
  leftDebateIds.add(debateId);
}

export function markLocalRematchLeave(sessionId: string) {
  leftRematchIds.add(sessionId);
}

export function unmarkLocalDebateLeave(debateId: string) {
  leftDebateIds.delete(debateId);
}

export function unmarkLocalRematchLeave(sessionId: string) {
  leftRematchIds.delete(sessionId);
}

export function didLocallyLeaveDebate(debateId: string) {
  return leftDebateIds.has(debateId);
}

export function didLocallyLeaveRematch(sessionId: string) {
  return leftRematchIds.has(sessionId);
}
