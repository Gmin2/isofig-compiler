// Things a figure compiles with but should not look like: solids running into
// each other, and arrows running through a solid they do not join.
//
// Touching is fine (on=, beside=, stack layers), and so is a rounded footprint
// whose bounding box overlaps another while the shape itself does not.
import { project, type Box } from "./iso.ts";
import type { Scene } from "./scene.ts";

export type Issue =
  | { kind: "overlap"; a: string; b: string; depth: number }
  | { kind: "arrow-through"; arrow: string; solid: string; depth: number }
  // two words that do not touch in space but sit on top of each other on the page
  | { kind: "crowded"; a: string; b: string; depth: number };

type Solid = { name: string; group: string; x: number; y: number; z: number; w: number; d: number; h: number; r: number; dashed: boolean };

// less than this much sinking in reads as touching
const TOUCH = 0.05;

// the named thing a part belongs to: deck.3 is part of deck, t.floor of t
const groupOf = (name: string) => name.split(".")[0]!;

function solidsOf(scene: Scene): Solid[] {
  const out: Solid[] = scene.boxes.map((b: Box) => ({
    name: b.name, group: groupOf(b.name), x: b.x, y: b.y, z: b.z, w: b.w, d: b.d, h: b.h,
    r: Math.min(b.r ?? 0, b.w / 2, b.d / 2), dashed: b.hidden === "dashed",
  }));
  for (const c of scene.cyls) {
    const w = c.axis === "x" ? c.h : 2 * c.r, d = c.axis === "y" ? c.h : 2 * c.r, h = c.axis === "z" ? c.h : 2 * c.r;
    out.push({ name: c.name, group: c.name, x: c.x, y: c.y, z: c.z, w, d, h, r: c.axis === "z" ? c.r : 0, dashed: false });
  }
  return out;
}

// how far a point is inside a footprint, negative outside; rounded corners and discs count
function insideBy(s: Solid, x: number, y: number): number {
  const qx = Math.abs(x - (s.x + s.w / 2)) - (s.w / 2 - s.r);
  const qy = Math.abs(y - (s.y + s.d / 2)) - (s.d / 2 - s.r);
  return -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - s.r);
}

// how deep two solids run into each other, 0 when they only touch or miss
function depthOf(a: Solid, b: Solid): number {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
  const oz = Math.min(a.z + a.h, b.z + b.h) - Math.max(a.z, b.z);
  if (ox <= TOUCH || oy <= TOUCH || oz <= TOUCH) return 0;
  if (!a.r && !b.r) return Math.min(ox, oy, oz);
  // rounded: the boxes overlap, but do the shapes? look for the deepest point both footprints share
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  let best = 0;
  const n = 12;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const x = x0 + (ox * i) / n, y = y0 + (oy * j) / n;
      best = Math.max(best, Math.min(insideBy(a, x, y), insideBy(b, x, y)));
    }
  }
  return best > TOUCH ? Math.min(best, oz) : 0;
}

export function lint(scene: Scene): Issue[] {
  const issues: Issue[] = [];
  const solids = solidsOf(scene);
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i]!, b = solids[j]!;
      // parts of one tray, stack or grid are laid out by the compiler; a dashed solid is see through, a container
      if (a.group === b.group || a.dashed || b.dashed) continue;
      const depth = depthOf(a, b);
      if (depth > 0) issues.push({ kind: "overlap", a: a.name, b: b.name, depth: Math.round(depth * 100) / 100 });
    }
  }
  // words are read, so two that cover each other on the page are broken even when they are
  // apart in depth: one in front of the other. each word's room on the page, then every pair
  const words = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
  for (const b of scene.boxes) {
    if (!b.outline || !b.name.includes(".")) continue;
    const g = groupOf(b.name);
    const pts = [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((k) => project({ x: b.x + i * b.w, y: b.y + j * b.d, z: b.z + k * b.h }, 1))));
    const was = words.get(g) ?? { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    words.set(g, {
      x0: Math.min(was.x0, ...pts.map((p) => p.x)), y0: Math.min(was.y0, ...pts.map((p) => p.y)),
      x1: Math.max(was.x1, ...pts.map((p) => p.x)), y1: Math.max(was.y1, ...pts.map((p) => p.y)),
    });
  }
  const placed = [...words];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const [an, a] = placed[i]!, [bn, b] = placed[j]!;
      const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (w <= 0 || h <= 0) continue;
      const smaller = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0)) || 1;
      const share = (w * h) / smaller;
      if (share > 0.2) issues.push({ kind: "crowded", a: an, b: bn, depth: Math.round(share * 100) / 100 });
    }
  }
  for (const arrow of scene.arrows) {
    const ends = arrow.ends ?? [];
    for (const s of solids) {
      if (ends.includes(s.group) || ends.includes(s.name)) continue;
      let deepest = 0;
      for (let t = 0.02; t < 1; t += 0.02) {
        const p = [0, 1, 2].map((k) => arrow.from[k]! + (arrow.to[k]! - arrow.from[k]!) * t);
        const inZ = Math.min(p[2]! - s.z, s.z + s.h - p[2]!);
        deepest = Math.max(deepest, Math.min(insideBy(s, p[0]!, p[1]!), inZ));
      }
      if (deepest > TOUCH) issues.push({ kind: "arrow-through", arrow: arrow.name, solid: s.name, depth: Math.round(deepest * 100) / 100 });
    }
  }
  return issues;
}
