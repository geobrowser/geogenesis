/**
 * The six email groups a person can switch off one by one (GEO-3392), and their copy.
 *
 * The ids are geo-notifications' (`src/delivery/email-groups.ts`, GEO-3372), which maps every email
 * kind to exactly one of them. The names and descriptions are the approved mockup's, word for word,
 * except the digest's day: Tuesday mornings since 27 Oct 2026 (GEO-3500), not Sunday evenings, as
 * geo-notifications' own unsubscribe page says. The desktop dialog has a description per group, the
 * phone one a shorter one.
 */
export const EMAIL_GROUPS = [
  'invites',
  'community_calls',
  'your_debates',
  'replies',
  'digest',
  'getting_started',
] as const;
export type EmailGroup = (typeof EMAIL_GROUPS)[number];

export type EmailGroupSettings = Record<EmailGroup, boolean>;

export const EMAIL_GROUP_COPY: Record<EmailGroup, { name: string; description: string; shortDescription: string }> = {
  invites: {
    name: 'Debate invites and reminders',
    description: 'Bookings, changes, cancellations and reminders before a debate.',
    shortDescription: 'Bookings, changes and reminders.',
  },
  community_calls: {
    name: 'Community call reminders',
    description: 'An email before a community call you asked to be reminded about.',
    shortDescription: 'Before calls you asked about',
  },
  your_debates: {
    name: 'Your debates',
    description: 'When a debate you were in is ready, and when one takes off.',
    shortDescription: 'Ready to watch, and when one takes off.',
  },
  replies: {
    name: 'Replies',
    description: 'When someone replies to your comment.',
    shortDescription: 'When someone replies to your comment.',
  },
  digest: {
    name: 'Weekly digest',
    description: 'Debates and claims for you, Tuesday mornings.',
    shortDescription: 'Debates and claims for you, Tuesdays.',
  },
  getting_started: {
    name: 'Getting started',
    description: 'A few emails while you are new, never more than one a day.',
    shortDescription: 'A few emails while you are new.',
  },
};

/** A switch or an unsubscribe press that didn't save, in the settings dialog and on the unsubscribe page. */
export const SAVE_FAILED = "Couldn't save. Try again.";

/** Shown under "Debate invites and reminders" while it is off: it is the one group people rely on. */
export const INVITES_OFF_WARNING =
  "People who book a time with you won't reach you by email. Their invites will only show up in Geo.";

/**
 * What the account menu row says: "5 of 5 on", "Off" when every email is off, or a bare "On" / "Off"
 * while geo-notifications does not report groups yet (before GEO-3372 ships it only knows the all-email
 * switch).
 */
export function emailSettingsSummary(emailEnabled: boolean, groups: EmailGroupSettings | null | undefined): string {
  if (!emailEnabled) return 'Off';
  if (!groups) return 'On';
  const on = EMAIL_GROUPS.filter(group => groups[group]).length;
  return `${on} of ${EMAIL_GROUPS.length} on`;
}

/**
 * The unsubscribe page's copy per group, the same as geo-notifications' own confirm page
 * (`UNSUBSCRIBE_COPY` in `src/delivery/unsubscribe-page.ts`, GEO-3372), so a link reads the same
 * whichever page serves it. The weekly digest's is the approved mockup's, word for word. `{email}` is
 * the masked address.
 */
type UnsubscribeCopy = {
  askTitle: string;
  askBody: string;
  doneTitle: string;
  doneBody: string;
  undoneTitle: string;
  undoneBody: string;
};

