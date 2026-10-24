// Which solid is in front, and which edges are hidden behind one.
//
// Painting back to front only works if "back to front" is a real order. For
// axis aligned boxes under this projection there is an exact test: A is in
// front of B if A sits entirely on the near side of B along any one axis. If no
// axis separates them the two overlap in space and either order will do.
import { corners, type Box, type P2, type P3 } from "./iso.ts";

export type Seg = [P2, P2];

// Solids placed by contact meet at sums like 1.6 + 0.14, which floating point
// makes 1.7400000000000002, so one sitting exactly on another would not count as
// above it and could be painted underneath. A hair of tolerance fixes that
// without letting genuinely overlapping solids pass as separated.
const EPS = 1e-6;

// which way the eye looks along x and y: +1 when it sits on the far side of
// the positive axis, as the usual view from the front right does
export type Facing = { x: 1 | -1; y: 1 | -1 };
const USUAL: Facing = { x: 1, y: 1 };

export function inFront(a: Box, b: Box, eye: Facing = USUAL): boolean {
  const alongX = eye.x > 0 ? a.x >= b.x + b.w - EPS : a.x + a.w <= b.x + EPS;
  const alongY = eye.y > 0 ? a.y >= b.y + b.d - EPS : a.y + a.d <= b.y + EPS;
  return alongX || alongY || a.z >= b.z + b.h - EPS;
}

// topological sort, so a box is drawn after everything it sits behind
// what an open box holds: anything over its floor plan and not below it, even
// leaning out past its walls
const holds = (o: Box, b: Box) =>
  o !== b && b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.d && b.y + b.d > o.y && b.z >= o.z - EPS && b.z < o.z + o.h;
// a solid told to draw over another wins that pair whatever the room says, and so
// does the near wall of an open box over what it holds, and what it holds over its far walls
// a name ending in * stands for every name that starts with the rest
const names = (list: string[] | undefined, n: string) => !!list?.some((m) => m === n || (m.endsWith("*") && n.startsWith(m.slice(0, -1))));
const forced = (a: Box, b: Box): boolean | undefined => {
  if (names(a.over, b.name)) return true;
  if (names(b.over, a.name)) return false;
  if (a.shell === "front" && holds(a, b)) return true;
  if (b.shell === "front" && holds(b, a)) return false;
  if (a.shell === "back" && holds(a, b)) return false;
  if (b.shell === "back" && holds(b, a)) return true;
  return undefined;
};

export function order(boxes: Box[], eye: Facing = USUAL): Box[] {
  const n = boxes.length;
  const after: number[][] = boxes.map(() => []);
  const indeg = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const f = forced(boxes[i]!, boxes[j]!);
      if (f ?? (inFront(boxes[i]!, boxes[j]!, eye) && !inFront(boxes[j]!, boxes[i]!, eye))) {
        after[j]!.push(i);
        indeg[i]++;
      }
    }
  }
  const out: Box[] = [];
  const seen = new Set<number>();
  // how far a box's nearest-the-back corner is, measured towards the eye
  const far = (i: number) => {
    const b = boxes[i]!;
    return (eye.x > 0 ? b.x : -(b.x + b.w)) + (eye.y > 0 ? b.y : -(b.y + b.d)) + b.z;
  };

  while (seen.size < n) {
    const left = boxes.map((_, i) => i).filter((i) => !seen.has(i));
    let ready = left.filter((i) => indeg[i] === 0);
    // solids that interpenetrate depend on each other both ways, so no box is
    // ever free. take the furthest one and carry on rather than giving up
    if (!ready.length) ready = [left.reduce((a, b) => (far(a) <= far(b) ? a : b))];
    const i = ready.reduce((a, b) => (far(a) <= far(b) ? a : b));
    seen.add(i);
    out.push(boxes[i]!);
    for (const j of after[i]!) indeg[j]--;
  }
  return out;
}

export function silhouette(b: Box, to: (p: P3) => P2): P2[] {
  return hull(corners(b).map(to));
}

export function hull(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: P2, a: P2, c: P2) => (a.x - o.x) * (c.y - o.y) - (a.y - o.y) * (c.x - o.x);
  const half = (src: P2[]) => {
    const out: P2[] = [];
    for (const q of src) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, q) <= 1e-9) out.pop();
      out.push(q);
    }
    return out.slice(0, -1);
  };
  return [...half(p), ...half([...p].reverse())];
}

// the stretch of a segment that falls inside a convex polygon, as a t interval
function insideInterval(seg: Seg, poly: P2[]): [number, number] | null {
  const [p, q] = seg;
  const dx = q.x - p.x, dy = q.y - p.y;
  let t0 = 0, t1 = 1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    // inward normal of this edge, polygon wound counter clockwise on screen
    const nx = -(b.y - a.y), ny = b.x - a.x;
    const denom = dx * nx + dy * ny;
    const dist = (p.x - a.x) * nx + (p.y - a.y) * ny;
    if (Math.abs(denom) < 1e-12) {
      if (dist > 0) return null; // parallel and outside
      continue;
    }
    const t = -dist / denom;
    if (denom > 0) t1 = Math.min(t1, t);
    else t0 = Math.max(t0, t);
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

function at(seg: Seg, t: number): P2 {
  return { x: seg[0].x + (seg[1].x - seg[0].x) * t, y: seg[0].y + (seg[1].y - seg[0].y) * t };
}

/** Split one edge into the parts you can see and the parts something hides. */
export function split(seg: Seg, blockers: P2[][]): { visible: Seg[]; hidden: Seg[] } {
  let gaps: [number, number][] = [];
  for (const poly of blockers) {
    const iv = insideInterval(seg, poly);
    if (iv && iv[1] - iv[0] > 1e-6) gaps.push(iv);
  }
  if (!gaps.length) return { visible: [seg], hidden: [] };

  gaps.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [gaps[0]!];
  for (const g of gaps.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (g[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], g[1]);
    else merged.push(g);
  }

  const visible: Seg[] = [];
  const hidden: Seg[] = [];
  let cursor = 0;
  for (const [a, b] of merged) {
    if (a - cursor > 1e-6) visible.push([at(seg, cursor), at(seg, a)]);
    hidden.push([at(seg, a), at(seg, b)]);
    cursor = b;
  }
  if (1 - cursor > 1e-6) visible.push([at(seg, cursor), at(seg, 1)]);
  return { visible, hidden };
}

/** The nine edges of a box you could see, and the three its own bulk hides. */
export function boxEdges(b: Box): { own: [P3, P3][]; back: [P3, P3][] } {
  const far: P3 = { x: b.x, y: b.y, z: b.z };
  const all: [P3, P3][] = [];
  const pts = corners(b);
  for (const p of pts) {
    for (const q of pts) {
      const d = (p.x !== q.x ? 1 : 0) + (p.y !== q.y ? 1 : 0) + (p.z !== q.z ? 1 : 0);
      const forward = q.x > p.x || (q.x === p.x && (q.y > p.y || (q.y === p.y && q.z > p.z)));
      if (d === 1 && forward) all.push([p, q]);
    }
  }
  const touchesFar = (e: [P3, P3]) =>
    e.some((p) => p.x === far.x && p.y === far.y && p.z === far.z);
  return { own: all.filter((e) => !touchesFar(e)), back: all.filter(touchesFar) };
}
