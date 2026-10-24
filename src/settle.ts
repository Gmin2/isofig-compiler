// Solids a model placed a hair too close: a slab sunk 0.1 into the tray wall beside
// it, a box run 0.12 into its neighbour. Each is a sum gone slightly wrong, not a
// different idea, so the compiler slides the later solid out sideways by just enough,
// along with whatever sits on it. Deep overlaps are left for lint to report: those
// are a layout the model meant, or one it got badly wrong, and moving them would
// guess at which.
import type { Box } from "./iso.ts";
import type { Scene } from "./scene.ts";

// sinking in further than this is not a slip
const SHALLOW = 0.35;
// how far apart a slid solid ends up
const CLEAR = 0.05;
const TOUCH = 0.05;
// the furthest something sunk into a solid is lifted onto its top
const LIFT = 0.6;

type Part = { name: string; box: { x: number; y: number; z: number; w: number; d: number; h: number }; r: number; dashed: boolean };

const groupOf = (name: string) => name.split(".")[0]!;

/** Whether the scene is in the model's own language; hand-built reference scenes are left exactly as written. */
function plain(scene: Scene): boolean {
  return !scene.tracks.length && !scene.decals.length && !scene.labels.length && !scene.wires.length &&
    !scene.plates.length && !scene.rules.length && !scene.rods.length && !scene.tubes.length &&
    !scene.dishes.length && !scene.cones.length;
}

function partsOf(scene: Scene): Part[] {
  const out: Part[] = scene.boxes.map((b: Box) => ({ name: b.name, box: b, r: Math.min(b.r ?? 0, b.w / 2, b.d / 2), dashed: b.hidden === "dashed" }));
  for (const c of scene.cyls) {
    // a cylinder's room, kept in step with the cylinder itself when it moves
    const box = {
      get x() { return c.x; }, get y() { return c.y; }, get z() { return c.z; },
      w: c.axis === "x" ? c.h : 2 * c.r, d: c.axis === "y" ? c.h : 2 * c.r, h: c.axis === "z" ? c.h : 2 * c.r,
    };
    out.push({ name: c.name, box, r: c.axis === "z" ? c.r : 0, dashed: false });
  }
  return out;
}

// how far a point is inside a rounded footprint, negative outside
function insideBy(p: Part, x: number, y: number): number {
  const b = p.box;
  const qx = Math.abs(x - (b.x + b.w / 2)) - (b.w / 2 - p.r);
  const qy = Math.abs(y - (b.y + b.d / 2)) - (b.d / 2 - p.r);
  return -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - p.r);
}

// the same measure lint uses: how deep two solids run into each other
function depthOf(a: Part, b: Part): number {
  const A = a.box, B = b.box;
  const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
  const oy = Math.min(A.y + A.d, B.y + B.d) - Math.max(A.y, B.y);
  const oz = Math.min(A.z + A.h, B.z + B.h) - Math.max(A.z, B.z);
  if (ox <= TOUCH || oy <= TOUCH || oz <= TOUCH) return 0;
  if (!a.r && !b.r) return Math.min(ox, oy, oz);
  const x0 = Math.max(A.x, B.x), y0 = Math.max(A.y, B.y);
  let best = 0;
  for (let i = 0; i <= 12; i++)
    for (let j = 0; j <= 12; j++) {
      const x = x0 + (ox * i) / 12, y = y0 + (oy * j) / 12;
      best = Math.max(best, Math.min(insideBy(a, x, y), insideBy(b, x, y)));
    }
  return best > TOUCH ? Math.min(best, oz) : 0;
}

