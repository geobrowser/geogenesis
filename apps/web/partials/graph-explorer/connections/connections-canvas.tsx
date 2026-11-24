'use client';

import * as React from 'react';

import cx from 'classnames';
import { useReducedMotion } from 'framer-motion';

import type { GraphEdge, GraphNode } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import { useGraphAnalytics } from '~/core/graph-explorer/graph-explorer-analytics';
import {
  DESKTOP_LAYOUT,
  PHONE_LAYOUT,
  type Vec3,
  easeInOutCubic,
  fitDistance,
  hash01,
  lerp3,
  project,
  simulateLayout,
  starfield,
} from '~/core/graph-explorer/layout-3d';
import type { GraphSelection, SelectedNode } from '~/core/graph-explorer/select-graph';
import { INITIAL_VIEW, isSkeletonNode, isSkeletonSelection } from '~/core/graph-explorer/skeleton-graph';

const MOVE_MS = 950;
const LEAVE_MS = 420;
const FADE_IN_MS = 500;

/** The stage's night sky; the server-rendered skeleton stage uses it too. */
export const STAGE_BACKGROUND =
  'bg-[radial-gradient(ellipse_45%_40%_at_22%_28%,rgba(154,96,255,.16),transparent_70%),radial-gradient(ellipse_40%_35%_at_80%_74%,rgba(255,121,0,.10),transparent_70%),radial-gradient(ellipse_at_50%_45%,#1c1c21_0%,#111114_55%,#070708_100%)]';
const IDLE_ROTATE_AFTER_MS = 2600;
/** How long the idle spin runs before the loop sleeps; shorter on phone to save battery. */
const IDLE_SPIN_MS = { phone: 12_000, desktop: 45_000 };
const DRAG_THRESHOLD_PX = 5;
const MIN_DISTANCE = 420;
const MAX_DISTANCE = 2600;
const STARS = starfield(260);

type NodeView = {
  id: string;
  p: Vec3;
  from: Vec3;
  to: Vec3;
  hop: 0 | 1 | 2;
  born: number;
  alive: boolean;
  /** When it left the selection; it fades out and is removed LEAVE_MS later. */
  died: number;
  entry: SelectedNode;
  /** Screen offset keeping it clear of the centre, eased frame to frame. */
  push: [number, number];
  /** Opacity factor while a nearer card covers it on phone, eased frame to frame. */
  dim: number;
};

type DrawnLink = { a: string; b: string; hop: 1 | 2 | 3; edge: GraphEdge };

type Engine = {
  views: Map<string, NodeView>;
  links: DrawnLink[];
  centreId: string;
  yaw: number;
  pitch: number;
  distance: number;
  /** Distance at the start of a move, eased towards `fit`. */
  distanceFrom: number;
  fit: number;
  /** The centre and hop-1 targets the fit frames; refitted when the stage resizes. */
  near: Vec3[];
  userZoom: boolean;
  vy: number;
  vp: number;
  lastActive: number;
  anim: { t0: number; duration: number } | null;
  hover: string | null;
  width: number;
  height: number;
  dpr: number;
  /** Placeholders only: links are faint and carry no moving dots. */
  skeleton: boolean;
};

export type ConnectionsCanvasProps = {
  selection: GraphSelection;
  phone: boolean;
  onSelect: (node: GraphNode) => void;
  /** Hovered or focused node, for prefetching its hop; null when it leaves. */
  onPrefetch?: (id: string | null) => void;
  renderNode: (entry: SelectedNode, isCentre: boolean) => React.ReactNode;
  /** Edge label read from `fromId`'s side, shown while either end is hovered. */
  labelFor: (edge: GraphEdge, fromId: string) => string;
  /** Overlays inside the stage (legend, hint). */
  children?: React.ReactNode;
};

/**
 * DOM node buttons placed in 3D by one animation loop over a canvas of lines and stars. A drag turns
 * the map and is never a click; it turns on its own when idle unless motion is reduced.
 */
