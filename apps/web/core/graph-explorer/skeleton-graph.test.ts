import { describe, expect, it } from 'vitest';

import { DESKTOP_GRAPH_CAPS, PHONE_GRAPH_CAPS } from './select-graph';
import { SKELETON_SELECTION, isSkeletonSelection, staticSkeleton } from './skeleton-graph';

describe('skeleton graph', () => {
  it('stays inside the caps, with a centre, both node shapes and a link per node', () => {
    for (const [selection, caps] of [
      [SKELETON_SELECTION.desktop, DESKTOP_GRAPH_CAPS],
      [SKELETON_SELECTION.phone, PHONE_GRAPH_CAPS],
    ] as const) {
      const hop = (n: number) => selection.nodes.filter(entry => entry.hop === n).length;
      expect(hop(0)).toBe(1);
      expect(hop(1)).toBeLessThanOrEqual(caps.hop1);
      expect(hop(2)).toBeLessThanOrEqual(caps.hop2Total);
      expect(new Set(selection.nodes.map(entry => entry.node.kind))).toEqual(new Set(['ent', 'claim']));
      expect(selection.links).toHaveLength(selection.nodes.length - 1);
      expect(isSkeletonSelection(selection)).toBe(true);
    }
    expect(SKELETON_SELECTION.phone.nodes.length).toBeLessThan(SKELETON_SELECTION.desktop.nodes.length);
  });

  it('places the server-rendered skeleton the same way every time, on the stage', () => {
    expect(staticSkeleton(false)).toEqual(staticSkeleton(false));
    expect(staticSkeleton(true)).toEqual(staticSkeleton(true));
    const centre = staticSkeleton(false)[0];
    expect(centre.hop).toBe(0);
    expect(centre.left).toBeCloseTo(50, 0);
    for (const node of [...staticSkeleton(false), ...staticSkeleton(true)])
      expect(Number.isFinite(node.left) && Number.isFinite(node.top)).toBe(true);
  });
});
