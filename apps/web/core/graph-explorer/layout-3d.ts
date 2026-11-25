/** The battleground design's 3D spring layout and projection, ported as pure functions. */

export type Vec3 = [number, number, number];

/** 1 = hop 1, 2 = hop 2, 3 = cross-link (drawn, but no spring). */
export type LayoutLink = { a: string; b: string; hop: 1 | 2 | 3 };

export type LayoutSettings = { restLength: Record<1 | 2, number>; repulsion: number; iterations: number };

export const DESKTOP_LAYOUT: LayoutSettings = { restLength: { 1: 360, 2: 170 }, repulsion: 150_000, iterations: 320 };
/** Longer than the design's 180/100: our phone cards carry more text. */
export const PHONE_LAYOUT: LayoutSettings = { restLength: { 1: 250, 2: 130 }, repulsion: 80_000, iterations: 320 };

/** FNV-1a to [0, 1): seeds positions so the same graph always lays out the same way. */
export function hash01(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0) / 4294967296;
}

/**
 * Positions for `ids`, centre pinned at the origin. A node already on screen starts where it is; a
 * new one starts by its parent, so a re-centre grows out of the nodes it came from.
 */
export function simulateLayout({
  ids,
  links,
  centreId,
  previous,
  settings,
}: {
  ids: readonly string[];
  links: readonly LayoutLink[];
  centreId: string;
  previous: ReadonlyMap<string, Vec3>;
  settings: LayoutSettings;
}): Map<string, Vec3> {
  const parent = new Map<string, string>();
  for (const link of links) if (link.hop < 3 && !parent.has(link.b)) parent.set(link.b, link.a);

  const positions = new Map<string, Vec3>();
  const place = (id: string, depth = 0): Vec3 => {
    const known = positions.get(id) ?? previous.get(id);
    if (known) return known;
    const parentId = parent.get(id);
    const origin: Vec3 = parentId && depth < 4 ? place(parentId, depth + 1) : [0, 0, 0];
    return [
      origin[0] + (hash01(`${id}x`) - 0.5) * 60,
      origin[1] + (hash01(`${id}y`) - 0.5) * 60,
      origin[2] + (hash01(`${id}z`) - 0.5) * 60,
    ];
  };
  for (const id of ids) positions.set(id, [...place(id)] as Vec3);

  const offset = positions.get(centreId) ?? [0, 0, 0];
  const nodes = ids.map(id => {
    const p = positions.get(id)!;
    return [p[0] - offset[0], p[1] - offset[1], p[2] - offset[2]] as Vec3;
  });
  const index = new Map(ids.map((id, i) => [id, i]));
  const springs = links
    .filter(link => link.hop < 3 && index.has(link.a) && index.has(link.b))
    .map(link => ({ a: index.get(link.a)!, b: index.get(link.b)!, rest: settings.restLength[link.hop as 1 | 2] }));
  const centre = index.get(centreId);
  const force = nodes.map(() => [0, 0, 0]);

  for (let iteration = 0; iteration < settings.iterations; iteration++) {
    for (const f of force) f[0] = f[1] = f[2] = 0;
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const A = nodes[i];
        const B = nodes[j];
        let dx = A[0] - B[0];
        let dy = A[1] - B[1];
        let dz = A[2] - B[2];
        // Coincident nodes have no direction to repel along; give each pair a fixed one.
        if (dx * dx + dy * dy + dz * dz < 1e-6) {
          const pair = `${ids[i]}|${ids[j]}`;
          [dx, dy, dz] = [hash01(`${pair}x`) - 0.5, hash01(`${pair}y`) - 0.5, hash01(`${pair}z`) - 0.5];
        }
        const d2 = dx * dx + dy * dy + dz * dz + 1;
        const push = settings.repulsion / d2;
        const d = Math.sqrt(d2);
        dx /= d;
        dy /= d;
        dz /= d;
        force[i][0] += dx * push;
        force[i][1] += dy * push;
        force[i][2] += dz * push;
        force[j][0] -= dx * push;
        force[j][1] -= dy * push;
        force[j][2] -= dz * push;
      }
    for (const spring of springs) {
      const A = nodes[spring.a];
      const B = nodes[spring.b];
      const dx = B[0] - A[0];
      const dy = B[1] - A[1];
      const dz = B[2] - A[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
      const pull = (d - spring.rest) * 0.08;
      force[spring.a][0] += (dx / d) * pull;
      force[spring.a][1] += (dy / d) * pull;
      force[spring.a][2] += (dz / d) * pull;
      force[spring.b][0] -= (dx / d) * pull;
      force[spring.b][1] -= (dy / d) * pull;
      force[spring.b][2] -= (dz / d) * pull;
    }
    const step = 0.9 * (1 - iteration / 340);
    for (let i = 0; i < nodes.length; i++) {
      if (i === centre) continue;
      const p = nodes[i];
      for (let axis = 0; axis < 3; axis++) {
        const g = force[i][axis] - p[axis] * 0.004;
        p[axis] += Math.max(-30, Math.min(30, g * step));
      }
      p[1] *= 0.995;
    }
    if (centre !== undefined) nodes[centre] = [0, 0, 0];
  }

  return new Map(ids.map((id, i) => [id, nodes[i]]));
}

