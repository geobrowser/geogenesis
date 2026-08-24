/**
 * Types for the geo-query sub-agent — the assistant's escape hatch for read
 * questions the fixed-shape tools can't answer: exact counts, date ranges,
 * more than 10 results, relation traversal, and the contents of a data block.
 *
 * Shaped like ResearchOutput on purpose: the sub-agent returns a *digest*, not
 * rows. A single block can hold 1,000 entities, and handing those back would
 * put them in the main turn's context to be re-read on every resubmit.
 */

export type GeoQueryInput = {
  /** The question, in plain language. The sub-agent writes the GraphQL. */
  question: string;
};

export type GeoQueryRow = {
  id: string;
  name: string | null;
  spaceId: string | null;
};

export type GeoQuerySuccess = {
  /** Prose answer to the question asked. */
  answer: string;
  /** Present only when the question wanted a list. Capped — see MAX_ROWS. */
  rows?: GeoQueryRow[];
  /** The true total, even when `rows` is capped. */
  totalCount?: number;
  /**
   * The GraphQL actually executed.
   *
   * Not debug output — this is how a wrong answer becomes falsifiable. The
   * skill documents a mistake that "answered 0 when the true count was 13"
   * (filtering on the `Publish datetime` property instead of entity
   * `createdAt`). Both answers look equally confident; only the query tells
   * them apart.
   */
  queries: string[];
};

export type GeoQueryOutput =
  | GeoQuerySuccess
  | { error: 'not_signed_in' | 'rate_limited' | 'timed_out' | 'lookup_failed' };
