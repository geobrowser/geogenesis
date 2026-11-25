import pluralize from 'pluralize';

/**
 * Everything the save-votes flow says about how many votes are waiting (GEO-3214), in one place so
 * the navbar, the sheet and the toasts count them the same way.
 */
const votes = (count: number) => `${count} ${pluralize('vote', count)}`;

/** The navbar's Log in pill while votes are waiting. */
export const saveVotesNavLabel = (count: number) => `Save ${votes(count)}`;

/**
 * The save-votes sheet's heading and line under it, word for word as approved (GEO-3846), for every
 * ask about saving votes: one vote or several, a return visit, or a visitor from one of our emails
 * who already has an account. It says the vote didn't count rather than offering to save it, because
 * the sheet can no longer be closed.
 */
export const SAVE_VOTES_HEADING = 'Your vote didn’t count';
export const SAVE_VOTES_SUBTEXT = 'Add your email to save your vote';

/** Under the email step's button: what happens next, and that there is no password to make. */
export const SAVE_VOTES_FINE_PRINT = 'We’ll email you a 6-digit code. No password.';

/** The email step's button once the visitor has come back from the code step to change the address. */
export const SAVE_VOTES_RESEND_LABEL = 'Send code';

/**
 * `logIn` is for a visitor who came from one of our emails (GEO-3374): they have an account already,
 * so the button logs them in to it rather than making one.
 */
export const saveVotesSubmitLabel = (count: number, logIn = false) =>
  logIn ? 'Log in' : count === 1 ? 'Save vote' : 'Save votes';

export const savingVotesCopy = (count: number) => (count === 1 ? 'Saving your vote…' : `Saving ${votes(count)}…`);

export const savedVotesCopy = (count: number) => (count === 1 ? 'Vote saved' : `${votes(count)} saved`);