/** Projection focal length: a point at depth 0 with the camera `distance` away draws at FOCAL_LENGTH / distance. */
export const FOCAL_LENGTH = 900;

export type View = { yaw: number; pitch: number; distance: number; width: number; height: number };

/** Portrait screens stretch the vertical axis, as the design does, to use the height. */
export function verticalStretch(width: number, height: number) {
  return height > width * 1.1 ? 1.45 : 1;
}

/** Screen x, y, scale and depth (larger is further away) for a point. */
export function project(point: Vec3, view: View): { x: number; y: number; scale: number; depth: number } {
  const cy = Math.cos(view.yaw);
  const sy = Math.sin(view.yaw);
  const cp = Math.cos(view.pitch);
  const sp = Math.sin(view.pitch);
  const x1 = point[0] * cy - point[2] * sy;
  const z1 = point[0] * sy + point[2] * cy;
  const y2 = point[1] * cp - z1 * sp;
  const z2 = point[1] * sp + z1 * cp;
  const scale = FOCAL_LENGTH / Math.max(120, view.distance + z2);
  return {
    x: view.width / 2 + x1 * scale,
    y: view.height / 2 + y2 * scale * verticalStretch(view.width, view.height),
    scale,
    depth: z2,
  };
}

/**
 * Room a phone card needs either side of its anchor, in screen pixels: half a 120px card, drawn a
 * little over full size at the default zoom (GEO-3864). Phone cards don't shrink as the camera pulls
 * back, so their margin is kept in screen pixels rather than in world units.
 */
export const PHONE_CARD_HALF_WIDTH = 64;

/** Camera distance that fits the 85th-percentile spread of the centre and hop-1 nodes. */
export function fitDistance(points: readonly Vec3[], width: number, height: number, phone: boolean): number {
  const percentile = (values: number[], fallback: number) =>
    values.sort((a, b) => a - b)[Math.floor(values.length * 0.85)] ?? fallback;
  const stretch = verticalStretch(width, height);
  const fx = percentile(
    points.map(p => Math.hypot(p[0], p[2]) + (phone ? 0 : 100)),
    300
  );
  const fy = percentile(
    points.map(p => Math.hypot(p[1], p[2]) * stretch + 50),
    300
  );
  const halfWidth = phone ? Math.max(80, width / 2 - 8 - PHONE_CARD_HALF_WIDTH) : Math.max(140, width / 2 - 8);
  const fit = Math.max((fx * FOCAL_LENGTH) / halfWidth, (fy * FOCAL_LENGTH) / Math.max(140, height / 2 - 16));
  return Math.max(700, Math.min(2600, fit));
}

export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function lerp3(from: Vec3, to: Vec3, t: number): Vec3 {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
}

/** A fixed starfield on a shell around the graph. */
export function starfield(count: number): Array<{ point: Vec3; alpha: number }> {
  return Array.from({ length: count }, (_, i) => {
    const u = hash01(`u${i}`) * 2 - 1;
    const theta = hash01(`t${i}`) * Math.PI * 2;
    const radius = 1700 + hash01(`r${i}`) * 900;
    const ring = Math.sqrt(1 - u * u);
    return {
      point: [Math.cos(theta) * ring * radius, u * radius, Math.sin(theta) * ring * radius] as Vec3,
      alpha: 0.2 + hash01(`a${i}`) * 0.5,
    };
  });
}
