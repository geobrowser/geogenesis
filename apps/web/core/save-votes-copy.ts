import pluralize from 'pluralize';

/**
 * Everything the save-votes flow says about how many votes are waiting (GEO-3214), in one place so
 * the navbar, the sheet and the toasts count them the same way.
 */
const votes = (count: number) => `${count} ${pluralize('vote', count)}`;

/** The navbar's Log in pill while votes are waiting. */
export const saveVotesNavLabel = (count: number) => `Save ${votes(count)}`;

export function saveVotesHeading(count: number, returnVisit: boolean) {
  if (returnVisit) return `You have ${count} unsaved ${pluralize('vote', count)}`;
  return count === 1 ? 'Save your vote' : `Save your ${votes(count)}`;
}

export function saveVotesSubtext(count: number, returnVisit: boolean) {
  const [subject, verb] = count === 1 ? ['It’s', 'it counts'] : ['They’re', 'they count'];
  return returnVisit
    ? `${subject} still on this device. Add your email and ${verb} toward the result.`
    : `${subject} only on this device for now. Add your email and ${verb} toward the result.`;
}

export const saveVotesSubmitLabel = (count: number) => (count === 1 ? 'Save vote' : 'Save votes');

export const savingVotesCopy = (count: number) => (count === 1 ? 'Saving your vote…' : `Saving ${votes(count)}…`);

export const savedVotesCopy = (count: number) => (count === 1 ? 'Vote saved' : `${votes(count)} saved`);
