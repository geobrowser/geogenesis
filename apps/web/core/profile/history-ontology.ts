import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

/**
 * The ontology behind Work and Education on a profile (GEO-2858).
 *
 * Every id below was read back from the graph before being written down —
 * `entities(filter: { id: { in: [...] } }) { id name }` on 2026-09-10 — rather
 * than copied on trust. A wrong id here writes a relation nobody can read.
 *
 * The shape is three levels deep, and the middle level is the part that is easy
 * to miss: a relation carries an entity of its own (`relation.entityId`), and
 * that entity is what the next level hangs off.
 *
 *   person ──Employment──▶ company
 *              └─ stint = the Employment relation's own entity
 *                   └─ ──Roles──▶ job title
 *                          └─ tenure = the Roles relation's own entity
 *                               ├─ Employment status ──▶ Current | Former
 *                               ├─ Start date, End date, Description
 *
 * One Employment edge per company, with every role held there hanging off it.
 * That is what lets a promotion read as two dated rows under one employer.
 */

/** person ──▶ company. Its entity is the stint. */
export const EMPLOYMENT_PROPERTY = 'a2fae35bac864a568b26e69643c68d9d';

/** stint ──▶ job title. Its entity is the tenure. Already exported by the SDK. */
export const ROLES_PROPERTY = ContentIds.ROLES_PROPERTY;

/** tenure ──▶ Current | Former. */
export const EMPLOYMENT_STATUS_PROPERTY = '3415e3537e0542099bffe07755fa004f';
export const EMPLOYMENT_STATUS_CURRENT = '3830b07bfa7f487d87a5374aa0dc3253';
export const EMPLOYMENT_STATUS_FORMER = 'f73b23c396d7493293eb8d3f55352284';

/** person ──▶ school. Its entity is the record. */
export const EDUCATION_PROPERTY = 'dbb41bb9f76f4e5e866590086857fa22';

/** record ──▶ degree. Its entity is the enrolment. Singular, unlike Roles. */
export const DEGREE_PROPERTY = '38344c504261406496db13504579e64f';

/** enrolment ──▶ Completed | Incomplete. */
export const EDUCATION_STATUS_PROPERTY = 'afff0f059654466e865448d56585a41c';
export const EDUCATION_STATUS_COMPLETED = '95bc24ff68d148afa6206904da3d5b31';
export const EDUCATION_STATUS_INCOMPLETE = '99e3e53481334b1aab40fc5a7d232b11';

/** enrolment ──▶ academic field. A relation, so a joint honours degree can repeat it. */
export const ACADEMIC_FIELDS_PROPERTY = '11692db4ddf54a69bfa044fb6b12f401';

/** What `Academic fields` may point at — hand straight to `relationValueTypes`. */
export const ACADEMIC_FIELD_TYPE = SystemIds.ACADEMIC_FIELD_TYPE;

/**
 * Types to scope the find-or-create pickers, and to stamp on anything created
 * through them so the next person finds it instead of making a second one.
 *
 * Only the two that could be verified. School and Degree have several entities
 * apiece under those names with no obvious canonical one, so those two pickers
 * search unscoped rather than guess an id — a wrong type here is worse than none.
 */
/**
 * What an Employment edge points at. `Project` rather than `Company`: the graph
 * models the thing you were employed on, and plenty of them are not companies.
 */
export const EMPLOYER_TYPE = SystemIds.PROJECT_TYPE;
export const JOB_TYPE = ContentIds.JOB_TYPE;

/**
 * Dates. The SDK names these `RANK_*` after the first thing that used them, but
 * they are the graph's general-purpose Start date / End date properties — the
 * repo already aliases them a second time in `ranking-block-ids.ts`.
 */
export const START_DATE_PROPERTY = SystemIds.RANK_START_DATE_PROPERTY;
export const END_DATE_PROPERTY = SystemIds.RANK_END_DATE_PROPERTY;

export const DESCRIPTION_PROPERTY = SystemIds.DESCRIPTION_PROPERTY;

/**
 * Free-text field of study, used by eleven education records predating
 * `Academic fields`. Read only — those strings are the obvious seed for real
 * Academic field entities, but nothing new should be written here.
 */
export const LEGACY_FIELD_OF_STUDY_PROPERTY = '8c22d2cd3b0a4a9189f0da6027cf5830';

export type EmploymentStatus = 'current' | 'former';
export type EducationStatus = 'studying' | 'completed' | 'incomplete';

export const EMPLOYMENT_STATUS_OPTION: Record<EmploymentStatus, string> = {
  current: EMPLOYMENT_STATUS_CURRENT,
  former: EMPLOYMENT_STATUS_FORMER,
};

/**
 * `studying` is deliberately absent. The graph has no "in progress" option, and
 * inventing one is worse than leaving it unsaid — so still-studying writes no
 * status at all and simply leaves End date empty.
 */
export const EDUCATION_STATUS_OPTION: Partial<Record<EducationStatus, string>> = {
  completed: EDUCATION_STATUS_COMPLETED,
  incomplete: EDUCATION_STATUS_INCOMPLETE,
};

export function employmentStatusFromOptionId(id: string | null | undefined): EmploymentStatus | null {
  if (id === EMPLOYMENT_STATUS_CURRENT) return 'current';
  if (id === EMPLOYMENT_STATUS_FORMER) return 'former';
  return null;
}

export function educationStatusFromOptionId(id: string | null | undefined): EducationStatus | null {
  if (id === EDUCATION_STATUS_COMPLETED) return 'completed';
  if (id === EDUCATION_STATUS_INCOMPLETE) return 'incomplete';
  return null;
}