export function ConnectionsCanvas({
  selection,
  phone,
  onSelect,
  onPrefetch,
  renderNode,
  labelFor,
  children,
}: ConnectionsCanvasProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const analytics = useGraphAnalytics();
  const analyticsRef = React.useRef(analytics);
  React.useEffect(() => {
    analyticsRef.current = analytics;
  }, [analytics]);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const elements = React.useRef(new Map<string, HTMLElement>());
  const moved = React.useRef(false);
  const dragging = React.useRef(false);
  /** Removal timers; a new selection must not cancel the last one's or its leaving nodes stay. */
  const leaveTimers = React.useRef(new Set<number>());
  /** Card boxes, measured once per selection and again when a card resizes; reading layout every frame would thrash. */
  const anchors = React.useRef(new Map<string, Box>());
  const resizes = React.useRef<ResizeObserver | null>(null);
  // Created on first use: node refs attach before effects run. A resize only drops the box; the next frame re-measures.
  const watchSize = (element: HTMLElement) => {
    resizes.current ??= new ResizeObserver(entries => {
      for (const entry of entries) anchors.current.delete((entry.target as HTMLElement).dataset.nodeId ?? '');
      wake.current();
    });
    resizes.current.observe(element);
  };
  const engine = React.useRef<Engine>({
    views: new Map(),
    links: [],
    centreId: selection.nodes[0]?.node.id ?? '',
    yaw: INITIAL_VIEW.yaw,
    pitch: INITIAL_VIEW.pitch,
    distance: 1000,
    distanceFrom: 1000,
    fit: 1000,
    near: [],
    userZoom: false,
    vy: 0,
    vp: 0,
    lastActive: 0,
    anim: null,
    hover: null,
    width: 0,
    height: 0,
    dpr: 1,
    skeleton: false,
  });
  const [leaving, setLeaving] = React.useState<SelectedNode[]>([]);
  const [layoutMs, setLayoutMs] = React.useState<number | null>(null);
  const [hinted, setHinted] = React.useState(false);
  const canHover = useCanHover();
  /** Restarts the animation loop after it slept; set by the loop effect. */
  const wake = React.useRef<() => void>(() => {});
  const labelForRef = React.useRef(labelFor);
  labelForRef.current = labelFor;

  // Lay out each new selection once, starting from where its nodes are now.
  React.useLayoutEffect(() => {
    const state = engine.current;
    const now = performance.now();
    const ids = selection.nodes.map(entry => entry.node.id);
    const centreId = ids[0];
    const alive = [...state.views.values()].filter(view => view.alive);
    const previous = new Map(alive.map(view => [view.id, view.p]));
    const skeleton = isSkeletonSelection(selection);
    // Real nodes replacing a skeleton start where its placeholders are, hop by hop, as the skeleton fades.
    if (!skeleton && alive.length > 0 && alive.every(view => isSkeletonNode(view.entry.node))) {
      const byHop = [0, 1, 2].map(hop => alive.filter(view => view.hop === hop));
      const used = [0, 0, 0];
      for (const entry of selection.nodes) {
        const pool = byHop[entry.hop];
        if (pool.length > 0) previous.set(entry.node.id, pool[used[entry.hop]++ % pool.length].p);
      }
    }
    const start = performance.now();
    const target = simulateLayout({
      ids,
      links: selection.nodes.flatMap(entry =>
        entry.parentId ? [{ a: entry.parentId, b: entry.node.id, hop: entry.hop as 1 | 2 }] : []
      ),
      centreId,
      previous,
      settings: phone ? PHONE_LAYOUT : DESKTOP_LAYOUT,
    });
    setLayoutMs(Math.round(performance.now() - start));

    const kept = new Set(ids);
    const gone: string[] = [];
    for (const view of state.views.values()) {
      if (!kept.has(view.id) && view.alive) {
        view.alive = false;
        view.died = now;
        view.from = view.p;
        view.to = view.p;
        gone.push(view.id);
      }
    }
    for (const entry of selection.nodes) {
      const id = entry.node.id;
      const existing = state.views.get(id);
      const to = target.get(id)!;
      if (existing?.alive) {
        existing.from = existing.p;
        existing.to = to;
        existing.hop = entry.hop;
        existing.entry = entry;
      } else {
        const parent = entry.parentId ? state.views.get(entry.parentId) : null;
        // A skeleton opens in place; anything else grows from a placeholder, its parent or the centre.
        const p: Vec3 = skeleton
          ? [...to]
          : previous.has(id)
            ? [...previous.get(id)!]
            : parent?.alive
              ? [...parent.p]
              : [0, 0, 0];
        state.views.set(id, {
          id,
          p,
          from: p,
          to,
          hop: entry.hop,
          born: skeleton ? now - FADE_IN_MS : now,
          alive: true,
          died: 0,
          entry,
          push: [0, 0],
          dim: 1,
        });
      }
    }
    state.links = selection.links.map(link => ({
      a: link.edge.fromId,
      b: link.edge.toId,
      hop: link.hop,
      edge: link.edge,
    }));
    state.centreId = centreId;
    state.hover = null;
    anchors.current.clear();

    state.near = selection.nodes.filter(entry => entry.hop < 2).map(entry => target.get(entry.node.id)!);
    // Before the stage is measured this is a guess; the sizing effect refits once it knows the size.
    state.fit = fitDistance(state.near, state.width || 1280, state.height || 860, phone);
    state.distanceFrom = state.distance;
    state.anim = { t0: now, duration: reduceMotion ? 0 : MOVE_MS };
    // Each selection, the first included, restarts the idle clock so the spin follows it. A skeleton
    // spins at once, as there is nothing to read yet.
    state.lastActive = skeleton ? now - IDLE_ROTATE_AFTER_MS : now;
    state.skeleton = skeleton;
    wake.current();

    const sweep = () => {
      const cutoff = performance.now() - LEAVE_MS;
      for (const view of state.views.values()) if (!view.alive && view.died <= cutoff) state.views.delete(view.id);
      setLeaving([...state.views.values()].filter(view => !view.alive).map(view => view.entry));
    };
    sweep();
    if (gone.length === 0) return;
    const timers = leaveTimers.current;
    // A frame of slack, so timer rounding never leaves a node behind.
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      sweep();
    }, LEAVE_MS + 16);
    timers.add(timer);
  }, [selection, phone, reduceMotion]);

  React.useEffect(() => {
    const timers = leaveTimers.current;
    return () => {
      timers.forEach(timer => window.clearTimeout(timer));
      resizes.current?.disconnect();
      resizes.current = null;
    };
  }, []);

  const shown = React.useMemo(() => {
    const ids = new Set(selection.nodes.map(entry => entry.node.id));
    return [...selection.nodes, ...leaving.filter(entry => !ids.has(entry.node.id))];
  }, [leaving, selection]);

  // Size the canvas to the stage.
  React.useLayoutEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const resize = () => {
      const rect = stage.getBoundingClientRect();
      const state = engine.current;
      state.width = rect.width;
      state.height = rect.height;
      state.dpr = Math.min(phone ? 1.5 : 2, window.devicePixelRatio || 1);
      canvas.width = rect.width * state.dpr;
      canvas.height = rect.height * state.dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      if (rect.width > 0 && rect.height > 0) {
        state.fit = fitDistance(state.near, rect.width, rect.height, phone);
        // A running move eases to the new fit itself; a manual zoom is left alone.
        if (!state.userZoom && !state.anim) state.distance = state.fit;
      }
      wake.current();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [phone]);

  // The animation loop: sleeps once nothing moves, and while the tab is hidden or the stage is off-screen.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    const stage = stageRef.current;
    if (!canvas || !context || !stage) return;
    let raf = 0;
    let onScreen = true;
    const spinMs = phone ? IDLE_SPIN_MS.phone : IDLE_SPIN_MS.desktop;

    const frame = (now: number) => {
      raf = 0;
      const state = engine.current;
      let moving = state.anim !== null || dragging.current || Math.abs(state.vy) + Math.abs(state.vp) > 1e-4;
      const idle = now - state.lastActive;
      const spinning = !reduceMotion && idle > IDLE_ROTATE_AFTER_MS && idle < IDLE_ROTATE_AFTER_MS + spinMs;
      if (!reduceMotion && idle <= IDLE_ROTATE_AFTER_MS + spinMs) moving = true;
      if (!dragging.current) {
        state.yaw += state.vy;
        state.pitch += state.vp;
        state.vy *= 0.93;
        state.vp *= 0.93;
        if (spinning) state.yaw += 0.0011;
      }
      state.pitch = Math.max(-1.25, Math.min(1.25, state.pitch));
      if (state.anim) {
        const t = state.anim.duration ? Math.min(1, (now - state.anim.t0) / state.anim.duration) : 1;
        const eased = easeInOutCubic(t);
        for (const view of state.views.values()) if (view.alive) view.p = lerp3(view.from, view.to, eased);
        if (!state.userZoom) state.distance = state.distanceFrom + (state.fit - state.distanceFrom) * eased;
        if (t >= 1) state.anim = null;
      }

      const view = {
        yaw: state.yaw,
        pitch: state.pitch,
        distance: state.distance,
        width: state.width,
        height: state.height,
      };
      const projected = new Map<string, ReturnType<typeof project>>();
      for (const node of state.views.values()) projected.set(node.id, project(node.p, view));

      const hover = state.hover && state.views.get(state.hover)?.alive ? state.hover : null;
      const neighbours = new Set<string>();
      if (hover)
        for (const link of state.links) {
          if (link.a === hover) neighbours.add(link.b);
          if (link.b === hover) neighbours.add(link.a);
        }

      const measure = (id: string, element: HTMLElement) => {
        let box = anchors.current.get(id);
        if (!box) {
          box = { anchor: anchorY(element), width: element.offsetWidth, height: element.offsetHeight };
          anchors.current.set(id, box);
        }
        return box;
      };
      const centreElement = elements.current.get(state.centreId);
      const centrePoint = projected.get(state.centreId);
      // Every other node is kept off this box, at the scale the centre is drawn at.
      const centreRect =
        centreElement && centrePoint
          ? rectAt(
              centrePoint.x,
              centrePoint.y,
              measure(state.centreId, centreElement),
              nodeScale(true, 0, centrePoint.scale, phone)
            )
          : null;

      const drawn: Array<{
        node: NodeView;
        element: HTMLElement;
        point: ReturnType<typeof project>;
        box: Box;
        scale: number;
        opacity: number;
        isCentre: boolean;
      }> = [];
      for (const node of state.views.values()) {
        const element = elements.current.get(node.id);
        const point = projected.get(node.id);
        if (!element || !point) continue;
        const isCentre = node.id === state.centreId;
        const fog = Math.max(0.28, Math.min(1, 1 - (point.depth + 150) / 1100));
        const scale = nodeScale(isCentre, node.hop, point.scale, phone);
        let opacity = node.alive ? fog : 0;
        if (hover && node.id !== hover && !neighbours.has(node.id)) opacity *= 0.22;
        if (node.id === hover && node.alive) opacity = 1;
        if (node.alive && !reduceMotion && now - node.born < FADE_IN_MS) {
          opacity *= (now - node.born) / FADE_IN_MS;
          moving = true;
        }
        const box = measure(node.id, element);
        if (centreRect && !isCentre && node.alive) {
          const rect = rectAt(point.x, point.y, box, scale);
          const target = clearance(centreRect, rect);
          const ease = reduceMotion ? 1 : 0.2;
          if (Math.abs(target[0] - node.push[0]) + Math.abs(target[1] - node.push[1]) > 0.5) moving = true;
          const eased: [number, number] = [
            node.push[0] + (target[0] - node.push[0]) * ease,
            node.push[1] + (target[1] - node.push[1]) * ease,
          ];
          // Easing may only move a card around the centre, never across it.
          node.push = overlaps(centreRect, shifted(rect, eased)) ? target : eased;
        } else if (isCentre) node.push = [0, 0];
        point.x += node.push[0];
        point.y += node.push[1];
        drawn.push({ node, element, point, box, scale, opacity, isCentre });
      }

      // On phone a card covered by a nearer one fades, so the front one reads.
      for (const entry of drawn) {
        let covered = false;
        if (phone && !entry.isCentre && entry.node.alive && entry.node.id !== hover && !neighbours.has(entry.node.id)) {
          const rect = rectAt(entry.point.x, entry.point.y, entry.box, entry.scale);
          covered = drawn.some(
            other =>
              other !== entry &&
              !other.isCentre &&
              other.node.alive &&
              other.opacity > 0.3 &&
              other.point.depth < entry.point.depth &&
              overlapShare(rect, rectAt(other.point.x, other.point.y, other.box, other.scale)) > 0.25
          );
        }
        const target = covered ? 0.2 : 1;
        if (Math.abs(target - entry.node.dim) > 0.01) moving = true;
        entry.node.dim += (target - entry.node.dim) * (reduceMotion ? 1 : 0.2);
      }

      for (const { node, element, point, box, scale, opacity, isCentre } of drawn) {
        const anchor = box.anchor;
        element.style.transformOrigin = `50% ${anchor}px`;
        element.style.transform = `translate3d(${point.x.toFixed(1)}px,${point.y.toFixed(1)}px,0) translate(-50%,-${anchor}px) scale(${scale.toFixed(3)})`;
        element.style.opacity = (opacity * node.dim).toFixed(3);
        element.style.zIndex = String(
          node.id === hover
            ? 9500
            : isCentre
              ? 8500
              : 5000 - Math.round(point.depth) + (neighbours.has(node.id) ? 2000 : 0)
        );
      }

      context.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      context.clearRect(0, 0, state.width, state.height);
      for (const star of STARS) {
        const point = project(star.point, view);
        if (point.depth < -state.distance + 50) continue;
        context.fillStyle = `rgba(255,255,255,${(star.alpha * Math.min(1, point.scale * 2.4)).toFixed(3)})`;
        context.fillRect(point.x, point.y, 1.4, 1.4);
      }
      for (const link of state.links) {
        const A = projected.get(link.a);
        const B = projected.get(link.b);
        if (!A || !B) continue;
        const on = hover !== null && (link.a === hover || link.b === hover);
        const fog = Math.max(0.25, Math.min(1, 1 - ((A.depth + B.depth) / 2 + 150) / 1100));
        let alpha = (link.hop === 1 ? 0.34 : link.hop === 2 ? 0.2 : 0.08) * fog * (state.skeleton ? 0.45 : 1);
        if (hover) alpha = on ? 0.9 : alpha * 0.3;
        context.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        context.lineWidth = on ? 1.6 : link.hop === 1 ? 1.1 : 0.8;
        context.beginPath();
        context.moveTo(A.x, A.y);
        context.lineTo(B.x, B.y);
        context.stroke();
        if (!reduceMotion && !state.skeleton && link.hop < 3 && (!hover || on)) {
          for (let q = 0; q < (link.hop === 1 ? 2 : 1); q++) {
            const t = (now / (link.hop === 1 ? 2200 : 3000) + hash01(link.a + link.b + q)) % 1;
            context.fillStyle = `rgba(255,255,255,${(on ? 0.95 : 0.6 * fog).toFixed(3)})`;
            context.beginPath();
            context.arc(
              A.x + (B.x - A.x) * t,
              A.y + (B.y - A.y) * t,
              (on ? 2.4 : 1.7) * Math.min(1.4, (A.scale + B.scale) / 2),
              0,
              Math.PI * 2
            );
            context.fill();
          }
        }
      }
      if (hover) {
        context.font = '500 12px system-ui, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        for (const link of state.links) {
          if (link.a !== hover && link.b !== hover) continue;
          const A = projected.get(link.a);
          const B = projected.get(link.b);
          if (!A || !B) continue;
          const text = labelForRef.current(link.edge, hover);
          const x = (A.x + B.x) / 2;
          const y = (A.y + B.y) / 2;
          const width = context.measureText(text).width + 14;
          context.fillStyle = '#fff';
          context.beginPath();
          if (context.roundRect) context.roundRect(x - width / 2, y - 11, width, 22, 11);
          else context.rect(x - width / 2, y - 11, width, 22);
          context.fill();
          context.fillStyle = '#151515';
          context.fillText(text, x, y + 1);
        }
      }
      if (moving) start();
    };

    const start = () => {
      if (!raf && onScreen && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    wake.current = start;
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    const sight = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      if (onScreen) start();
      else stop();
    });
    sight.observe(stage);
    start();
    return () => {
      stop();
      wake.current = () => {};
      sight.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [phone, reduceMotion]);

  // Drag to turn, two pointers to pinch, wheel to zoom.
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const pointers = new Map<number, [number, number]>();
    let origin: [number, number] | null = null;
    const active = () => {
      setHinted(true);
      engine.current.lastActive = performance.now();
      wake.current();
    };
    const down = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('[data-stage-control]')) return;
      pointers.set(event.pointerId, [event.clientX, event.clientY]);
      moved.current = false;
      dragging.current = true;
      origin = [event.clientX, event.clientY];
      active();
    };
    const move = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (!previous || !origin) return;
      pointers.set(event.pointerId, [event.clientX, event.clientY]);
      const state = engine.current;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const others = [...pointers.entries()].map(([id, p]) => (id === event.pointerId ? previous : p));
        const now = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const before = Math.hypot(others[0][0] - others[1][0], others[0][1] - others[1][1]);
        if (before > 0 && now > 0) {
          state.userZoom = true;
          state.distance = clampDistance((state.distance * before) / now);
        }
        analyticsRef.current?.interacted({ interaction: 'zoom', value: 'gesture' });
        moved.current = true;
        active();
        return;
      }
      if (Math.abs(event.clientX - origin[0]) + Math.abs(event.clientY - origin[1]) > DRAG_THRESHOLD_PX)
        moved.current = true;
      if (moved.current) {
        analyticsRef.current?.interacted({ interaction: 'rotate' });
        state.vy = (event.clientX - previous[0]) * 0.0055;
        state.vp = (event.clientY - previous[1]) * 0.0045;
        state.yaw += state.vy;
        state.pitch += state.vp;
        active();
      }
    };
    const up = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size === 0) {
        dragging.current = false;
        origin = null;
        // The click that ends a drag fires after this; it still sees `moved` and is ignored.
        window.setTimeout(() => (moved.current = false), 0);
      }
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const state = engine.current;
      state.userZoom = true;
      state.distance = clampDistance(state.distance * Math.exp(event.deltaY * 0.0012));
      analyticsRef.current?.interacted({ interaction: 'zoom', value: 'gesture' });
      active();
    };
    stage.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', wheel, { passive: false });
    return () => {
      stage.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      stage.removeEventListener('wheel', wheel);
    };
  }, []);

  const zoom = (factor: number | null) => {
    analytics?.interacted({ interaction: 'zoom', value: 'buttons' });
    const state = engine.current;
    state.lastActive = performance.now();
    wake.current();
    if (factor === null) {
      state.yaw = 0.6;
      state.pitch = -0.28;
      state.userZoom = false;
      state.distance = state.fit;
      state.vy = state.vp = 0;
      return;
    }
    state.userZoom = true;
    state.distance = clampDistance(state.distance * factor);
  };

  const onStageKey = (event: React.KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    const state = engine.current;
    const step = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, -0.02], ArrowDown: [0, 0.02] }[event.key];
    if (!step) return;
    event.preventDefault();
    analytics?.interacted({ interaction: 'rotate' });
    state.vy += step[0];
    state.vp += step[1];
    state.lastActive = performance.now();
    wake.current();
  };

  const centreId = selection.nodes[0]?.node.id;
  const loading = isSkeletonSelection(selection);

  return (
    <div
      ref={stageRef}
      tabIndex={0}
      aria-label="Map of connections. Arrow keys turn it."
      onKeyDown={onStageKey}
      aria-busy={loading || undefined}
      data-testid="connections-stage"
      data-layout-ms={layoutMs ?? undefined}
      className={cx(
        'relative h-full w-full cursor-grab touch-none overflow-hidden outline-none select-none focus-visible:ring-2 focus-visible:ring-white/60 active:cursor-grabbing',
        STAGE_BACKGROUND
      )}
    >
      {loading && <p className="sr-only">Loading connections</p>}
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0" />
      <div className="absolute inset-0">
        {shown.map(entry => {
          const id = entry.node.id;
          const isCentre = id === centreId;
          const gone = !selection.nodes.includes(entry);
          if (isSkeletonNode(entry.node))
            return (
              <div
                key={id}
                ref={element => {
                  if (element) {
                    elements.current.set(id, element);
                    watchSize(element);
                  } else {
                    const old = elements.current.get(id);
                    if (old) resizes.current?.unobserve(old);
                    elements.current.delete(id);
                  }
                }}
                aria-hidden
                data-node-id={id}
                data-skeleton-node
                className="pointer-events-none absolute top-0 left-0 opacity-0 will-change-transform"
              >
                {renderNode(entry, isCentre)}
              </div>
            );
          return (
            <button
              key={id}
              ref={element => {
                if (element) {
                  elements.current.set(id, element);
                  watchSize(element);
                } else {
                  const old = elements.current.get(id);
                  if (old) resizes.current?.unobserve(old);
                  elements.current.delete(id);
                }
              }}
              type="button"
              data-node-id={id}
              data-kind={entry.node.kind}
              aria-current={isCentre ? 'true' : undefined}
              aria-label={entry.node.name ?? undefined}
              tabIndex={gone ? -1 : 0}
              className={cx(
                'absolute top-0 left-0 opacity-0 will-change-transform focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white',
                gone && 'pointer-events-none',
                isCentre ? 'cursor-default' : 'cursor-pointer'
              )}
              onClick={event => {
                if (moved.current) return;
                event.stopPropagation();
                if (!isCentre) onSelect(entry.node);
              }}
              onMouseEnter={() => {
                engine.current.hover = id;
                wake.current();
                onPrefetch?.(id);
              }}
              onMouseLeave={() => {
                if (engine.current.hover === id) engine.current.hover = null;
                wake.current();
                onPrefetch?.(null);
              }}
              onFocus={() => {
                engine.current.hover = id;
                wake.current();
                onPrefetch?.(id);
              }}
              onBlur={() => {
                if (engine.current.hover === id) engine.current.hover = null;
                wake.current();
                onPrefetch?.(null);
              }}
            >
              {renderNode(entry, isCentre)}
            </button>
          );
        })}
      </div>
      <div data-stage-control className="absolute right-4 bottom-4 z-[10000] flex flex-col gap-2">
        {(
          [
            ['+', 'Zoom in', 1 / 1.25],
            ['−', 'Zoom out', 1.25],
            ['⟲', 'Reset the view', null],
          ] as const
        ).map(([text, label, factor]) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            onClick={() => zoom(factor)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-[rgba(30,30,33,.85)] text-[#f2f2f2] hover:border-white"
          >
            {text}
          </button>
        ))}
      </div>
      {children}
      <p
        aria-hidden
        className={cx(
          'pointer-events-none absolute top-4 left-1/2 z-[9999] -translate-x-1/2 rounded-full bg-white/10 px-[14px] py-[6px] text-[13px] whitespace-nowrap text-[#e6e6e6] transition-opacity duration-500 md:text-[12px]',
          (hinted || loading) && 'opacity-0'
        )}
      >
        {canHover
          ? 'Drag to turn · Scroll to zoom · Click anything to explore'
          : 'Drag to turn · Pinch to zoom · Tap anything to explore'}
      </p>
    </div>
  );
}

