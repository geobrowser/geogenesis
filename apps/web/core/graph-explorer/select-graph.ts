import { claimBand } from './claim-band';
import type { GraphEdge, GraphHop2, GraphNode } from './fetch-graph-neighbourhood';
import { GRAPH_KINDS, type GraphKind } from './graph-kinds';

export type GraphCaps = { hop1: number; hop2Each: number; hop2Total: number; cross: number };

export const DESKTOP_GRAPH_CAPS: GraphCaps = { hop1: 14, hop2Each: 2, hop2Total: 26, cross: 40 };
export const PHONE_GRAPH_CAPS: GraphCaps = { hop1: 8, hop2Each: 1, hop2Total: 6, cross: 40 };

/** A chip: every kind, or one kind (topics always stay, as the design keeps its hub). */
export type GraphKindFilter = GraphKind | 'all';

export type Candidate = { node: GraphNode; edge: GraphEdge };

export type SelectedNode = { node: GraphNode; hop: 0 | 1 | 2; parentId: string | null };
/** `hop` 3 is a cross-link between two shown nodes. */
export type SelectedLink = { edge: GraphEdge; hop: 1 | 2 | 3 };
export type GraphSelection = { nodes: SelectedNode[]; links: SelectedLink[] };

const BAND_ORDER = ['agreed', 'contested', 'rejected'] as const;

function keeps(node: GraphNode, kindFilter: GraphKindFilter) {
  return kindFilter === 'all' || node.kind === kindFilter || node.kind === 'topic';
}

/** Claims with responses first, alternating across the agreement bands; unanswered claims after. */
function orderClaims(claims: Candidate[]): Candidate[] {
  const bands: Candidate[][] = [[], [], []];
  const unanswered: Candidate[] = [];
  const byVotes = [...claims].sort((a, b) => b.node.agrees + b.node.disagrees - (a.node.agrees + a.node.disagrees));
  for (const claim of byVotes) {
    const band = claimBand(claim.node.agrees, claim.node.disagrees);
    if (band) bands[BAND_ORDER.indexOf(band)].push(claim);
    else unanswered.push(claim);
  }
  const ordered: Candidate[] = [];
  for (let round = 0; bands.some(band => band[round]); round++)
    for (const band of bands) if (band[round]) ordered.push(band[round]);
  return [...ordered, ...unanswered];
}

/**
 * Up to `cap` neighbours, taking one of each kind in priority order per round so no kind floods
 * the graph. Within a kind: claims by band, others by type rank, then API order.
 */
export function pickNeighbours(
  candidates: readonly Candidate[],
  cap: number,
  taken: ReadonlySet<string>,
  kindFilter: GraphKindFilter
): Candidate[] {
  const seen = new Set<string>();
  const byKind = new Map<GraphKind, Candidate[]>();
  candidates.forEach(candidate => {
    const { node } = candidate;
    if (taken.has(node.id) || seen.has(node.id) || !keeps(node, kindFilter)) return;
    seen.add(node.id);
    byKind.set(node.kind, [...(byKind.get(node.kind) ?? []), candidate]);
  });
  for (const [kind, list] of byKind) {
    byKind.set(
      kind,
      kind === 'claim'
        ? orderClaims(list)
        : list
            .map((item, index) => ({ item, index }))
            .sort((a, b) => a.item.node.typeRank - b.item.node.typeRank || a.index - b.index)
            .map(({ item }) => item)
    );
  }
  const kinds = GRAPH_KINDS.filter(kind => byKind.has(kind));
  const picked: Candidate[] = [];
  for (let round = 0; picked.length < cap && kinds.some(kind => byKind.get(kind)![round]); round++)
    for (const kind of kinds) {
      const next = byKind.get(kind)![round];
      if (next && picked.length < cap) picked.push(next);
    }
  return picked;
}

/** The hop-1 picks, which decide what hop 2 asks for. */
export function selectHop1(
  centreId: string,
  neighbours: readonly Candidate[],
  caps: GraphCaps,
  kindFilter: GraphKindFilter
): Candidate[] {
  return pickNeighbours(neighbours, caps.hop1, new Set([centreId]), kindFilter);
}

/**
 * The design's selection: hop-1 picks, then a few of each one's own neighbours, then cross-links
 * among everything shown. `noExpand` nodes (the scope's topic hub) get no hop-2 neighbours.
 */
export function selectGraph({
  centre,
  neighbours,
  hop2,
  crossLinks,
  caps,
  kindFilter,
  noExpand = new Set(),
}: {
  centre: GraphNode;
  neighbours: readonly Candidate[];
  hop2: GraphHop2 | null;
  crossLinks: readonly GraphEdge[] | null;
  caps: GraphCaps;
  kindFilter: GraphKindFilter;
  noExpand?: ReadonlySet<string>;
}): GraphSelection {
  const nodes: SelectedNode[] = [{ node: centre, hop: 0, parentId: null }];
  const links: SelectedLink[] = [];
  const taken = new Set([centre.id]);

  for (const { node, edge } of selectHop1(centre.id, neighbours, caps, kindFilter)) {
    taken.add(node.id);
    nodes.push({ node, hop: 1, parentId: centre.id });
    links.push({ edge, hop: 1 });
  }

  let hop2Count = 0;
  for (const parent of nodes.filter(entry => entry.hop === 1)) {
    if (!hop2 || hop2Count >= caps.hop2Total || noExpand.has(parent.node.id)) continue;
    for (const { node, edge } of pickNeighbours(hop2[parent.node.id] ?? [], caps.hop2Each, taken, kindFilter)) {
      if (hop2Count >= caps.hop2Total) break;
      taken.add(node.id);
      hop2Count++;
      nodes.push({ node, hop: 2, parentId: parent.node.id });
      links.push({ edge, hop: 2 });
    }
  }

  const pairs = new Set(links.map(({ edge }) => pairKey(edge.fromId, edge.toId)));
  let crossCount = 0;
  for (const edge of crossLinks ?? []) {
    if (crossCount >= caps.cross) break;
    const key = pairKey(edge.fromId, edge.toId);
    if (!taken.has(edge.fromId) || !taken.has(edge.toId) || pairs.has(key)) continue;
    if (noExpand.has(edge.fromId) || noExpand.has(edge.toId)) continue;
    pairs.add(key);
    crossCount++;
    links.push({ edge, hop: 3 });
  }

  return { nodes, links };
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Kinds with at least one node around the centre, in priority order: the chips to show. */
export function presentKinds(neighbours: readonly Candidate[]): GraphKind[] {
  const present = new Set(neighbours.map(({ node }) => node.kind));
  return GRAPH_KINDS.filter(kind => present.has(kind));
}
