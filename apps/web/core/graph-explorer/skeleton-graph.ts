import type { GraphNode } from './fetch-graph-neighbourhood';
import { DESKTOP_LAYOUT, PHONE_LAYOUT, fitDistance, hash01, project, simulateLayout } from './layout-3d';
import { isPhonePin, pinMarkerScale } from './pin-name';
import type { GraphSelection, SelectedNode } from './select-graph';

const SKELETON_PREFIX = 'skeleton:';

/** Placeholder nodes drawn while the first graph loads; never focusable or clickable. */
export function isSkeletonNode(node: Pick<GraphNode, 'id'>): boolean {
  return node.id.startsWith(SKELETON_PREFIX);
}

export function isSkeletonSelection(selection: GraphSelection): boolean {
  return selection.nodes.length > 0 && selection.nodes.every(entry => isSkeletonNode(entry.node));
}

/** Within the real caps: desktop 14 hop 1 / 26 hop 2, phone 8 / 6. */
const SKELETON_SIZES = { desktop: { hop1: 9, hop2: 6 }, phone: { hop1: 6, hop2: 3 } };

function skeletonNode(id: string, kind: 'ent' | 'claim'): GraphNode {
  return {
    id,
    name: null,
    image: null,
    types: [],
    spaceIds: [],
    namedSpaceIds: [],
    kind,
    typeRank: 0,
    placedSpaceIds: [],
    date: null,
    agrees: 0,
    disagrees: 0,
  };
}

/** A fixed-seed graph: the same ids, kinds and so layout every time. */
function buildSkeleton(phone: boolean): GraphSelection {
  const size = phone ? SKELETON_SIZES.phone : SKELETON_SIZES.desktop;
  const centreId = `${SKELETON_PREFIX}centre`;
  const nodes: SelectedNode[] = [{ node: skeletonNode(centreId, 'ent'), hop: 0, parentId: null }];
  const hop1: string[] = [];
  for (let i = 0; i < size.hop1; i++) {
    const id = `${SKELETON_PREFIX}1-${i}`;
    hop1.push(id);
    nodes.push({ node: skeletonNode(id, i % 3 === 1 ? 'claim' : 'ent'), hop: 1, parentId: centreId });
  }
  for (let i = 0; i < size.hop2; i++) {
    const id = `${SKELETON_PREFIX}2-${i}`;
    const parentId = hop1[Math.floor(hash01(`${id}p`) * hop1.length)];
    nodes.push({ node: skeletonNode(id, i % 2 === 0 ? 'claim' : 'ent'), hop: 2, parentId });
  }
  const links = nodes.flatMap(entry =>
    entry.parentId
      ? [
          {
            edge: {
              id: `${entry.parentId}>${entry.node.id}`,
              fromId: entry.parentId,
              toId: entry.node.id,
              propertyId: '',
              propertyName: null,
              spaceId: '',
            },
            hop: entry.hop as 1 | 2,
          },
        ]
      : []
  );
  return { nodes, links };
}

export const SKELETON_SELECTION = { desktop: buildSkeleton(false), phone: buildSkeleton(true) };

/** The view a fresh map opens at; the canvas starts from the same yaw and pitch. */
export const INITIAL_VIEW = { yaw: 0.6, pitch: -0.28 };
/** Stage sizes the server-rendered skeleton is placed for: desktop beside the panel, phone at 62vh. */
const NOMINAL_STAGE = { desktop: { width: 920, height: 800 }, phone: { width: 390, height: 520 } };

export type StaticSkeletonNode = {
  id: string;
  kind: 'ent' | 'claim';
  hop: 0 | 1 | 2;
  /** Percent of the stage, so the server markup fits any stage size. */
  left: number;
  top: number;
  scale: number;
  /** A phone pin's marker scale; its node draws at scale 1. */
  markerScale?: number;
  opacity: number;
};

/** The skeleton as the canvas first draws it, as pure math so server and client agree. */
export function staticSkeleton(phone: boolean): StaticSkeletonNode[] {
  const selection = SKELETON_SELECTION[phone ? 'phone' : 'desktop'];
  const { width, height } = NOMINAL_STAGE[phone ? 'phone' : 'desktop'];
  const ids = selection.nodes.map(entry => entry.node.id);
  const target = simulateLayout({
    ids,
    links: selection.nodes.flatMap(entry =>
      entry.parentId ? [{ a: entry.parentId, b: entry.node.id, hop: entry.hop as 1 | 2 }] : []
    ),
    centreId: ids[0],
    previous: new Map(),
    settings: phone ? PHONE_LAYOUT : DESKTOP_LAYOUT,
  });
  const near = selection.nodes.filter(entry => entry.hop < 2).map(entry => target.get(entry.node.id)!);
  const distance = fitDistance(near, width, height, phone);
  return selection.nodes.map(entry => {
    const point = project(target.get(entry.node.id)!, { ...INITIAL_VIEW, distance, width, height });
    const round = (value: number) => Math.round(value * 100) / 100;
    const pin = isPhonePin(phone, entry.hop, entry.hop === 0);
    return {
      id: entry.node.id,
      kind: entry.node.kind as 'ent' | 'claim',
      hop: entry.hop,
      left: round((point.x / width) * 100),
      top: round((point.y / height) * 100),
      scale: pin ? 1 : round(Math.max(0.3, Math.min(1.2, point.scale * (entry.hop === 2 ? 0.95 : 1)))),
      ...(pin && { markerScale: round(pinMarkerScale(point.scale)) }),
      opacity: round(Math.max(0.28, Math.min(1, 1 - (point.depth + 150) / 1100))),
    };
  });
}