function useCanHover() {
  return React.useSyncExternalStore(
    () => () => {},
    () => window.matchMedia?.('(hover: hover)').matches ?? true,
    () => true
  );
}

type Box = { anchor: number; width: number; height: number };
type Rect = { left: number; right: number; top: number; bottom: number };

/** A card's screen rectangle: centred on x, anchored at y, scaled about its anchor. */
function rectAt(x: number, y: number, box: Box, scale: number): Rect {
  return {
    left: x - (box.width / 2) * scale,
    right: x + (box.width / 2) * scale,
    top: y - box.anchor * scale,
    bottom: y + (box.height - box.anchor) * scale,
  };
}

/** On-screen size: the centre stays at least full size (exactly 1 on phone); others shrink with depth. */
export function nodeScale(isCentre: boolean, hop: number, depthScale: number, phone: boolean) {
  if (isCentre) return phone ? 1 : Math.max(1, Math.min(1.5, depthScale * 1.12));
  return Math.max(0.3, Math.min(1.2, depthScale * (hop === 2 ? 0.95 : 1)));
}

const CENTRE_MARGIN = 10;

/** The shortest move that takes `rect` off `centre` (plus a margin); none when they don't touch. */
export function clearance(centre: Rect, rect: Rect): [number, number] {
  const right = centre.right + CENTRE_MARGIN - rect.left;
  const left = rect.right - (centre.left - CENTRE_MARGIN);
  const down = centre.bottom + CENTRE_MARGIN - rect.top;
  const up = rect.bottom - (centre.top - CENTRE_MARGIN);
  if (right <= 0 || left <= 0 || down <= 0 || up <= 0) return [0, 0];
  const dx = right < left ? right : -left;
  const dy = down < up ? down : -up;
  return Math.abs(dx) < Math.abs(dy) ? [dx, 0] : [0, dy];
}

function shifted(rect: Rect, [dx, dy]: [number, number]): Rect {
  return { left: rect.left + dx, right: rect.right + dx, top: rect.top + dy, bottom: rect.bottom + dy };
}

/** Whether `rect` reaches into `centre`'s margin. */
export function overlaps(centre: Rect, rect: Rect): boolean {
  const [dx, dy] = clearance(centre, rect);
  return dx !== 0 || dy !== 0;
}

/** How much of the smaller rectangle the two share, 0 to 1. */
export function overlapShare(a: Rect, b: Rect): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (width <= 0 || height <= 0) return 0;
  const area = (rect: Rect) => (rect.right - rect.left) * (rect.bottom - rect.top);
  return (width * height) / Math.max(1, Math.min(area(a), area(b)));
}

function clampDistance(distance: number) {
  return Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distance));
}

/** An entity anchors on its image, everything else on its middle. */
function anchorY(element: HTMLElement): number {
  const image = element.querySelector<HTMLElement>('[data-anchor]');
  return image ? image.offsetTop + image.offsetHeight / 2 : element.offsetHeight / 2;
}
