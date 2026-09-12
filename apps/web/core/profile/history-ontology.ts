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
 * Taken from what each property declares rather than from the name that reads
 * best — see `JOB_TYPE` for what guessing cost the last time.
 */
/**
 * What an Employment edge points at. `Project` rather than `Company`: the graph
 * models the thing you were employed on, and plenty of them are not companies.
 */
export const EMPLOYER_TYPE = SystemIds.PROJECT_TYPE;

/**
 * What a Roles relation points at, taken from what the property itself declares
 * rather than from the name that reads best.
 *
 * `Roles` declares `To entity types: Person role`, and the graph agrees: 4,014
 * entities carry that type against 32 carrying `Job`. The picker searched `Job`
 * until this was checked, which is why typing a real job title returned three
 * hand-entered rows and none of the 2,905 occupations the ESCO import added.
 */
export const JOB_TYPE = 'e4e366e9d5554b6892bf7358e824afd2';

/**
 * What `Roles` declares its *relation* entity is — the tenure. Typing it is what
 * lets anything else find a tenure by its type; an untyped one is reachable only
 * by walking in from the person who holds it.
 */
export const ROLE_INFORMATION_TYPE = '343952488d4a4bc088aae611b931ac0e';

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

/** tenure ──▶ Full-time | Part-time | … */
export const EMPLOYMENT_TYPE_PROPERTY = '53a98633a2db40be9f161a4c9da37970';
export const EMPLOYMENT_TYPE_TYPE = 'f503bfd283d74e1a9b30294fff9d2d7e';

/**
 * The LinkedIn set, published to Geo separately from this work and verified
 * against the graph on 2026-09-11 — all eight resolve, with these names.
 *
 * Worth knowing when reading the graph rather than writing it: six *other*
 * entities named "Full-time" are also typed `Employment type`, alongside a
 * "Temporary" and an unnamed one. These eight are the set this modal offers;
 * older records may point at any of the others.
 */
export const EMPLOYMENT_TYPE_OPTIONS = [
  { id: 'f4a86b892f094d97894c4bfedd150c30', name: 'Full-time' },
  { id: '5758c248068e44838da7e22109d9993f', name: 'Part-time' },
  { id: '00f2a3b854f949c7b9f8a1e46872cbcc', name: 'Self-employed' },
  { id: '75839ffa17ef4d20b4e0621a4780030d', name: 'Freelance' },
  { id: '80d15f0e3b4f4288b69a1bcb5c3e4a0b', name: 'Contract' },
  { id: '6eaed80c39b144f48e31dabf409a0722', name: 'Internship' },
  { id: '946a5333fa084b2aac0c8d89a97b431c', name: 'Apprenticeship' },
  { id: '1a0235d7f32e4cff83f9545f01bd96ba', name: 'Seasonal' },
] as const;

/**
 * Where the role was held, and how.
 *
 * Seven properties are named `Location` and three `Location type`; these are the
 * ones the graph actually uses — 676 relations and 16 against nothing at all for
 * the rest. Both hang off the tenure beside the dates, because a job moves city
 * and goes remote without becoming a different job.
 *
 * `Location` points at a place rather than holding text, so "San Francisco" is
 * the same San Francisco everyone else means.
 */
export const LOCATION_PROPERTY = '95d770021faf4f7cb7deb21a7d48cda0';
export const LOCATION_TYPE_PROPERTY = 'ceeb611101554764bea22818b21d3fbd';

/** What `Location` declares it points at. Address is deliberately left out — a
 * job is held in a city, not at a street number. */
export const PLACE_TYPE = '783bc688e65f4e54b67fa5643d78345e';
export const CITY_TYPE = '01b05333941a4b00bc78fac5a15b467d';
export const REGION_TYPE = 'c188844a722442abb4762991c9c913f1';
export const COUNTRY_TYPE = '42a0a7618c82459fad0834bfeb437cde';
export const LOCATION_TYPES = [CITY_TYPE, REGION_TYPE, COUNTRY_TYPE, PLACE_TYPE];