export const UNSUBSCRIBE_COPY: Record<EmailGroup, UnsubscribeCopy> = {
  digest: {
    askTitle: 'Unsubscribe from the weekly digest?',
    askBody:
      '{email} will stop getting the Tuesday digest. Debate invites, reminders and replies to your comments keep coming.',
    doneTitle: "You're unsubscribed from the weekly digest",
    doneBody: "{email} won't get it anymore. You'll still get debate invites, reminders and replies to your comments.",
    undoneTitle: 'The weekly digest is back on',
    undoneBody: 'Your next one arrives Tuesday morning.',
  },
  getting_started: {
    askTitle: 'Unsubscribe from getting started emails?',
    askBody:
      "{email} will stop getting the emails we send while you're new. Debate invites, reminders and replies to your comments keep coming.",
    doneTitle: "You're unsubscribed from getting started emails",
    doneBody:
      "{email} won't get them anymore. You'll still get debate invites, reminders and replies to your comments.",
    undoneTitle: 'Getting started emails are back on',
    undoneBody: "We'll send the next one when there's something new to try.",
  },
  replies: {
    askTitle: 'Unsubscribe from replies?',
    askBody:
      '{email} will stop getting an email when someone replies to your comment. Debate invites and reminders keep coming.',
    doneTitle: "You're unsubscribed from replies",
    doneBody: "{email} won't get them anymore. You'll still get debate invites and reminders.",
    undoneTitle: 'Replies are back on',
    undoneBody: "We'll email you when someone replies to your comment.",
  },
  your_debates: {
    askTitle: 'Unsubscribe from emails about your debates?',
    askBody:
      '{email} will stop getting an email when a debate you were in is ready. Debate invites and reminders keep coming.',
    doneTitle: "You're unsubscribed from emails about your debates",
    doneBody: "{email} won't get them anymore. You'll still get debate invites and reminders.",
    undoneTitle: 'Emails about your debates are back on',
    undoneBody: "We'll email you when your next debate is ready.",
  },
  invites: {
    askTitle: 'Unsubscribe from debate invites and reminders?',
    askBody:
      "{email} will stop getting debate bookings, changes and reminders. People who book a time with you won't reach you by email. Their invites will only show up in Geo.",
    doneTitle: "You're unsubscribed from debate invites and reminders",
    doneBody: "{email} won't get them anymore. Bookings and reminders will only show up in Geo.",
    undoneTitle: 'Debate invites and reminders are back on',
    undoneBody: "We'll email you when someone books a debate with you.",
  },
  community_calls: {
    askTitle: 'Unsubscribe from community call reminders?',
    askBody:
      '{email} will stop getting an email before a community call you asked to be reminded about. Debate invites and reminders keep coming.',
    doneTitle: "You're unsubscribed from community call reminders",
    doneBody: "{email} won't get them anymore. You'll still get debate invites and reminders.",
    undoneTitle: 'Community call reminders are back on',
    undoneBody: "We'll email you before the next call you asked to be reminded about.",
  },
};

/**
 * A group this build does not know yet, named by the service: geo-notifications can ship a group
 * before the web does, and its links must still open.
 */
export function unsubscribeCopy(group: string, groupName: string | null | undefined): UnsubscribeCopy {
  const known = UNSUBSCRIBE_COPY[group as EmailGroup];
  if (known) return known;
  const name = groupName?.trim() || 'these emails';
  return {
    askTitle: `Unsubscribe from ${name}?`,
    askBody: '{email} will stop getting these emails.',
    doneTitle: `You're unsubscribed from ${name}`,
    doneBody: "{email} won't get them anymore.",
    undoneTitle: 'These emails are back on',
    undoneBody: "We'll email you again.",
  };
}

export const UNDO_EXPIRED_BODY =
  "This can't be undone from here anymore. You can turn it back on in your email settings.";

export const INVALID_UNSUBSCRIBE_LINK = {
  title: "This unsubscribe link doesn't work",
  body: 'It may have been cut short when it was copied. You can choose which emails you get in your email settings.',
};

/** The unsubscribe page when geo-notifications can't be reached: the link itself is probably fine. */
export const UNSUBSCRIBE_UNAVAILABLE = {
  title: "We couldn't open this link",
  body: 'Something went wrong on our side, not with your link. Try again in a moment.',
};

/** Fills `{email}`; geo-notifications' page says "Your address" when there is none on file. */
export function withAddress(text: string, email: string | null): string {
  return text.replaceAll('{email}', email ?? 'Your address');
}
