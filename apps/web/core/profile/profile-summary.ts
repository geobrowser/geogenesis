import type {
  EducationCard,
  EducationEntry,
  EmploymentCard,
  EmploymentEntry,
  NamedRef,
} from './normalize-history';
import { isOngoing } from './normalize-history';

/**
 * Whether this row belongs in the headline.
 *
 * `isOngoing` is broader on purpose: it answers "has this ended", and a row with
 * no status at all counts as open. That is right for sorting and wrong here,
 * because **most history in the graph is undated** — 1,739 of 1,906 employment
 * rows carry no date at all — so admitting every status-less undated row would
 * put a person's entire back catalogue under their name as things they are
 * doing now.
 *
 * Requiring a start date kept those out and took the explicitly-marked rows with
 * them: somebody whose role says `current` but carries no date is making a
 * statement, and the headline promises "every current role and degree".
 *
 * Modern education is the one deliberate exception. "Still studying" has no
 * graph option, so the writer persists it with no status or end date, and both
 * dates are optional. `isLegacy` makes that absence unambiguous for a modern
 * degree while keeping the graph's status-less undated back catalogue out.
 */
function isCurrent(
  kind: 'employment' | 'education',
  entry: EmploymentEntry | EducationEntry
): boolean {
  if (!isOngoing(entry)) return false;

  if (entry.startDate !== null || entry.status === 'current' || entry.status === 'studying') return true;

  return kind === 'education' && !entry.isLegacy && entry.status === null;
}

const nonEmptyName = (name: string | null | undefined) => name?.trim() || null;

/** Join whichever halves of an affiliation are present, without leaving a dangling "at". */
function affiliationLine(subject: string | null, organization: string | null): string | null {
  if (subject && organization) return `${subject} at ${organization}`;
  return subject ?? organization;
}

type CurrentHistoryRow =
  | { kind: 'employment'; card: EmploymentCard; entry: EmploymentEntry }
  | { kind: 'education'; card: EducationCard; entry: EducationEntry };

/** The shared current-role selection and profile ordering behind every summary of this history. */
function currentHistoryRows(employment: EmploymentCard[], education: EducationCard[]): CurrentHistoryRow[] {
  return [
    ...employment.flatMap(card =>
      card.entries
        .filter(entry => isCurrent('employment', entry))
        .map(entry => ({ kind: 'employment' as const, card, entry }))
    ),
    ...education.flatMap(card =>
      card.entries
        .filter(entry => isCurrent('education', entry))
        .map(entry => ({ kind: 'education' as const, card, entry }))
    ),
  ];
}

/**
 * The first current affiliation in the same order the profile presents its headline.
 *
 * Experience comes before education on the profile, and cards and rows are already newest first.
 * Rows with no printable title or organisation are skipped: an empty graph record is not an
 * affiliation, and must not hide the next complete one.
 */
export function currentAffiliation(employment: EmploymentCard[], education: EducationCard[]): string | null {
  for (const row of currentHistoryRows(employment, education)) {
    const subject =
      row.kind === 'education'
        ? [nonEmptyName(row.entry.subject.name), ...row.entry.fields.map(field => nonEmptyName(field.name))]
            .filter((part): part is string => part !== null)
            .join(', ')
        : nonEmptyName(row.entry.subject.name);
    const line = affiliationLine(subject || null, nonEmptyName(row.card.organization.name));
    if (line) return line;
  }

  return null;
}

/** One thing a person is doing now, for the headline under their name. */
export type CurrentRole = {
  /** Distinguishes a job from a degree; they read differently and link differently. */
  kind: 'employment' | 'education';
  /** The role or degree. */
  subject: string;
  /** The entity behind it, so the headline can open it. */
  subjectId: string;
  /** Where they hold it. */
  organization: string;
  organizationId: string;
  avatarUrl: string | null;
};

/**
 * Everything this person is doing now, newest first.
 *
 * All of it, not one derived headline. The reference account holds three at
 * once — two jobs and a PhD — and picking one would mean inventing a rule about
 * which job is the real one. Someone with none gets an empty list and no
 * headline, which is most accounts.
 */
export function currentRoles(employment: EmploymentCard[], education: EducationCard[]): CurrentRole[] {
  return currentHistoryRows(employment, education).map(({ kind, card, entry }) => ({
    kind,
    subject: entry.subject.name ?? 'Untitled',
    subjectId: entry.subject.id,
    organization: card.organization.name ?? 'Untitled',
    organizationId: card.organization.id,
    avatarUrl: card.avatarUrl ?? null,
  }));
}

/**
 * Every skill this person has, from work and study together.
 *
 * They belong to the person rather than to any one row: sixteen on the
 * reference account, spread across four roles and two degrees, with Market
 * research claimed by two of them. Counted once, in the order first met, so the
 * list is stable between renders rather than reordering as cards load.
 *
 * Fields of study count. They are what a degree taught, and without them a
 * bachelor's contributes nothing to a list of what somebody knows.
 *
 * Each keeps its entity id, because a skill on a profile is a link to everyone
 * else who has it. The first id wins where two rows name the same skill: they
 * are the same entity in every case that matters, and a legacy field of study
 * carrying no id loses to a real one rather than the other way round.
 */
export function collectSkills(employment: EmploymentCard[], education: EducationCard[]): NamedRef[] {
  const seen = new Map<string, NamedRef>();

  const add = (ref: NamedRef) => {
    if (ref.name === null) return;
    const name = ref.name.trim();
    const key = name.toLowerCase();
    if (key === '') return;

    const existing = seen.get(key);
    if (existing === undefined) {
      seen.set(key, { id: ref.id, name });
      return;
    }
    // An id where we had none: the same skill, now openable.
    if (existing.id === '' && ref.id !== '') seen.set(key, { id: ref.id, name });
  };

  for (const card of employment) {
    for (const entry of card.entries) entry.skills.forEach(add);
  }

  for (const card of education) {
    for (const entry of card.entries) {
      entry.skills.forEach(add);
      entry.fields.forEach(add);
    }
  }

  return [...seen.values()];
}