/**
 * Remote, Onsite and Hybrid — one set, though only the first two have ever been
 * used. All three sit in the same space with descriptions that read as a set
 * ("Position combines remote and onsite work"), and none of them is typed, which
 * is why they cannot be found by type the way employment types can.
 *
 * Verified against the graph on 2026-09-11. Note the spelling: `Onsite`, not
 * `On-site`.
 */
export const LOCATION_TYPE_OPTIONS = [
  { id: '19db5058ae4849e79fd698f46b6beae4', name: 'Onsite' },
  { id: '18022953fd99439e8feb55e50241dac0', name: 'Hybrid' },
  { id: '8f5e23aa70394ea4b7946fa0a9878da7', name: 'Remote' },
] as const;

/** tenure ──▶ skill. A relation, and it repeats. */
export const SKILLS_PROPERTY = ContentIds.SKILLS_PROPERTY;
export const SKILL_TYPE = ContentIds.SKILL_TYPE;

/**
 * The ESCO occupation taxonomy, which hangs off the same `Skills` property a
 * tenure uses: role ──Skills──▶ skill, 112,114 of them across 2,905 occupations.
 *
 * Two things sit off to the side of that edge, and both are needed to recommend
 * anything worth reading. Whether a skill is essential to the role is on the
 * relation's own entity — not on the role, and not on the skill. How widely the
 * skill transfers is on the skill, one hop further out, as a `Skill scope`
 * pointing at one of four ranked entities.
 *
 * Rank is what separates a useful suggestion from a merely true one: in live
 * data `troubleshoot` is essential to 236 occupations, so a list topped by it is
 * accurate and tells the reader nothing.
 *
 * Verified against the graph on 2026-09-11.
 */
export const IS_REQUIRED_PROPERTY = '3d60051c488f4a5ebae67a8264ade8bd';
export const SKILL_SCOPE_PROPERTY = '7426f8535dc84776bd7abce1d069fa06';
export const SCOPE_RANK_PROPERTY = '3ae1e15935864c0f9425652125d03772';

/**
 * The space the taxonomy was imported into.
 *
 * Named here because the pickers have to ask for it explicitly. Search widens
 * eligibility to the canonical graph plus the spaces the viewer belongs to, and
 * the import is neither: every one of its 4,014 roles and 14,114 skills comes
 * back from the search endpoint flagged non-canonical, in a space almost nobody
 * is a member of. So a search for `Software developer` returned four unrelated
 * canonical roles and none of the occupations — and the skills box offered the
 * half-dozen skills Geo's own space happens to hold.
 */
export const TAXONOMY_SPACE_ID = 'd69608290513c2a91102c939b3265bd7';

/**
 * What the School picker searches, and what it types a school it creates as.
 *
 * `Education` declares `To entity types: Institution`, which is the broader of
 * the two and has 108 entities behind it; `University` has 10 and is what
 * someone filling in a school is usually naming. Both, therefore — searching
 * either alone hides most of the answers, and a new school is typed as both so
 * it turns up whichever one the next reader scopes to.
 */
/**
 * What `Degree` declares it points at, and what a degree created here is typed as.
 */
export const DEGREE_TYPE = 'bfd47a5430aa43e18b8b8b86735919a0';

/**
 * A second entity also named `Degree`, also a real type, carrying 29 degrees the
 * graph had before the declared one existed — Ph.D., Master, Bachelor, B.S.
 *
 * Searched alongside the declared type rather than instead of it. Scoping to the
 * declared one alone is the correct-looking choice that hides every degree
 * anybody has actually used, which is the mistake the Title picker made against
 * `Job` for a fortnight. New degrees are still typed as the declared one, so the
 * split narrows rather than widens.
 */
export const LEGACY_DEGREE_TYPE = '65256c5462834981b502aceeb74bd08c';

export const DEGREE_TYPES = [DEGREE_TYPE, LEGACY_DEGREE_TYPE];

export const UNIVERSITY_TYPE = '0235f3d2821947a481d39ccd68e2b821';
export const INSTITUTION_TYPE = '7f5433a40628498f9de6311cb14709a8';
export const SCHOOL_TYPES = [UNIVERSITY_TYPE, INSTITUTION_TYPE];

/** What the avatar of a company or school is stored under. */
export const AVATAR_PROPERTY = ContentIds.AVATAR_PROPERTY;

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
