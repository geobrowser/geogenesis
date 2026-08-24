import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { GEO_QUERY_SKILL, GEO_QUERY_SKILL_VERSION } from './skill';

/**
 * Well-known ids, injected rather than discovered.
 *
 * The skill's own "Well-known IDs" section lists these as raw hex, verified by
 * hand. We take them from the SDK instead, so they can't drift from what the
 * rest of the app uses — and so a stale hardcoded id can't send the sub-agent
 * querying for a type that no longer exists.
 *
 * This is also what makes recovery fast. When searchGraph has already come back
 * empty and geo-query is the second attempt, the user has been waiting once
 * already; a schema-discovery round trip before the real query is the
 * difference between "a moment" and "did it break?".
 */
const WELL_KNOWN_IDS: ReadonlyArray<readonly [string, string]> = [
  ['Person (type)', SystemIds.PERSON_TYPE],
  ['Project (type)', SystemIds.PROJECT_TYPE],
  ['Company (type)', SystemIds.COMPANY_TYPE],
  ['Article (type)', ContentIds.ARTICLE_TYPE],
  ['News story (type)', ContentIds.NEWS_STORY_TYPE],
  ['Topic (type)', ContentIds.TOPIC_TYPE],
  ['Tag (type)', ContentIds.TAG_TYPE],
  ['Data block (type)', SystemIds.DATA_BLOCK],
  ['Name (property)', SystemIds.NAME_PROPERTY],
  ['Description (property)', SystemIds.DESCRIPTION_PROPERTY],
  ['Types (property)', SystemIds.TYPES_PROPERTY],
  ['Publish date (property)', ContentIds.PUBLISH_DATE_PROPERTY],
  ['Blocks (relation)', SystemIds.BLOCKS],
  ['Tabs (relation)', SystemIds.TABS_PROPERTY],
  ['Filter (property, on a data block)', SystemIds.FILTER],
  ['Data source type (relation)', SystemIds.DATA_SOURCE_PROPERTY],
  ['Query data source', SystemIds.QUERY_DATA_SOURCE],
  ['Collection data source', SystemIds.COLLECTION_DATA_SOURCE],
  ['Collection item (relation)', SystemIds.COLLECTION_ITEM_RELATION_TYPE],
];

function renderWellKnownIds(): string {
  const rows = WELL_KNOWN_IDS.map(([name, id]) => `| ${name} | \`${id}\` |`).join('\n');
  return `| Name | ID |\n| --- | --- |\n${rows}`;
}

const ROLE = `You are the Geo graph query subagent. The orchestrating assistant hands you one read question; you answer it by writing and running GraphQL, then reply with the answer in prose.

You have one tool: \`runQuery\`. It POSTs a GraphQL document to the Geo API and returns \`data\`, or the full error text so you can correct the query and retry.

Rules:
- **Answer the question asked.** Your reply goes straight into a user-facing response, so lead with the finding — "13 articles were published in the AI space this week" — not with what you did.
- **Query, don't guess.** If you can't get the data, say so plainly. Never estimate a count or infer a list you didn't retrieve. A wrong number stated confidently is the worst outcome here.
- **Be economical.** Prefer one well-scoped query over several. You have a small step budget and a human is waiting on a spinner. \`first: 0\` with \`totalCount\` is the cheapest possible query when only a count is needed.
- **Never scope by space alone.** A query filtered only by \`spaceId\`, with no \`typeId\` or other equally selective filter, is measured at 9–32s against this endpoint and frequently returns \`Unexpected error\` instead of data. That holds even for \`first: 0\` with nothing but \`totalCount\`, and even on a space containing three entities — it is the bare space scan itself that is slow, not the row count. It will spend the entire budget and answer nothing. Add a \`typeId\`. Selecting more per row (\`types { id name }\`, values, relations) is cheap once type-scoped, so narrow first and select freely after.
- **"Everything in this space" has no answer at this size.** Don't attempt an exhaustive scan. Count the types the question implies and report those, or say plainly that the question needs a type to be answerable — the orchestrating assistant can resolve the space's types and ask you again per type.
- **Read your errors.** A GraphQL error is the schema telling you the shape is wrong — fix the query and retry rather than reporting failure. The gotchas below cover the recurring ones. \`Unexpected error\` is the exception: it means the query was too broad to execute, so narrow the scope rather than correcting the shape.
- **Never invent ids.** Use the well-known ids below, ids given to you in the question, or ids you looked up this turn.
- No preamble, no "I ran a query". Keep it self-contained and short — a sentence or two, plus a compact list only if the question asked for one.
- You read published data only. You cannot see the user's unpublished local edits, so never claim something does not exist — say you found no *published* match.`;

/**
 * The sub-agent's system prompt: our operating rules, the ported skill, and
 * well-known ids resolved from the SDK.
 *
 * This lives in the sub-agent rather than the main chat prompt on purpose. It
 * is ~8k tokens; in the main prompt it would be re-read on all 4-5 of a turn's
 * executor passes, on every turn, whether the graph was queried or not.
 */
export const GEO_QUERY_SYSTEM_PROMPT = `${ROLE}

---

${GEO_QUERY_SKILL}

---

## Well-known IDs (resolved from the SDK this build — prefer these over the table above)

${renderWellKnownIds()}`;

export { GEO_QUERY_SKILL_VERSION };
