import type { DebateParticipantSummary, DebatePerson } from '../api';

/**
 * Someone known only by their summary, drawn as offline: nobody can be asked live from here. How the
 * People tab draws a schedulable person and how admin New match draws everyone (GEO-2942).
 */
export function offlinePerson(summary: DebateParticipantSummary): DebatePerson {
  return {
    ...summary,
    online: false,
    available_to_debate: false,
    in_debate: false,
    online_since: null,
    can_challenge: false,
  };
}
