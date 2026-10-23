/**
 * Lists topics that share a name, so a new duplicate is caught rather than discovered.
 */
import { TOPICS_PROPERTY_ID } from '../core/claims/ontology';
import { CURATED_TOPIC_TAG_ID, TAG_PROPERTY_ID, TOPIC_TYPE_ID } from '../core/constants';
import { API, arg, numberArg } from './lib/debate-claims';
import { type TopicRecord, buildReport, formatReport, topicNameKey } from './lib/duplicate-topics';

const TYPES_PROPERTY_ID = '8f151ba4de204e3c9cb499ddf96f48f1';

const MIN_TAGGED = numberArg('min-tagged', { fallback: 10, min: 0 });
const AS_JSON = process.argv.includes('--json');
const CURATED_ONLY = process.argv.includes('--curated-only');
const STRICT = process.argv.includes('--strict');

const COUNT_BATCH = 200;

if (arg('help') !== undefined || process.argv.includes('--help')) {
  console.log('bun scripts/find-duplicate-topics.ts [--min-tagged N] [--curated-only] [--json] [--strict]');
  process.exit(0);
}

async function gql<T>(query: string): Promise<T> {
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = (await response.json()) as { data?: T; errors?: unknown };
  if (body.errors || !body.data) throw new Error(`GraphQL: ${JSON.stringify(body.errors).slice(0, 400)}`);
  return body.data;
}

type RelationPage = {
  relationsConnection: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: { fromEntityId: string; spaceId: string; fromEntity: { name: string | null } | null }[];
  };
};

/** Every relation of one type pointing at one entity, a page at a time. */
async function* eachRelation(typeId: string, toEntityId: string) {
  let after: string | null = null;
  for (;;) {
    const page: RelationPage = await gql(`query {
      relationsConnection(
        filter: { typeId: { is: "${typeId}" } toEntityId: { is: "${toEntityId}" } }
        first: 1000
        after: ${JSON.stringify(after)}
      ) {
        pageInfo { hasNextPage endCursor }
        nodes { fromEntityId spaceId fromEntity { name } }
      }
    }`);
    yield* page.relationsConnection.nodes;
    if (!page.relationsConnection.pageInfo.hasNextPage) return;
    after = page.relationsConnection.pageInfo.endCursor;
  }
}

/**
 * Distinct entities tagged with each of these topics, in one query per batch.
 *
 * Keys come back as dashed uuids whatever was sent, so they are matched on the dashless form.
 */
async function taggedCounts(topicIds: readonly string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  for (let i = 0; i < topicIds.length; i += COUNT_BATCH) {
    const batch = topicIds.slice(i, i + COUNT_BATCH);
    const data = await gql<{
      relationsConnection: { groupedAggregates: { keys: string[]; distinctCount: { fromEntityId: string } }[] };
    }>(`query {
      relationsConnection(
        filter: { typeId: { is: "${TOPICS_PROPERTY_ID}" } toEntityId: { in: ${JSON.stringify(batch)} } }
      ) {
        groupedAggregates(groupBy: TO_ENTITY_ID) { keys distinctCount { fromEntityId } }
      }
    }`);

    for (const row of data.relationsConnection.groupedAggregates) {
      const key = (row.keys[0] ?? '').replaceAll('-', '');
      counts.set(key, Number(row.distinctCount.fromEntityId));
    }
  }

  return counts;
}

async function main() {
  const spacesById = new Map<string, Set<string>>();
  const nameById = new Map<string, string>();

  for await (const node of eachRelation(TYPES_PROPERTY_ID, TOPIC_TYPE_ID)) {
    const id = node.fromEntityId.replaceAll('-', '');
    let spaces = spacesById.get(id);
    if (!spaces) spacesById.set(id, (spaces = new Set()));
    spaces.add(node.spaceId.replaceAll('-', ''));
    if (node.fromEntity?.name) nameById.set(id, node.fromEntity.name);
  }

  const curated = new Set<string>();
  for await (const node of eachRelation(TAG_PROPERTY_ID, CURATED_TOPIC_TAG_ID)) {
    curated.add(node.fromEntityId.replaceAll('-', ''));
  }

  /*
   * Counted only for the topics that actually collide. Counting all 70,000 would be most of the
   * runtime for a number no line of the report would print.
   */
  const named = [...spacesById.keys()].filter(id => (nameById.get(id) ?? '').trim());
  const colliding = new Set<string>();
  const seenByKey = new Map<string, string[]>();
  for (const id of named) {
    const key = topicNameKey(nameById.get(id) as string);
    const bucket = seenByKey.get(key);
    if (bucket) {
      bucket.push(id);
      for (const member of bucket) colliding.add(member);
    } else {
      seenByKey.set(key, [id]);
    }
  }

  const counts = await taggedCounts([...colliding]);

  const topics: TopicRecord[] = named.map(id => ({
    id,
    name: nameById.get(id) as string,
    curated: curated.has(id),
    tagged: counts.get(id) ?? 0,
    spaceIds: [...(spacesById.get(id) ?? [])].sort(),
  }));

  const options = { minTagged: MIN_TAGGED, curatedOnly: CURATED_ONLY };
  const report = buildReport(topics, options);

  if (AS_JSON) {
    console.log(JSON.stringify({ ...options, ...report }, null, 2));
  } else {
    console.log(formatReport(report, options));
  }

  if (STRICT && report.reportable.length > 0) process.exit(1);
}

await main();
