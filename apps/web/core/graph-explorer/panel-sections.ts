import { ARTICLE_TYPE_ID } from '~/core/topics/ontology';
import { normId } from '~/core/utils/norm-id';

import { type ClaimBand, MIN_RESPONSES_FOR_BAND, agreePercent, claimBand } from './claim-band';
import type { GraphNode } from './fetch-graph-neighbourhood';
import { GRAPH_KIND_REDUNDANT_LABELS, type GraphKind, isGenericRelationLabel } from './graph-kinds';
import type { GraphKindFilter, GraphSelection } from './select-graph';
import type { Spoke } from './spokes';
import type { SummarisedClaim } from './topic-claims-summary';

export { MIN_RESPONSES_FOR_BAND };

export const OVERVIEW_ROWS = 4;
/** Rows a group shows before "Show all". */
export const GROUP_ROWS = 6;

/** The prototype's panel order. */
export const PANEL_KIND_ORDER: readonly GraphKind[] = [
  'claim',
  'case',
  'ent',
  'event',
  'story',
  'src',
  'topic',
  'other',
];

export type Counts = { positive: number; negative: number };

/** Percent and band only from MIN_RESPONSES_FOR_BAND responses. */
export function shownAgreement(counts: Counts | undefined): {
  total: number;
  percent: number | null;
  band: ClaimBand | null;
} {
  const total = counts ? counts.positive + counts.negative : 0;
  if (!counts || total < MIN_RESPONSES_FOR_BAND) return { total, percent: null, band: null };
  return {
    total,
    percent: agreePercent(counts.positive, counts.negative),
    band: claimBand(counts.positive, counts.negative),
  };
}

export function votesLabel(total: number) {
  return `${total.toLocaleString('en-US')} ${total === 1 ? 'vote' : 'votes'}`;
}

/** "62% agree · 140 votes", or only the count below the threshold. */
export function agreementLine(counts: Counts | undefined): string | null {
  if (!counts) return null;
  const { total, percent } = shownAgreement(counts);
  if (total === 0) return 'No votes yet';
  return percent === null ? votesLabel(total) : `${percent}% agree · ${votesLabel(total)}`;
}

/** The topic's most-voted claims in one band, from the summary's space-scoped counts. */
export function topClaimsInBand(claims: readonly SummarisedClaim[], band: ClaimBand, limit = OVERVIEW_ROWS) {
  return claims
    .filter(claim => claim.positive + claim.negative >= MIN_RESPONSES_FOR_BAND && claim.band === band)
    .sort((a, b) => b.positive + b.negative - (a.positive + a.negative) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** People and groups on the loaded map, by how many of its lines touch them. */
export function mostLinked(selection: GraphSelection | null, centreId: string, limit = OVERVIEW_ROWS) {
  if (!selection) return [];
  const centre = normId(centreId);
  const links = new Map<string, number>();
  for (const { edge } of selection.links)
    for (const id of new Set([normId(edge.fromId), normId(edge.toId)])) links.set(id, (links.get(id) ?? 0) + 1);
  const seen = new Set<string>();
  const people: Array<{ node: GraphNode; links: number }> = [];
  for (const { node } of selection.nodes) {
    const id = normId(node.id);
    if (node.kind !== 'ent' || id === centre || seen.has(id) || !node.name) continue;
    seen.add(id);
    const count = links.get(id) ?? 0;
    if (count > 0) people.push({ node, links: count });
  }
  return people
    .sort((a, b) => b.links - a.links || (a.node.name ?? '').localeCompare(b.node.name ?? ''))
    .slice(0, limit);
}

function isNews(node: GraphNode) {
  return node.kind === 'story' || (node.kind === 'src' && node.types.some(type => normId(type.id) === ARTICLE_TYPE_ID));
}

/** Dated news stories and articles, newest first; undated ones are left out rather than guessed. */
export function latestNews(nodes: Iterable<GraphNode>, limit = OVERVIEW_ROWS) {
  const byId = new Map<string, { node: GraphNode; time: number }>();
  for (const node of nodes) {
    if (!isNews(node) || !node.name || !node.date) continue;
    const time = Date.parse(node.date);
    if (Number.isNaN(time)) continue;
    byId.set(normId(node.id), { node, time });
  }
  return [...byId.values()].sort((a, b) => b.time - a.time).slice(0, limit);
}

function spokeKind(spoke: Spoke, nodes: ReadonlyMap<string, GraphNode>): GraphKind {
  return nodes.get(normId(spoke.entity.id))?.kind ?? 'other';
}

/** The spokes a chip keeps in the panel, as the map keeps its nodes: all of them, or one kind's. */
export function spokesOfKind(
  spokes: Spoke[],
  nodes: ReadonlyMap<string, GraphNode>,
  kindFilter: GraphKindFilter
): Spoke[] {
  return kindFilter === 'all' ? spokes : spokes.filter(spoke => spokeKind(spoke, nodes) === kindFilter);
}

export type NeighbourGroup = { kind: GraphKind; spokes: Array<{ spoke: Spoke; node: GraphNode | undefined }> };

/** Neighbours grouped by kind in PANEL_KIND_ORDER; a spoke with no known node is Other. */
export function groupByKind(spokes: readonly Spoke[], nodes: ReadonlyMap<string, GraphNode>): NeighbourGroup[] {
  const groups = new Map<GraphKind, NeighbourGroup['spokes']>();
  for (const spoke of spokes) {
    const node = nodes.get(normId(spoke.entity.id));
    const kind = spokeKind(spoke, nodes);
    groups.set(kind, [...(groups.get(kind) ?? []), { spoke, node }]);
  }
  return PANEL_KIND_ORDER.flatMap(kind => {
    const list = groups.get(kind);
    return list ? [{ kind, spokes: list }] : [];
  });
}

function labelKey(label: string) {
  return label.trim().toLowerCase().replace(/s$/, '');
}

/**
 * A row's line above (its relations) and below (its type and date). The line above keeps only
 * relations that say how the row connects: never a generic "related" label, a label its group's
 * heading already says, or one that only repeats the row's own type below.
 */
export function rowLabels({
  kind,
  relations,
  typeLabel = null,
  date = null,
}: {
  kind: GraphKind;
  relations: readonly string[];
  typeLabel?: string | null;
  date?: string | null;
}): { relation: string | null; sub: string | null } {
  const redundant = new Set(GRAPH_KIND_REDUNDANT_LABELS[kind].map(labelKey));
  const type = typeLabel && !redundant.has(labelKey(typeLabel)) ? typeLabel : null;
  const shown = relations.filter(
    label =>
      !isGenericRelationLabel(label) &&
      !redundant.has(labelKey(label)) &&
      !(typeLabel && labelKey(label) === labelKey(typeLabel))
  );
  return {
    relation: shown.join(' · ') || null,
    sub: [type, date].filter(Boolean).join(' · ') || null,
  };
}

/** Banded claims per band, for the Claims group's bar: only claims past the threshold count. */
export function bandTally(counts: ReadonlyArray<Counts | undefined>) {
  const bands: Record<ClaimBand, number> = { agreed: 0, contested: 0, rejected: 0 };
  let banded = 0;
  for (const entry of counts) {
    const band = shownAgreement(entry).band;
    if (band) {
      bands[band]++;
      banded++;
    }
  }
  return { bands, banded };
}
