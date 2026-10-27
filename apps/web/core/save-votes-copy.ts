import pluralize from 'pluralize';

/**
 * Everything the save-votes flow says about how many votes are waiting (GEO-3214), in one place so
 * the navbar, the sheet and the toasts count them the same way.
 */
const votes = (count: number) => `${count} ${pluralize('vote', count)}`;

/** The navbar's Log in pill while votes are waiting. */
export const saveVotesNavLabel = (count: number) => `Save ${votes(count)}`;

/**
 * `logIn` is for a visitor who came from one of our emails (GEO-3374): they have an account already,
 * so the sheet asks them to log in to it rather than to make one.
 */
export function saveVotesHeading(count: number, returnVisit: boolean, logIn = false) {
  if (logIn) return count === 1 ? 'Log in to save your vote' : `Log in to save your ${votes(count)}`;
  if (returnVisit) return `You have ${count} unsaved ${pluralize('vote', count)}`;
  return count === 1 ? 'Save your vote' : `Save your ${votes(count)}`;
}

/**
 * One line whichever ask it is (GEO-3439): the heading already says whether the votes are new or
 * waiting from an earlier visit, and the chips under it show which they are.
 */
export function saveVotesSubtext(count: number, logIn = false) {
  const them = count === 1 ? 'it' : 'them';
  return logIn ? `Log in to make ${them} count.` : `Add your email to make ${them} count.`;
}

/** Under the email step's button: what happens next, and that there is no password to make. */
export const SAVE_VOTES_FINE_PRINT = 'We’ll email you a 6-digit code. No password.';

/** The email step's button once the visitor has come back from the code step to change the address. */
export const SAVE_VOTES_RESEND_LABEL = 'Send code';

export const saveVotesSubmitLabel = (count: number, logIn = false) =>
  logIn ? 'Log in' : count === 1 ? 'Save vote' : 'Save votes';

export const savingVotesCopy = (count: number) => (count === 1 ? 'Saving your vote…' : `Saving ${votes(count)}…`);

export const savedVotesCopy = (count: number) => (count === 1 ? 'Vote saved' : `${votes(count)} saved`);
