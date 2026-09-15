import type { EducationCard, EmploymentCard, HistoryCard, HistoryEntry, NamedRef } from './normalize-history';
import { isOngoing } from './normalize-history';

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
  const from = (cards: HistoryCard<HistoryEntry>[], kind: CurrentRole['kind']): CurrentRole[] =>
    cards.flatMap(card =>
      card.entries
        .filter(entry => entry.startDate !== null && isOngoing(entry))
        .map(entry => ({
          kind,
          subject: entry.subject.name ?? 'Untitled',
          subjectId: entry.subject.id,
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
