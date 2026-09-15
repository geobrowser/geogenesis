import type { EducationCard, EmploymentCard, HistoryCard, HistoryEntry } from './normalize-history';
import { isOngoing } from './normalize-history';

/** One thing a person is doing now, for the headline under their name. */
export type CurrentRole = {
  /** Distinguishes a job from a degree; they read differently and link differently. */
  kind: 'employment' | 'education';
  /** The role or degree. */
  subject: string;
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
  const from = (cards: HistoryCard<HistoryEntry>[], kind: CurrentRole['kind']): CurrentRole[] =>
    cards.flatMap(card =>
      card.entries
        .filter(entry => entry.startDate !== null && isOngoing(entry))
        .map(entry => ({
          kind,
          subject: entry.subject.name ?? 'Untitled',
          organization: card.organization.name ?? 'Untitled',
          organizationId: card.organization.id,
          avatarUrl: card.avatarUrl ?? null,
        }))
    );

  // Cards arrive newest first and their rows are sorted within them, so the
  // concatenation is already in the order the headline wants.
  return [...from(employment, 'employment'), ...from(education, 'education')];
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
 */
export function collectSkills(employment: EmploymentCard[], education: EducationCard[]): string[] {
  const seen = new Map<string, string>();

  const add = (name: string | null) => {
    if (name === null) return;
    const key = name.trim().toLowerCase();
    if (key !== '' && !seen.has(key)) seen.set(key, name.trim());
  };

  for (const card of employment) {
    for (const entry of card.entries) entry.skills.forEach(skill => add(skill.name));
  }

  for (const card of education) {
    for (const entry of card.entries) {
      entry.skills.forEach(skill => add(skill.name));
      entry.fields.forEach(field => add(field.name));
    }
  }

  return [...seen.values()];
}
