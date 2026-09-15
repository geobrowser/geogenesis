/**
 * The facts the profile rail states about an account (GEO-2859).
 *
 * All of them key on the personal *space* id rather than the person entity id.
 * A person has two ids and they are not interchangeable: presentation hangs off
 * `space.topicId`, and every count below hangs off the space. Querying the
 * entity id returns zero for all of them, silently.
 */

/** A space this person belongs to, and what they are in it. */
export type ProfileSpace = {
  id: string;
  name: string | null;
  /** Editing rights, which on this deployment every membership carries. */
  isEditor: boolean;
};

/** Someone who has vouched for this person. Spaces and people alike. */
export type Verifier = {
  spaceId: string;
  name: string | null;
  avatarUrl: string | null;
  /** A personal space is a person; anything else is a space. */
  isPerson: boolean;
};

export type ProfileFacts = {
  /** Proposals made anywhere, not only in this space. */
  proposals: number;
  /** Claims this person holds a position on. */
  positions: number;
  /** Debates they argued a side of. */
  debates: number;
  spaces: ProfileSpace[];
  verifiedBy: Verifier[];
  /** Unix seconds, from the person entity rather than the space. */
  joinedAt: number | null;
};

export const NO_FACTS: ProfileFacts = {
  proposals: 0,
  positions: 0,
  debates: 0,
  spaces: [],
  verifiedBy: [],
  joinedAt: null,
};

/**
 * Vote kinds that are a position on a claim.
 *
 * 1 is a stance, 2 is veracity. The table holds other kinds, so counting it
 * unfiltered overstates the figure — and there is a second table, `votes` on
 * `voterId`, which is a different thing again and returns roughly three times
 * as many rows. Positions is `userVotes` on `userId`, these two kinds.
 */
export const POSITION_VOTE_KINDS = [1, 2] as const;

/**
 * Subspace relations that mean somebody vouched for this space.
 *
 * The same table carries `RELATED`, which means only that two spaces are linked.
 * Counting rows rather than filtering them puts a company that merely links to
 * someone in a row that says it vouched for them.
 */
export const VERIFIED_SUBSPACE_TYPE = 'VERIFIED';

/** How long this account has been on Geo, for the About row. */
export function timeOnGeo(joinedAt: number | null, now = new Date()): string | null {
  if (joinedAt === null) return null;

  const joined = new Date(joinedAt * 1000);
  const wholeMonths =
    (now.getUTCFullYear() - joined.getUTCFullYear()) * 12 + (now.getUTCMonth() - joined.getUTCMonth());

  // The last month only counts once its day comes round. Joined on the 29th and
  // read on the 15th is seven months and some, not eight — counting calendar
  // months alone rounds every account up by one for most of every month.
  const months = now.getUTCDate() < joined.getUTCDate() ? wholeMonths - 1 : wholeMonths;

  if (months < 1) return 'less than a month';
  if (months < 12) return `${months} mo${months === 1 ? '' : 's'}`;

  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearPart = `${years} yr${years === 1 ? '' : 's'}`;

  return rest === 0 ? yearPart : `${yearPart} ${rest} mo${rest === 1 ? '' : 's'}`;
}

/**
 * The day this account arrived, as the row shows it.
 *
 * UTC throughout, matching every other date on the profile — a join date that
 * moves by a day depending on where it is read from is worse than one that is
 * occasionally a few hours off what somebody remembers.
 */
export function formatJoined(joinedAt: number | null): string | null {
  if (joinedAt === null) return null;

  return new Date(joinedAt * 1000).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Spaces ordered for the rail: named before unnamed, then alphabetically.
 *
 * Nine of the reference account's 33 have no name at all. A blank row in a list
 * of 33 reads as a loading failure, so they are labelled and sorted last rather
 * than dropped — they are real memberships.
 */
export function orderSpaces(spaces: ProfileSpace[]): ProfileSpace[] {
  return [...spaces].sort((a, b) => {
    if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
    return (a.name ?? '').localeCompare(b.name ?? '');
  });
}