/** Slide solids out of shallow overlaps. Returns a note for each one moved. */
export function settle(scene: Scene): string[] {
  if (!plain(scene)) return [];
  const parts = partsOf(scene);
  const order = new Map<string, number>();
  parts.forEach((p, i) => { const g = groupOf(p.name); if (!order.has(g)) order.set(g, i); });
  // cylinders and boxes are separate lists, so order by where each group first appears in either
  const groups = [...new Set(parts.map((p) => groupOf(p.name)))];
  const members = (g: string) => parts.filter((p) => groupOf(p.name) === g);

  const pairs = () => {
    const out: { a: Part; b: Part; depth: number }[] = [];
    for (let i = 0; i < parts.length; i++)
      for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i]!, b = parts[j]!;
        if (groupOf(a.name) === groupOf(b.name) || a.dashed || b.dashed) continue;
        const depth = depthOf(a, b);
        if (depth > 0) out.push({ a, b, depth });
      }
    return out;
  };
  const worst = () => pairs().reduce((m, p) => Math.max(m, p.depth), 0);
  const total = () => pairs().reduce((s, p) => s + p.depth, 0);

  // what rides along: anything resting on the moved group, and whatever rests on that
  const riders = (g: string): string[] => {
    const moving = new Set([g]);
    for (let pass = 0; pass < 6; pass++) {
      for (const h of groups) {
        if (moving.has(h)) continue;
        const rests = members(h).some((p) => parts.some((q) => moving.has(groupOf(q.name)) &&
          Math.abs(p.box.z - (q.box.z + q.box.h)) < 1e-6 &&
          Math.min(p.box.x + p.box.w, q.box.x + q.box.w) - Math.max(p.box.x, q.box.x) > TOUCH &&
          Math.min(p.box.y + p.box.d, q.box.y + q.box.d) - Math.max(p.box.y, q.box.y) > TOUCH));
        if (rests) moving.add(h);
      }
    }
    return [...moving];
  };

  const shift = (names: string[], dx: number, dy: number, dz = 0) => {
    const set = new Set(names);
    for (const b of scene.boxes) if (set.has(groupOf(b.name))) { b.x += dx; b.y += dy; b.z += dz; if (b.pivot) b.pivot = [b.pivot[0] + dx, b.pivot[1] + dy]; }
    for (const c of scene.cyls) if (set.has(groupOf(c.name))) { c.x += dx; c.y += dy; c.z += dz; }
    // an icon is printed on what it sits on
    for (const g of scene.icons) {
      const host = parts.find((p) => set.has(groupOf(p.name)) && Math.abs(g.z - (p.box.z - dz + p.box.h)) < 0.12 &&
        g.x + g.size / 2 > p.box.x - dx && g.x + g.size / 2 < p.box.x - dx + p.box.w &&
        g.y + g.size / 2 > p.box.y - dy && g.y + g.size / 2 < p.box.y - dy + p.box.d);
      if (host) { g.x += dx; g.y += dy; g.z += dz; }
    }
    for (const a of scene.arrows) {
      const ends = a.ends ?? [];
      if (ends[0] && set.has(groupOf(ends[0]))) { a.from = [a.from[0] + dx, a.from[1] + dy, a.from[2] + dz]; }
      if (ends[1] && set.has(groupOf(ends[1]))) { a.to = [a.to[0] + dx, a.to[1] + dy, a.to[2] + dz]; }
    }
  };

  const notes: string[] = [];
  for (let round = 0; round < 8; round++) {
    const shallow = pairs().filter((p) => p.depth <= SHALLOW).sort((p, q) => q.depth - p.depth);
    if (!shallow.length) break;
    let moved = false;
    for (const { a, b } of shallow) {
      if (depthOf(a, b) === 0) continue;
      // the solid written later is the one that was squeezed in
      const later = (order.get(groupOf(a.name)) ?? 0) > (order.get(groupOf(b.name)) ?? 0) ? a : b;
      const fixed = later === a ? b : a;
      const L = later.box, F = fixed.box;
      // how far each way it has to go to come clear, and the shorter of the two
      const pick = (plus: number, minus: number) => (plus <= minus ? plus : -minus);
      const dx = pick(F.x + F.w - L.x + CLEAR, L.x + L.w - F.x + CLEAR);
      const dy = pick(F.y + F.d - L.y + CLEAR, L.y + L.d - F.y + CLEAR);
      const tries: [number, number, number][] = (Math.abs(dx) <= Math.abs(dy) ? [[dx, 0, 0], [0, dy, 0]] : [[0, dy, 0], [dx, 0, 0]]) as [number, number, number][];
      // standing in another solid's footprint, sunk into it: it was meant to sit on top
      const cx = L.x + L.w / 2, cy = L.y + L.d / 2;
      if (cx > F.x && cx < F.x + F.w && cy > F.y && cy < F.y + F.d && L.z < F.z + F.h && L.z >= F.z - 1e-6) tries.unshift([0, 0, F.z + F.h - L.z]);
      const group = groupOf(later.name);
      // a stack, grid or tray moves whole, never one part of it
      const before = total(), worstBefore = worst();
      const riding = riders(group);
      for (const [mx, my, mz] of tries) {
        if (Math.abs(mx) > SHALLOW + CLEAR || Math.abs(my) > SHALLOW + CLEAR || mz > LIFT) continue;
        shift(riding, mx, my, mz);
        if (total() < before - 1e-6 && worst() <= worstBefore + 1e-6) {
          notes.push(mz ? `${group} was sunk into ${groupOf(fixed.name)}, so it was lifted ${mz.toFixed(2)} onto it`
            : `${group} overlapped ${groupOf(fixed.name)} slightly, so it was moved ${Math.abs(mx || my).toFixed(2)} clear`);
          moved = true;
          break;
        }
        shift(riding, -mx, -my, -mz);
      }
    }
    if (!moved) break;
  }
  return notes;
}
