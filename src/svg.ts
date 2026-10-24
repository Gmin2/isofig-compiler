import { corners, faces, onFace, project, type Box, type FaceId, type P2, type P3, type View } from "./iso.ts";
import { boxEdges, hull, inFront, order, split, type Seg } from "./visible.ts";
import { findGlyph } from "./icons.ts";
import { DEFAULT, type Style } from "./style.ts";

export { DEFAULT, type Style };
import type { Arrow, Cone, Cyl, Icon, Scene } from "./scene.ts";
import { lookAt, plan, type Track } from "./motion.ts";

const point = (a: Arrow, t: number) => [0, 1, 2].map((k) => a.from[k]! + (a.to[k]! - a.from[k]!) * t);
const xyz = (p: number[]) => ({ x: p[0]!, y: p[1]!, z: p[2]! });

// a circle in 3d, tessellated, then projected like anything else. that keeps
// the ellipse exact for any axis instead of guessing at rx and ry.
export function circle3(c: { x: number; y: number; z: number }, r: number, axis: "x" | "y" | "z", n = 48) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const u = Math.cos(a) * r, v = Math.sin(a) * r;
    if (axis === "z") out.push({ x: c.x + u, y: c.y + v, z: c.z });
    else if (axis === "y") out.push({ x: c.x + u, y: c.y, z: c.z + v });
    else out.push({ x: c.x, y: c.y + u, z: c.z + v });
  }
  return out;
}

// a rounded rectangle lying flat at height z, as points going round it
export function roundedRect(b: Box, z: number, per = 10) {
  const r = b.r ?? 0;
  const corners: [number, number, number][] = [
    [b.x + b.w - r, b.y + b.d - r, 0],
    [b.x + r, b.y + b.d - r, Math.PI / 2],
    [b.x + r, b.y + r, Math.PI],
    [b.x + b.w - r, b.y + r, (3 * Math.PI) / 2],
  ];
  const out: { x: number; y: number; z: number }[] = [];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= per; i++) {
      const a = start + (i / per) * (Math.PI / 2);
      out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, z });
    }
  }
  return out;
}

/** The room a glyph takes up, for the canvas fit and for the back to front order. */
export function iconBox(i: Icon): Box {
  return { name: i.name, x: i.x, y: i.y, z: i.z, w: i.size, d: i.size, h: i.size };
}

export function cylBox(c: Cyl): Box {
  const w = c.axis === "x" ? c.h : 2 * c.r;
  const d = c.axis === "y" ? c.h : 2 * c.r;
  const h = c.axis === "z" ? c.h : 2 * c.r;
  return { name: c.name, x: c.x, y: c.y, z: c.z, w, d, h, accent: c.accent, tint: c.tint };
}

function cylEnds(c: Cyl) {
  const mid = { x: c.x + (c.axis === "x" ? 0 : c.r), y: c.y + (c.axis === "y" ? 0 : c.r), z: c.z + (c.axis === "z" ? 0 : c.r) };
  const a = { ...mid };
  const b = { ...mid };
  if (c.axis === "z") b.z = c.z + c.h;
  else if (c.axis === "y") b.y = c.y + c.h;
  else b.x = c.x + c.h;
  return [a, b] as const;
}

function cylPoints(c: Cyl) {
  const [a, b] = cylEnds(c);
  return [...circle3(a, c.r, c.axis, 16), ...circle3(b, c.r, c.axis, 16)];
}

export function coneBox(c: Cone): Box {
  const w = c.axis === "x" ? c.h : 2 * c.r;
  const d = c.axis === "y" ? c.h : 2 * c.r;
  const h = c.axis === "z" ? c.h : 2 * c.r;
  return { name: c.name, x: c.x, y: c.y, z: c.z, w, d, h, accent: c.accent, tint: c.tint };
}

function coneEnds(c: Cone) {
  const mid = { x: c.x + (c.axis === "x" ? 0 : c.r), y: c.y + (c.axis === "y" ? 0 : c.r), z: c.z + (c.axis === "z" ? 0 : c.r) };
  const base = { ...mid };
  const tip = { ...mid };
  if (c.axis === "z") tip.z = c.z + c.h;
  else if (c.axis === "y") tip.y = c.y + c.h;
  else tip.x = c.x + c.h;
  return [base, tip] as const;
}

function conePoints(c: Cone) {
  const [base, tip] = coneEnds(c);
  return [...circle3(base, c.r, c.axis, 16), ...circle3(tip, c.r * c.cap, c.axis, 16)];
}

// labels are written into xml, where & and < would break the file
const escapeText = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// coordinates are written to this many places; a style can ask for fewer, as
// figures generated elsewhere were, so the same points land on the same pixels
let places = 100;
const f = (n: number) => (Math.round(n * places) / places).toString();

// a short stable id, so the css of two figures on one page never collides
function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

// a turn about the upright line through a pivot, as a hinge turns a door
export const turned = (p: P3, deg: number | undefined, pv: [number, number]): P3 => {
  if (!deg) return p;
  const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180), dx = p.x - pv[0], dy = p.y - pv[1];
  return { x: pv[0] + dx * c - dy * s, y: pv[1] + dx * s + dy * c, z: p.z };
};// a lean about the level line along x through a hinge, as a lid opens or a card
// leans back in its file
export const leaned = (p: P3, deg: number | undefined, hg: [number, number]): P3 => {
  if (!deg) return p;
  const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180), dy = p.y - hg[0], dz = p.z - hg[1];
  return { x: p.x, y: hg[0] + dy * c + dz * s, z: hg[1] - dy * s + dz * c };
};
// a roll about the line along y through an axle, x turning towards z
export const rolled = (p: P3, deg: number | undefined, ax: [number, number]): P3 => {
  if (!deg) return p;
  const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180), dx = p.x - ax[0], dz = p.z - ax[1];
  return { x: ax[0] + dx * c - dz * s, y: p.y, z: ax[1] + dx * s + dz * c };
};
// everything a solid can be turned by, in one order: rolled, turned, then leaned
export const posed = (b: Box, p: P3, pivot: [number, number]): P3 =>
  leaned(turned(rolled(p, b.roll, b.axle ?? [b.x, b.z]), b.turn, pivot), b.tilt, b.hinge ?? [b.y, b.z]);
// one unit in scene space is one grid cell. pick the unit and offset that put
// the whole figure inside the canvas with a margin, so nothing can run off.
function fit(scene: Scene, st: Style) {
  // a turned or leaned solid takes up the room of its turned corners
  const pts = scene.boxes.flatMap((b) => corners(b).map((p) =>
    project(posed(b, p, b.pivot ?? [b.x + b.w / 2, b.y + b.d / 2]), 1, st.view)));
  const cube = (c: [number, number, number], r: number) => {
    for (const dx of [-r, r]) for (const dy of [-r, r]) for (const dz of [-r, r]) pts.push(project({ x: c[0] + dx, y: c[1] + dy, z: c[2] + dz }, 1, st.view));
  };
  for (const r of scene.rods) { cube(r.from, r.r0); cube(r.to, r.r1); }
  for (const tb of scene.tubes) for (const q of tb.pts) cube(q, tb.r);
  // outlines count too, though a turned or leaned one is placed as if it were not
  for (const pl of scene.plates) for (const [u, v] of pl.pts) for (const l of [pl.z, pl.z + (pl.h ?? 0)])
    cube(pl.axis === "z" ? [u, v, l] : pl.axis === "y" ? [u, l, v] : [l, u, v], 0);
  for (const d of scene.dishes) cube(d.at, d.r * 1.3);
  for (const r of scene.rules) for (const q of [r.from, r.to]) cube(q, 0);
  for (const d of scene.dots) if (d.at) cube(d.at, d.r ?? 0);
  for (const c of scene.cyls) {
    for (const p of cylPoints(c)) pts.push(project(p, 1, st.view));
  }
  for (const c of scene.cones) {
    for (const p of conePoints(c)) pts.push(project(p, 1, st.view));
  }
  for (const g of scene.icons) {
    for (const p of corners(iconBox(g))) pts.push(project(p, 1, st.view));
  }
  for (const a of scene.arrows) {
    for (const p of [a.from, a.to]) pts.push(project({ x: p[0], y: p[1], z: p[2] }, 1, st.view));
  }
  // something that bobs or slides needs room where it goes, as well as where it rests
  for (const mv of [...scene.motion.bobs, ...scene.motion.slides]) {
    const mine = (n: string) => n === mv.target || n.startsWith(`${mv.target}.`);
    const shifted = (p: P3) => project({ x: p.x + mv.by[0], y: p.y + mv.by[1], z: p.z + mv.by[2] }, 1, st.view);
    for (const b of scene.boxes) if (mine(b.name)) for (const p of corners(b)) pts.push(shifted(p));
    for (const c of scene.cyls) if (mine(c.name)) for (const p of cylPoints(c)) pts.push(shifted(p));
  }
  if (!pts.length) throw new Error("nothing to draw");
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const room = st.size - 2 * st.margin;
  const unit = Math.min(room / (maxX - minX || 1), room / (maxY - minY || 1));
  return {
    unit,
    ox: st.margin + (room - (maxX - minX) * unit) / 2 - minX * unit,
    oy: st.margin + (room - (maxY - minY) * unit) / 2 - minY * unit,
  };
}

// at draws one still frame of the motion at that many seconds, instead of css
export type Options = {
  at?: number;
  // override the figure's timeline: false plays motion once and stops on the finished figure
  loop?: boolean;
  // draw what can be drawn and say what had to bend, instead of refusing the figure
  lenient?: boolean;
  notes?: string[];
  // say which solid or line each piece came from, for an editor to point back at the figure
  ids?: boolean;
  // filled in with how long the entrances take, for anyone turning the motion into frames
  timing?: { settled: number | null };
  // a canvas and projection held fixed, so frames of a moving figure line up:
  // width by height, unit pixels to a scene unit, the scene origin at ox, oy
  frame?: Frame;
};
// x and y, when given, are where the viewBox starts, so a figure can keep the page
// coordinates it was made in (text lands on pixels by them)
export type Frame = { width: number; height: number; unit: number; ox: number; oy: number; x?: number; y?: number };

// an easing curve given by its two control points, as css and smil both write one
function cubic(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (u: number) => ((ax * u + bx) * u + cx) * u, Y = (u: number) => ((ay * u + by) * u + cy) * u, dX = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 8; i++) { const e = X(u) - t; if (Math.abs(e) < 1e-7) break; const d = dX(u); if (Math.abs(d) < 1e-6) break; u -= e / d; }
    if (!(u >= 0 && u <= 1) || Math.abs(X(u) - t) > 1e-6) { let lo = 0, hi = 1; u = t; for (let i = 0; i < 40; i++) { if (X(u) < t) lo = u; else hi = u; u = (lo + hi) / 2; } }
    return Y(u);
  };
}

// where a track stands at time t, the way smil keys it: from begin it repeats every
// dur seconds; between keyed times the value steps (discrete) or runs straight
function keyed(tr: Scene["tracks"][number], t: number): number[] | null {
  if (t < tr.begin) return tr.base ?? null;
  // a browser's svg clock counts whole microseconds and keys its times as 32 bit
  // floats, so a moment landing exactly on a key falls the same side of it as there
  const us = Math.trunc(t * 1e6) - Math.round(tr.begin * 1e6), D = Math.round(tr.dur * 1e6);
  const tau = Math.fround((((us % D) + D) % D) / D), n = tr.times.length, kt = tr.times.map(Math.fround);
  let i = 0;
  while (i + 1 < n && kt[i + 1]! <= tau) i++;
  if (tr.discrete || i + 1 >= n) return tr.values[i]!;
  const a = kt[i]!, b = kt[i + 1]!, w0 = b > a ? (tau - a) / (b - a) : 0;
  const w = tr.spline ? cubic(...tr.spline)(w0) : w0;
  return tr.values[i]!.map((v, k) => v + (tr.values[i + 1]![k]! - v) * w);
}

// the scene as it stands at time t: every track's targets faded, moved along their
// path or turned, before anything is sorted or drawn
function atTime(scene: Scene, t: number, view: View | undefined) {
  const fade = new Map<string, number>(), shift = new Map<string, P3>(), spin = new Map<string, [number, number, number]>(), tail = new Map<string, P3>();
  const hits = (targets: string[], n: string) => targets.some((m) => m === n || (m.endsWith("*") && n.startsWith(m.slice(0, -1))));
  const names = [...scene.boxes.map((b) => b.name), ...scene.labels.map((l) => l.name), ...scene.decals.map((d) => d.name), ...scene.wires.map((w) => w.name), ...scene.dots.map((d) => d.target)];
  for (const tr of scene.tracks) {
    const v = keyed(tr, t);
    if (!v) continue;
    let set: (n: string) => void = () => {};
    if (tr.attr === "opacity") set = (n) => fade.set(n, (fade.get(n) ?? 1) * v[0]!);
    else if (tr.attr === "tail") set = (n) => tail.set(n, { x: v[0] ?? 0, y: v[1] ?? 0, z: v[2] ?? 0 });
    else if (tr.attr === "shift") set = (n) => shift.set(n, { x: v[0] ?? 0, y: v[1] ?? 0, z: v[2] ?? 0 });
    else if (tr.attr === "turn") set = (n) => spin.set(n, [v[0] ?? 0, tr.about?.[0] ?? 0, tr.about?.[1] ?? 0]);
    else if (tr.attr === "path" && tr.path) {
      // how far along is measured on the page, as a browser walks an svg path
      const pts = tr.path, scr = pts.map((q) => project({ x: q[0], y: q[1], z: q[2] }, 1, view));
      const lens = scr.slice(1).map((q, k) => Math.hypot(q.x - scr[k]!.x, q.y - scr[k]!.y)), total = lens.reduce((a, b) => a + b, 0);
      let left = Math.min(Math.max(v[0]!, 0), 1) * total, k = 0;
      while (k < lens.length - 1 && left > lens[k]!) { left -= lens[k]!; k++; }
      const w = lens[k] ? left / lens[k]! : 0, a = pts[k]!, b = pts[k + 1] ?? a;
      const at = [0, 1, 2].map((j) => a[j]! + (b[j]! - a[j]!) * w);
      set = (n) => shift.set(n, { x: at[0]! - pts[0]![0], y: at[1]! - pts[0]![1], z: at[2]! - pts[0]![2] });
    }
    for (const n of names) if (hits(tr.targets, n)) set(n);
  }
  // what rides on a solid moves with it unless a track of its own says otherwise
  for (const l of [...scene.labels, ...scene.wires]) if (l.on && !shift.has(l.name) && shift.has(l.on)) shift.set(l.name, shift.get(l.on)!);
  for (const d of scene.dots) if (d.on && !shift.has(d.target) && shift.has(d.on)) shift.set(d.target, shift.get(d.on)!);
  const mv = <T extends { x: number; y: number; z: number }>(o: T, n: string): T => {
    const s = shift.get(n);
    return s ? { ...o, x: o.x + s.x, y: o.y + s.y, z: o.z + s.z } : o;
  };
  const mv3 = (q: [number, number, number], n: string): [number, number, number] => {
    const s = shift.get(n);
    return s ? [q[0] + s.x, q[1] + s.y, q[2] + s.z] : q;
  };
  return {
    fade,
    spin,
    scene: {
      ...scene,
      boxes: scene.boxes.map((b) => mv(b, b.name)),
      labels: scene.labels.map((l) => ({ ...l, at: mv3(l.at, l.name) })),
      decals: scene.decals.map((d) => (d.at ? { ...d, at: mv3(d.at, shift.has(d.name) ? d.name : d.target) } : d)),
      wires: scene.wires.map((w) => {
        // a tail track moves only the wire's last point, as a cable paid out to a lift
        const tl = tail.get(w.name), pts = w.pts.map((q) => mv3(q, w.name));
        if (tl) pts[pts.length - 1] = [pts[pts.length - 1]![0] + tl.x, pts[pts.length - 1]![1] + tl.y, pts[pts.length - 1]![2] + tl.z];
        return { ...w, pts };
      }),
      dots: scene.dots.map((d) => (d.at ? { ...d, at: mv3(d.at, d.target) } : d)),
    } as Scene,
  };
}

export function render(scene0: Scene, style: Partial<Style> = {}, options: Options = {}): string {
  const given = { ...DEFAULT, ...style };
  places = 10 ** (given.precision ?? 2);
  const { fade, spin, scene } = atTime(scene0, options.at ?? 0, given.view);
  // something faded out is drawn see through, as one piece with what it carries
  const faded = (name: string, svg: string) => {
    const o = fade.get(name);
    return o === undefined || o >= 1 ? svg : o <= 0 ? "" : `<g opacity="${+o.toFixed(4)}">${svg}</g>`;
  };
  const { unit, ox, oy } = options.frame ?? fit(scene, given);
  const canvasW = options.frame?.width ?? given.size, canvasH = options.frame?.height ?? given.size;
  // a style that gives its line weights in scene units has them turned into
  // pixels here, now that the figure's own unit is known
  const k = given.unitStrokes ? unit : 1;
  const st = {
    ...given,
    strokeWidth: given.strokeWidth * k,
    ...(given.detailWidth === undefined ? {} : { detailWidth: given.detailWidth * k }),
    ...(given.arrowWidth === undefined ? {} : { arrowWidth: given.arrowWidth * k }),
  };
  const to = (p: { x: number; y: number; z: number }): P2 => {
    const s = project(p, unit, st.view);
    return { x: s.x + ox, y: s.y + oy };
  };

  // motion: a figure without any draws exactly as before. with it, whatever moves
  // is wrapped in groups carrying either a css animation or, for a still frame,
  // the transform and opacity of that moment
  const moves = plan(scene, to, unit, options.loop, {
    ...(options.lenient === undefined ? {} : { lenient: options.lenient }),
    ...(options.notes === undefined ? {} : { notes: options.notes }),
  });
  if (options.timing) options.timing.settled = moves ? moves.settled : null;
  const figureId = `m${hash(JSON.stringify(scene))}`;
  const rules: string[] = [];
  const classOf = new Map<Track, string>();
  const num = (n: number) => (Math.round(n * 1000) / 1000).toString();
  const cls = (t: Track) => {
    let c = classOf.get(t);
    if (c) return c;
    c = `${figureId}-${classOf.size}`;
    classOf.set(t, c);
    const frames = t.keys.map((k) => {
      const pct = t.period > 0 ? (100 * k.at) / t.period : 100;
      return `${num(pct)}%{transform:translate(${num(k.look.tx)}px,${num(k.look.ty)}px) scale(${num(k.look.s)});` +
        `opacity:${num(k.look.o)};animation-timing-function:cubic-bezier(${k.ease.join(",")})}`;
    }).join("");
    rules.push(`@keyframes ${c}k{${frames}}` +
      `.${c}{transform-box:view-box;transform-origin:${num(t.origin.x)}px ${num(t.origin.y)}px;` +
      `animation:${c}k ${num(t.period)}s linear ${num(t.delay)}s ${t.repeat ? "infinite" : "1"} both}`);
    return c;
  };
  const wrap = (t: Track | undefined, inner: string) => {
    if (!t || !inner) return inner;
    if (options.at === undefined) return `<g class="${cls(t)}">${inner}</g>`;
    const l = lookAt(t, options.at);
    const ex = (1 - l.s) * t.origin.x + l.tx, ey = (1 - l.s) * t.origin.y + l.ty;
    return `<g transform="matrix(${num(l.s)} 0 0 ${num(l.s)} ${num(ex)} ${num(ey)})" opacity="${num(Math.max(0, Math.min(1, l.o)))}">${inner}</g>`;
  };
  // a solid, or a mark drawn on it, moves with that solid's entrance and float or pulse
  // under the pointer a solid rises, slides out or lights up. a still, unseen copy of
  // its outline takes the pointer, so a part that moves away from it does not flicker
  // back; the move itself is css, so it works in a saved svg as well as on the page
  let hoverRules = false;
  // each hovered part, numbered, with how far it moves on the page; and what rides on
  // it, so a word printed on a card goes out with the card and lets the pointer through
  type Hov = { k: number; kind: "lift" | "open" | "glow"; dx: number; dy: number; b: Box };
  let hovs: Map<string, Hov> | null = null;
  const riders = new Map<string, Hov>();
  const hoverParts = () => {
    if (hovs) return hovs;
    hovs = new Map();
    const o = to({ x: 0, y: 0, z: 0 });
    for (const h of scene.motion.hovers) {
      const e = to({ x: h.by[0], y: h.by[1], z: h.by[2] });
      for (const b of byName.values()) {
        if (b.name !== h.target && !b.name.startsWith(`${h.target}.`)) continue;
        if (b.name === h.target && [...byName.keys()].some((n) => n.startsWith(`${h.target}.`))) continue;
        hovs.set(b.name, { k: hovs.size, kind: h.kind, dx: e.x - o.x, dy: e.y - o.y, b });
      }
    }
    // whatever rests on a hovered part, and on that, rides with it
    for (let pass = 0; pass < 4; pass++) {
      for (const c of byName.values()) {
        if (hovs.has(c.name) || riders.has(c.name)) continue;
        const cx = c.x + c.w / 2, cy = c.y + c.d / 2;
        for (const [n, hv] of [...hovs, ...riders]) {
          const u = hv.b;
          if (n === c.name) continue;
          if (Math.abs(c.z - (u.z + u.h)) < 0.13 && cx > u.x && cx < u.x + u.w && cy > u.y && cy < u.y + u.d) { riders.set(c.name, { ...hv, b: c }); break; }
        }
      }
    }
    return hovs;
  };
  const hovered = (name: string, inner: string): string => {
    if (options.at === undefined && inner && scene.motion.hovers.length) hoverParts();
    const h = options.at === undefined && inner ? hovs?.get(name) : undefined;
    const ride = !h && options.at === undefined && inner ? riders.get(name) : undefined;
    if (!h && !ride) return inner;
    const F = figureId;
    if (!hoverRules) {
      hoverRules = true;
      rules.push(`.${F}-hm{transition:transform .32s cubic-bezier(.3,1.35,.5,1)}` +
        `.${F}-hv:hover .${F}-hm{transform:translate(var(--hx),var(--hy))}` +
        // a glow is a halo as well as a lit edge, so it shows on a part already in the accent
        `.${F}-glow:hover .${F}-hm{filter:drop-shadow(0 0 2px ${st.accentLine}) drop-shadow(0 0 5px ${st.accentLine})}` +
        `.${F}-glow:hover .${F}-hm *{stroke:${st.accentLine}}` +
        `@media (prefers-reduced-motion:reduce){.${F}-hm{transition:none}}`);
    }
    const hv = (h ?? ride)!;
    const move = `--hx:${num(hv.dx)}px;--hy:${num(hv.dy)}px`;
    if (ride) {
      // a rider never takes the pointer itself: the part under it does
      if (!rules.some((r) => r.startsWith(`svg:has(.${F}-hk${hv.k}:hover)`))) {
        rules.push(`svg:has(.${F}-hk${hv.k}:hover) .${F}-hr${hv.k}{transform:translate(var(--hx),var(--hy))}`);
      }
      return `<g class="${F}-hm ${F}-hr${hv.k}" style="${move};pointer-events:none">${inner}</g>`;
    }
    const hit = hull(corners(hv.b).map(to));
    return `<g class="${F}-hv ${F}-hk${hv.k}${hv.kind === "glow" ? ` ${F}-glow` : ""}">` +
      `<polygon points="${hit.map((q) => `${f(q.x)},${f(q.y)}`).join(" ")}" fill="transparent" stroke="none" pointer-events="all"/>` +
      `<g class="${F}-hm" style="${move}">${inner}</g></g>`;
  };
  const named = (name: string, svg: string) => (options.ids && svg ? `<g data-name="${escapeText(name)}">${svg}</g>` : svg);
  const withSolid = (name: string, inner: string) => named(name, wrap(moves?.enter.get(name), wrap(moves?.ambient.get(name), hovered(name, inner))));
  // a flowing arrow's dashes: css shifts them from each line's own offset, a still frame shifts them now
  let flowClass = "";
  // always writes the offset even when it is 0, which routed pieces have always done
  const flowAttrs = (arrow: string, base: number, always = false) => {
    const t = moves?.flows.get(arrow);
    if (!t) return base || always ? ` stroke-dashoffset="${f(base)}"` : "";
    if (options.at !== undefined) return ` stroke-dashoffset="${f(base + lookAt(t, options.at).dash)}"`;
    if (!flowClass) {
      flowClass = `${figureId}-flow`;
      rules.push(`@keyframes ${flowClass}k{from{stroke-dashoffset:var(--o,0px)}to{stroke-dashoffset:calc(var(--o,0px) - 11px)}}` +
        `.${flowClass}{animation:${flowClass}k 0.8s linear infinite}`);
    }
    return ` class="${flowClass}" style="--o:${f(base)}px"${base || always ? ` stroke-dashoffset="${f(base)}"` : ""}`;
  };
  const dashed = ` stroke-dasharray="${st.dash}"`;
  const topCentre = (b: Box) => to({ x: b.x + b.w / 2, y: b.y + b.d / 2, z: b.z + b.h });
  const screenBox = (b: Box) => {
    const pts = corners(b).map(to);
    return {
      x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)),
      y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)),
    };
  };
  // the stretch of an arrow from t0 to t1, with the head when it reaches the end.
  // dashes carry on across pieces through the offset
  function arrowSvg(a: Arrow, t0: number, t1: number, head: boolean): string {
    const p = to(xyz(point(a, t0))), q = to(xyz(point(a, t1)));
    const start = to(xyz(point(a, 0))), end = to(xyz(point(a, 1)));
    const colour = a.accent ? ` stroke="${st.accentLine}" stroke-width="${f(st.arrowWidth ?? st.strokeWidth + 1)}"` : "";
    const dashedHere = a.dashed || !!moves?.flows.has(a.name);
    const offset = flowAttrs(a.name, t0 > 0 ? Math.hypot(p.x - start.x, p.y - start.y) : 0);
    let svg = `<line x1="${f(p.x)}" y1="${f(p.y)}" x2="${f(q.x)}" y2="${f(q.y)}"${dashedHere ? dashed + offset : ""}${colour}/>`;
    if (head) {
      const ang = Math.atan2(end.y - start.y, end.x - start.x);
      if (st.arrowHead === "up") {
        const s = st.strokeWidth / 2.1;
        const ink = a.accent ? st.accentLine : st.stroke;
        const P = (dx: number, dy: number) => `${f(end.x + dx * s)},${f(end.y + dy * s)}`;
        svg += `<polygon points="${P(0, -16)} ${P(15, 12)} ${P(0, 4)} ${P(-15, 12)}" fill="${ink}" ` +
          `stroke="${st.stroke}" stroke-width="${f(1.4 * s)}"/>`;
        return svg;
      }
      const solid = st.arrowHead === "solid";
      const size = solid ? 13 : 9;
      const spread = solid ? 0.3 : 0.4;
      const wing = (s: number) => `${f(end.x - size * Math.cos(ang - s))},${f(end.y - size * Math.sin(ang - s))}`;
      if (solid) {
        // a filled head, notched at the back so it reads as a head and not a wedge
        const ink = a.accent ? st.accentLine : st.stroke;
        const notch = `${f(end.x - size * 0.62 * Math.cos(ang))},${f(end.y - size * 0.62 * Math.sin(ang))}`;
        svg += `<polygon points="${f(end.x)},${f(end.y)} ${wing(spread)} ${notch} ${wing(-spread)}" fill="${ink}" stroke="${ink}" stroke-width="${f(st.strokeWidth * 0.5)}"/>`;
      } else {
        svg += `<polyline points="${wing(spread)} ${f(end.x)},${f(end.y)} ${wing(-spread)}"${colour}/>`;
      }
    }
    return svg;
  }

  // glyphs are in here too, so a label or a link can point at one
  // a tinted face wins over the accent colour, and a plain one stays white
  // a face is the same colour as its solid, moved toward black or white by the
  // style's shading. done here rather than with three palette entries so a style
  // only has to name one colour per surface.
  const rgb = (hex: string): [number, number, number] | null => {
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null;
    const full = hex.length === 4 ? "#" + [...hex.slice(1)].map((c) => c + c).join("") : hex;
    return [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
  };

  // A face in shadow moves toward the line colour, not toward black. Multiplying
  // a white face by 0.9 gives grey, and a figure whose faces are white and grey
  // reads as a photograph of a model rather than a drawing; the references all
  // put their shadows in the same hue as the ink.
  const shaded = (hex: string, k: number): string => {
    const c = rgb(hex);
    if (k === 1 || !c) return hex;
    const toward = k < 1 ? (rgb(st.stroke) ?? [0, 0, 0]) : ([255, 255, 255] as [number, number, number]);
    const amount = k < 1 ? 1 - k : k - 1;
    const mix = c.map((v, i) => Math.round(v + (toward[i]! - v) * amount));
    return "#" + mix.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
  };

  // the tone a face is actually painted: the style's own if this is a plain face
  // and the style names them, otherwise the shaded version of whatever it carries
  const toneOf = (fill: string, id: "top" | "left" | "right", role: string): string =>
    role === "face" && st.faces ? st.faces[id]
      : role === "accent" && st.lit && id === "top" ? st.lit
        : role === "tint" && st.tintTop && id === "top" ? st.tintTop
        : shaded(fill, st.shade?.[id] ?? 1);

  const tone = (name: string): string => {
    // a tone part of the way from another, as an edge warming as something
    // passes: hi:86 is 86 parts hi to 14 of the plain edge, hi:86:rim of the rim tone
    // a colour given outright as six hex digits, for a figure that works out its
    // own tones (a # would start a comment)
    if (/^[0-9a-f]{6}$/i.test(name)) return `#${name}`;
    const mix = /^(\w+):(\d+(?:\.\d+)?)(?::(\w+))?$/.exec(name);
    if (mix) {
      const a = tone(mix[1]!), b = tone(mix[3] ?? "sil"), w = Math.min(Math.max(Number(mix[2]) / 100, 0), 1);
      const ch = (c: string, k: number) => parseInt(c.slice(1 + 2 * k, 3 + 2 * k), 16);
      if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return a;
      return "#" + [0, 1, 2].map((k) => Math.round(ch(a, k) * w + ch(b, k) * (1 - w)).toString(16).padStart(2, "0")).join("");
    }
    switch (name) {
      case "none": return "none";
      case "top": return st.faces?.top ?? st.face;
      case "left": return st.faces?.left ?? shaded(st.face, st.shade?.left ?? 0.9);
      case "right": return st.faces?.right ?? shaded(st.face, st.shade?.right ?? 0.8);
      case "deep": return st.deep ?? shaded(st.stroke, 1.55);
      case "lit": return st.lit ?? st.accent;
      case "accent": return st.accentLine;
      case "thin": return st.thin ?? shaded(st.stroke, 1.45);
      case "faint": return shaded(st.stroke, 1.79);
      case "hi": return st.hiTone ?? st.accentLine;
      case "sil": return st.sil ?? st.stroke;
      case "rim": return st.rimTone ?? st.stroke;
      default: return st.stroke;
    }
  };

  const paint = (b: Box, accent?: boolean): string =>
    (b.tint && st.palette[b.tint as keyof typeof st.palette]) || (accent ? st.accent : st.face);

  // what that fill means, kept next to the colour so the page can retheme a
  // figure without having to recognise the style's hex values
  const roleOf = (b: Box, accent?: boolean): string => (b.tint ? "tint" : accent ? "accent" : "face");

  const byName = new Map<string, Box>([
    ...scene.boxes.map((b): [string, Box] => [b.name, b]),
    ...scene.cyls.map((c): [string, Box] => [c.name, cylBox(c)]),
    ...scene.cones.map((c): [string, Box] => [c.name, coneBox(c)]),
    ...scene.icons.map((g): [string, Box] => [g.name, iconBox(g)]),
  ]);
  // a grid has no solid of its own name, only its cubes, so it is found as the room they fill
  const whole = (n: string): Box | undefined => {
    const parts = [...byName.values()].filter((b) => b.name.startsWith(`${n}.`));
    if (!parts.length) return undefined;
    const x = Math.min(...parts.map((b) => b.x)), y = Math.min(...parts.map((b) => b.y)), z = Math.min(...parts.map((b) => b.z));
    return { name: n, x, y, z, w: Math.max(...parts.map((b) => b.x + b.w)) - x, d: Math.max(...parts.map((b) => b.y + b.d)) - y, h: Math.max(...parts.map((b) => b.z + b.h)) - z };
  };
  const look = (n: string) => byName.get(n) ?? byName.get(`${n}.floor`) ?? byName.get(`${n}.0`) ?? whole(n);

  const solids: string[] = [];
  const over: string[] = [];

  type Drawable = { key: number; svg: string };
  const drawables: Drawable[] = [];

  // boxes and cylinders share one back to front order, worked out from the room
  // each takes up. drawing cylinders last regardless put a cylinder standing
  // behind a box on top of it
  const cylOf = new Map<Box, Cyl>();
  for (const c of scene.cyls) cylOf.set(cylBox(c), c);
  const coneOf = new Map<Box, Cone>();
  for (const c of scene.cones) coneOf.set(coneBox(c), c);
  const plateOf = new Map<Box, (typeof scene.plates)[number]>();


  // a plate's own two coordinates and its level, back into x y z
  const plateAt = (pl: (typeof scene.plates)[number], u: number, v: number, lift = 0) => {
    const l = pl.z + lift;
    const p = turned(pl.axis === "z" ? { x: u, y: v, z: l } : pl.axis === "y" ? { x: u, y: l, z: v } : { x: l, y: u, z: v }, pl.turn, pl.pivot ?? [0, 0]);
    return leaned(p, pl.tilt, pl.hinge ?? [p.y, 0]);
  };
  for (const pl of scene.plates) {
    if (pl.on) continue;
    const xs = pl.pts.map((q) => q[0]), ys = pl.pts.map((q) => q[1]);
    const u0 = Math.min(...xs), v0 = Math.min(...ys), u1 = Math.max(...xs), v1 = Math.max(...ys);
    // the room its corners take, turned and leaned as it is drawn
    const cs = [[u0, v0], [u1, v0], [u0, v1], [u1, v1]].flatMap(([u, v]) => [plateAt(pl, u!, v!), plateAt(pl, u!, v!, pl.h ?? 0)]);
    const lo = (k: "x" | "y" | "z") => Math.min(...cs.map((q) => q[k])), hi = (k: "x" | "y" | "z") => Math.max(...cs.map((q) => q[k]));
    plateOf.set({ name: pl.name, x: lo("x"), y: lo("y"), z: lo("z"), w: hi("x") - lo("x"), d: hi("y") - lo("y"), h: hi("z") - lo("z"),
      ...(pl.over ? { over: pl.over } : {}) }, pl);
  }
  // a dot at a point of its own sorts in depth like a speck of a solid, when the
  // style draws everything back to front
  const dotOf = new Map<Box, (typeof scene.dots)[number]>();
  if (st.hairline) for (const d of scene.dots) if (d.at && !d.on) dotOf.set({ name: d.target, x: d.at[0], y: d.at[1], z: d.at[2], w: 0, d: 0, h: 0 }, d);
  const dishOf = new Map<Box, (typeof scene.dishes)[number]>();
  for (const d of scene.dishes) dishOf.set({ name: d.name, x: d.at[0] - d.r, y: d.at[1] - d.r, z: d.at[2] - d.r, w: 2 * d.r, d: 2 * d.r, h: 2 * d.r,
    ...(d.over ? { over: d.over } : {}) }, d);
  const tubeOf = new Map<Box, (typeof scene.tubes)[number]>();
  for (const tb of scene.tubes) {
    const lo = (k: 0 | 1 | 2) => Math.min(...tb.pts.map((q) => q[k])) - tb.r, hi = (k: 0 | 1 | 2) => Math.max(...tb.pts.map((q) => q[k])) + tb.r;
    tubeOf.set({ name: tb.name, x: lo(0), y: lo(1), z: lo(2), w: hi(0) - lo(0), d: hi(1) - lo(1), h: hi(2) - lo(2), ...(tb.over ? { over: tb.over } : {}) }, tb);
  }
  const rodOf = new Map<Box, (typeof scene.rods)[number]>();
  for (const r of scene.rods) {
    const m = Math.max(r.r0, r.r1), lo = (k: 0 | 1 | 2) => Math.min(r.from[k], r.to[k]) - m, hi = (k: 0 | 1 | 2) => Math.max(r.from[k], r.to[k]) + m;
    rodOf.set({ name: r.name, x: lo(0), y: lo(1), z: lo(2), w: hi(0) - lo(0), d: hi(1) - lo(1), h: hi(2) - lo(2), ...(r.over ? { over: r.over } : {}) }, r);
  }
  const labelOf = new Map<Box, (typeof scene.labels)[number]>();
  // a level ring takes up the flat room of the circle it is, not just its middle
  for (const l of scene.labels) if (!l.on) {
    const r = l.shape === "ring" ? (l.r ?? 0) : 0;
    labelOf.set({ name: l.name, x: l.at[0] - r, y: l.at[1] - r, z: l.at[2], w: 2 * r, d: 2 * r, h: 0, ...(l.over ? { over: l.over } : {}) }, l);
  }
  const wireOf = new Map<Box, (typeof scene.wires)[number]>();
  for (const wr of scene.wires) {
    if (wr.on) continue;
    const lo = (k: 0 | 1 | 2) => Math.min(...wr.pts.map((q) => q[k])), hi = (k: 0 | 1 | 2) => Math.max(...wr.pts.map((q) => q[k]));
    wireOf.set({ name: wr.name, x: lo(0), y: lo(1), z: lo(2), w: hi(0) - lo(0), d: hi(1) - lo(1), h: hi(2) - lo(2) }, wr);
  }
  const ruleOf = new Map<Box, (typeof scene.rules)[number]>();
  for (const r of scene.rules) {
    if (r.on) continue;
    const [a, c] = [r.from, r.to];
    ruleOf.set({ name: r.name, x: Math.min(a[0], c[0]), y: Math.min(a[1], c[1]), z: Math.min(a[2], c[2]),
      w: Math.abs(a[0] - c[0]), d: Math.abs(a[1] - c[1]), h: Math.abs(a[2] - c[2]) }, r);
  }
  // glyphs join the same order, so a solid standing in front of one covers it
  const iconOf = new Map<Box, Icon>();
  // an icon on a solid fits that solid's top: centred where it was put, and sized
  // to the face rather than left a small sticker on a big plate or spilling off a
  // small cube. what it sits on is kept, so it can be set into that face
  const hostOf = new Map<string, Box & { round?: boolean }>();
  // an upright cylinder's top is a disc: what fits on it is the square inside it
  const discs = scene.cyls.filter((c) => c.axis === "z").map((c) => ({ name: c.name, x: c.x, y: c.y, z: c.z, w: 2 * c.r, d: 2 * c.r, h: c.h, accent: c.accent, tint: c.tint, round: true }));
  const fitted = scene.icons.map((g) => {
    const cx = g.x + g.size / 2, cy = g.y + g.size / 2;
    const host = [...scene.boxes, ...discs]
      .filter((b) => Math.abs(b.z + b.h - g.z) < 0.12 && cx > b.x && cx < b.x + b.w && cy > b.y && cy < b.y + b.d)
      .sort((a, b) => Math.abs(a.z + a.h - g.z) - Math.abs(b.z + b.h - g.z) || a.w * a.d - b.w * b.d)[0];
    if (!host) return g;
    hostOf.set(g.name, host);
    const side = Math.min(host.w, host.d) * ("round" in host ? Math.SQRT1_2 : 1);
    // centred on the face it is the face's emblem and grows to fill it; put off to
    // one side it is a mark beside something else, and keeps about its own size
    const centred = Math.abs(cx - (host.x + host.w / 2)) < 0.2 * host.w && Math.abs(cy - (host.y + host.d / 2)) < 0.2 * host.d;
    const size = Math.min(0.72 * side, centred ? Math.max(1.4 * g.size, 0.5 * side) : 1.2 * g.size);
    // kept on the face, however near its edge it was asked for
    const half = size / 2 + 0.06 * side;
    const x = Math.min(Math.max(cx, host.x + half), host.x + host.w - half), y = Math.min(Math.max(cy, host.y + half), host.y + host.d - half);
    // a model puts it near the top, not always on it
    return { ...g, size, x: x - size / 2, y: y - size / 2, z: host.z + host.h };
  });
  for (const g of fitted) iconOf.set(iconBox(g), g);
  // the panels icons are set into, on screen: a leader starting on one starts at
  // its edge instead, so it never runs through the glyph
  const panels: P2[][] = [];
  const inside = (q: P2, poly: P2[]) => {
    let sign = 0;
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k]!, b = poly[(k + 1) % poly.length]!;
      const c = Math.sign((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x));
      if (c && sign && c !== sign) return false;
      sign ||= c;
    }
    return true;
  };
  // a line that starts on an icon panel, a leader or a link, starts where it leaves the panel
  const offPanel = (a: P2, b: P2): P2 => {
    const poly = panels.find((p) => inside(a, p));
    if (!poly) return a;
    let lo = 0, hi = 1;
    if (inside(b, poly)) return a;
    for (let k = 0; k < 30; k++) {
      const t = (lo + hi) / 2;
      if (inside({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, poly)) lo = t; else hi = t;
    }
    return { x: a.x + (b.x - a.x) * hi, y: a.y + (b.y - a.y) * hi };
  };
  const pivotOf = (b: Box): [number, number] => b.pivot ?? [b.x + b.w / 2, b.y + b.d / 2];
  const turnOf = new Map<Box, Box>();
  const fronts = new Set<Box>();
  const sortBoxes = scene.boxes.flatMap((b): Box[] => {
    if (b.open) {
      const back = { ...b, shell: "back" as const }, front = { ...b, name: `${b.name}.front`, shell: "front" as const };
      turnOf.set(back, b); turnOf.set(front, b); fronts.add(front);
      return [back, front];
    }
    if (!b.turn && !b.cut && !b.tilt && !b.roll) return [b];
    // a cut solid only takes up the window it is squashed into
    let c0 = b;
    if (b.cut) {
      const [lo, hi] = b.cut;
      const clip = (s: number, e: number) => { const a = Math.min(Math.max(s, lo), hi), z = Math.min(Math.max(s + e, lo), hi); return [a, z - a] as const; };
      if ((b.axis ?? "z") === "z") { const [y, d] = clip(b.y, b.d); c0 = { ...b, y, d }; } else { const [z, h] = clip(b.z, b.h); c0 = { ...b, z, h }; }
    }
    const cs = corners(c0).map((q) => posed(b, q, pivotOf(b)));
    const xs = cs.map((q) => q.x), ys = cs.map((q) => q.y);
    const proxy = { ...b, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), d: Math.max(...ys) - Math.min(...ys) };
    turnOf.set(proxy, b);
    return [proxy];
  });
  // the view decides which side of a box is its front
  const azv = ((st.view?.az ?? 45) * Math.PI) / 180;
  const facingEye = { x: Math.sin(azv) >= 0 ? 1 : -1, y: Math.cos(azv) >= 0 ? 1 : -1 } as const;
  const sorted = order([...sortBoxes, ...cylOf.keys(), ...coneOf.keys(), ...ruleOf.keys(), ...plateOf.keys(), ...dotOf.keys(), ...dishOf.keys(), ...rodOf.keys(), ...tubeOf.keys(), ...labelOf.keys(), ...wireOf.keys(), ...iconOf.keys()], facingEye);
  const edgeLine = (sg: Seg, dash: boolean) =>
    `<line x1="${f(sg[0].x)}" y1="${f(sg[0].y)}" x2="${f(sg[1].x)}" y2="${f(sg[1].y)}"${dash ? ` stroke-dasharray="${st.dash}"` : ""}/>`;

  const poly = (pts: P2[], fill: string, stroke = true, role = "") =>
    `<polygon points="${pts.map((p) => `${f(p.x)},${f(p.y)}`).join(" ")}" fill="${fill}"${role ? ` data-role="${role}"` : ""}${stroke ? "" : ' stroke="none"'}/>`;

  // a solid with an outline of its own, a star or a letter: the outline pushed out
  // into a prism. its sides that face us are drawn far to near, and runs of sides
  // that turn only a little are one smooth strip, so a ring is not striped with
  // seams; the end facing us goes on top with any holes cut out of it
  const prismSvg = (b: Box): string => {
    const o = b.outline!;
    const fill = paint(b, b.accent), role = roleOf(b, b.accent);
    const az = ((st.view?.az ?? 45) * Math.PI) / 180, kk = st.view?.k ?? 1 / Math.sqrt(3);
    const eye = { x: Math.sin(az), y: Math.cos(az), z: kk / Math.sqrt(1 - kk * kk) };
    const [lo, hi] = o.along === "z" ? [b.z, b.z + b.h] : o.along === "y" ? [b.y, b.y + b.d] : [b.x, b.x + b.w];
    const near = (o.along === "z" ? eye.z : o.along === "y" ? eye.y : eye.x) > 0 ? hi : lo, far = near === hi ? lo : hi;
    const at = ([u, v]: [number, number], t: number): P3 =>
      o.along === "z" ? { x: b.x + u, y: b.y + v, z: t } : o.along === "y" ? { x: b.x + u, y: t, z: b.z + v } : { x: t, y: b.y + u, z: b.z + v };
    const normal = (nu: number, nv: number) =>
      o.along === "z" ? { x: nu, y: nv, z: 0 } : o.along === "y" ? { x: nu, y: 0, z: nv } : { x: 0, y: nu, z: nv };
    const rings = b.r ? o.rings.map((r) => fillet(r, r.map(() => b.r!), 3)) : o.rings;
    const strips: { depth: number; svg: string }[] = [];
    for (const ring of rings) {
      const n = ring.length;
      const edges = ring.map((p, k) => {
        const q = ring[(k + 1) % n]!, du = q[0] - p[0], dv = q[1] - p[1], l = Math.hypot(du, dv) || 1;
        const nn = normal(dv / l, -du / l);
        return { p, q, nn, faces: nn.x * eye.x + nn.y * eye.y + nn.z * eye.z > 1e-6, angle: Math.atan2(-du, dv) };
      });
      const bend = (a: number, c: number) => Math.abs(((a - c + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      const joins = (k: number) => edges[k]!.faces && edges[(k + 1) % n]!.faces && bend(edges[k]!.angle, edges[(k + 1) % n]!.angle) < (25 * Math.PI) / 180;
      // start each strip where the one before it does not run on into it
      let start = edges.findIndex((_, k) => edges[k]!.faces && !joins((k + n - 1) % n));
      if (start < 0) start = edges.findIndex((e) => e.faces);
      if (start < 0) continue;
      for (let k = 0, i = start; k < n; ) {
        const e = edges[i]!;
        if (!e.faces) { k++; i = (i + 1) % n; continue; }
        const run = [e];
        while (k + run.length < n && joins((i + run.length - 1) % n)) run.push(edges[(i + run.length) % n]!);
        const chain = [run[0]!.p, ...run.map((r) => r.q)];
        const m = run.reduce((s2, r) => ({ x: s2.x + r.nn.x, y: s2.y + r.nn.y, z: s2.z + r.nn.z }), { x: 0, y: 0, z: 0 });
        const id: "top" | "left" | "right" = m.z >= m.x && m.z >= m.y ? "top" : m.x >= m.y ? "right" : "left";
        const pts3 = [...chain.map((c) => at(c, far)), ...[...chain].reverse().map((c) => at(c, near))];
        const mid = pts3.reduce((s2, p) => s2 + p.x * eye.x + p.y * eye.y + p.z * eye.z, 0) / pts3.length;
        strips.push({ depth: mid, svg: poly(pts3.map(to), toneOf(fill, id, role), true, role) });
        k += run.length; i = (i + run.length) % n;
      }
    }
    strips.sort((a2, c) => a2.depth - c.depth);
    const capId: "top" | "left" | "right" = o.along === "z" ? "top" : o.along === "y" ? "left" : "right";
    const d = rings.map((r) => "M" + r.map((q) => { const p = to(at(q, near)); return `${f(p.x)},${f(p.y)}`; }).join("L") + "Z").join("");
    return strips.map((x) => x.svg).join("") + `<path d="${d}" fill="${toneOf(fill, capId, role)}" fill-rule="evenodd" data-role="${role}"/>`;
  };

  const dotSvg = (dot: (typeof scene.dots)[number]) => {
    const p = to({ x: dot.at![0], y: dot.at![1], z: dot.at![2] });
    if (dot.look) return faded(dot.target, `<circle class="${dot.look}" cx="${f(p.x)}" cy="${f(p.y)}" r="${f((dot.r ?? 0.3) * unit)}"/>`);
    return `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f((dot.r ?? 0.3) * unit)}" fill="${tone(dot.fill ?? "hi")}" stroke="none"/>`;
  };
  // a parabolic dish. its frame: h level along the aim, e level across it, a the
  // aim itself tipped up by el, u square to a and e. the bowl sits along a from
  // the pivot, its lip at radius r
  const dishSvg = (d: (typeof scene.dishes)[number]) => {
    type V = [number, number, number];
    const ax = (p: V, q: V, s: number): V => [p[0] + q[0] * s, p[1] + q[1] * s, p[2] + q[2] * s];
    const dot3 = (p: V, q: V) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    const t = (d.az * Math.PI) / 180, ph = (d.el * Math.PI) / 180, c = Math.cos(ph), s = Math.sin(ph);
    const h: V = [Math.cos(t), Math.sin(t), 0], e: V = [-Math.sin(t), Math.cos(t), 0];
    const a: V = [h[0] * c, h[1] * c, s], u: V = [-h[0] * s, -h[1] * s, c];
    // the horn, hub and their offsets are drawn for a lip of 26 and scale with it
    const R = d.r, FOC = d.focus, DEP = (R * R) / (4 * FOC), PIV = d.at, m = R / 26;
    const onDish = (along: number, rho: number, psi: number) => ax(ax(ax(PIV, a, along), e, rho * Math.cos(psi)), u, rho * Math.sin(psi));
    const disc = (cc: V, x: V, y: V, r: number, n: number) =>
      Array.from({ length: n }, (_, k) => ax(ax(cc, x, r * Math.cos((2 * Math.PI * k) / n)), y, r * Math.sin((2 * Math.PI * k) / n)));
    const P = (q: V) => to({ x: q[0], y: q[1], z: q[2] });
    const pts = (qs: P2[]) => qs.map((q) => `${f(q.x)},${f(q.y)}`).join(" ");
    const az = ((st.view?.az ?? 45) * Math.PI) / 180, kk = st.view?.k ?? 1 / Math.sqrt(3);
    const ev: V = [Math.sin(az), Math.cos(az), kk / Math.sqrt(1 - kk * kk)], el = Math.hypot(...ev);
    const VD: V = [ev[0] / el, ev[1] / el, ev[2] / el];
    // a ring on the inside of the bowl, only as far as the lip leaves it in view
    const seen = (rho: number, n: number) => {
      const along = (rho * rho) / (4 * FOC) - DEP, tt = -along / dot3(a, VD), q: V[] = [], sd: number[] = [];
      for (let k = 0; k < n; k++) {
        q.push(onDish(along, rho, (2 * Math.PI * k) / n));
        const hit = ax(q[k]!, VD, tt);
        sd.push(R - Math.hypot(hit[0] - PIV[0], hit[1] - PIV[1], hit[2] - PIV[2]));
      }
      const tone2 = st.rimTone ?? st.stroke;
      if (sd.every((x) => x > 0)) return `<polygon points="${pts(q.map(P))}" fill="none" stroke="${tone2}"/>`;
      const i0 = sd.findIndex((x, k) => x > 0 && sd[(k + n - 1) % n]! <= 0);
      if (i0 < 0) return "";
      const cut = (k: number, j: number) => P(ax(q[k]!, [q[j]![0] - q[k]![0], q[j]![1] - q[k]![1], q[j]![2] - q[k]![2]], sd[k]! / (sd[k]! - sd[j]!)));
      const out = [cut((i0 + n - 1) % n, i0)];
      let k = i0;
      while (sd[k]! > 0) { out.push(P(q[k]!)); k = (k + 1) % n; }
      out.push(cut((k + n - 1) % n, k));
      return `<polyline points="${pts(out)}" fill="none" stroke="${tone2}"/>`;
    };
    const lip = disc(PIV, e, u, R, 72), back: V[] = [];
    for (const fr of [0, 0.35, 0.6, 0.78, 0.9, 0.97, 1])
      for (let k = 0; k < 40; k++) back.push(onDish((fr * fr * R * R) / (4 * FOC) - DEP - d.skin, fr * R, (2 * Math.PI * k) / 40));
    const mouth = onDish(FOC - DEP - 3 * m, 0, 0), tail = onDish(FOC - DEP + 3 * m, 0, 0), mp = P(mouth);
    const sil = st.sil ?? st.stroke;
    return `<polygon points="${pts(hull([...lip, ...back].map(P)))}" fill="${st.faces?.top ?? st.face}" stroke="${sil}"/>` +
      seen(0.62 * R, 48) + seen(3.2 * m, 20) +
      `<polygon points="${pts(lip.map(P))}" fill="none" stroke="${d.hi ? (st.hiTone ?? st.stroke) : sil}"/>` +
      [90, 210, 330].map((deg) => { const q = P(onDish(0, R, (deg * Math.PI) / 180)); return `<line x1="${f(q.x)}" y1="${f(q.y)}" x2="${f(mp.x)}" y2="${f(mp.y)}" fill="none" stroke="${st.stroke}"/>`; }).join("") +
      `<polygon points="${pts(hull([...disc(mouth, e, u, 3.6 * m, 16), ...disc(tail, e, u, 2.4 * m, 16)].map(P)))}" fill="${st.faces?.top ?? st.face}" stroke="${sil}"/>` +
      `<polygon points="${pts(disc(tail, e, u, 1.3 * m, 16).map(P))}" fill="none" stroke="${st.rimTone ?? st.stroke}"/>`;
  };
  // the tube's outline: its path as drawn, offset either side by its radius as
  // drawn, any loop where an offset crosses itself cut out, and each end closed
  // with the near half of a flat ring
  const tubeSvg = (tb: (typeof scene.tubes)[number]) => {
    const Q = tb.pts.map((q) => to({ x: q[0], y: q[1], z: q[2] }));
    const az = ((st.view?.az ?? 45) * Math.PI) / 180, kk = st.view?.k ?? 1 / Math.sqrt(3);
    const o = to({ x: 0, y: 0, z: 0 }), one = to({ x: Math.cos(az), y: -Math.sin(az), z: 0 }), rho = tb.r * Math.hypot(one.x - o.x, one.y - o.y);
    const n = Q.length, A: [number, number][] = [], Bk: [number, number][] = [];
    const stroke = tb.edge ? tone(tb.edge) : tb.hi ? (st.hiTone ?? st.stroke) : (st.sil ?? st.stroke), face = st.faces?.top ?? st.face;
    if (tb.round) {
      // a cable: each point pushed out square to the line through its neighbours,
      // and each end rounded off with a half circle
      const T: [number, number][] = [];
      for (let k = 0; k < n; k++) {
        const a = Q[Math.max(0, k - 1)]!, b = Q[Math.min(n - 1, k + 1)]!, l = Math.hypot(b.x - a.x, b.y - a.y) || 1, tt: [number, number] = [(b.x - a.x) / l, (b.y - a.y) / l];
        T.push(tt);
        A.push([Q[k]!.x - tt[1] * rho, Q[k]!.y + tt[0] * rho]);
        Bk.push([Q[k]!.x + tt[1] * rho, Q[k]!.y - tt[0] * rho]);
      }
      const end = (c: P2, tt: [number, number], s: number) => {
        const out: [number, number][] = [];
        for (let k = 1; k < 6; k++) {
          const th = (k / 6) * Math.PI, cs = Math.cos(th), sn = Math.sin(th);
          out.push([c.x + s * rho * (-tt[1] * cs + tt[0] * sn), c.y + s * rho * (tt[0] * cs + tt[1] * sn)]);
        }
        return out;
      };
      const ring = [...A, ...end(Q[n - 1]!, T[n - 1]!, 1), ...Bk.reverse(), ...end(Q[0]!, T[0]!, -1)];
      return `<polygon points="${ring.map(([x, y]) => `${f(x)},${f(y)}`).join(" ")}" fill="${face}" stroke="${stroke}"/>`;
    }
    for (let k = 0; k < n; k++) {
      const a = Q[Math.max(k - 1, 0)]!, c = Q[k]!, b = Q[Math.min(k + 1, n - 1)]!;
      const l0 = Math.hypot(c.x - a.x, c.y - a.y) || 1, l1 = Math.hypot(b.x - c.x, b.y - c.y) || 1;
      let tx = (c.x - a.x) / l0 + (b.x - c.x) / l1, ty = (c.y - a.y) / l0 + (b.y - c.y) / l1;
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      A.push([c.x - ty * rho, c.y + tx * rho]);
      Bk.push([c.x + ty * rho, c.y - tx * rho]);
    }
    const cross = (p: number[], q: number[], r: number[], s: number[]) => {
      const e0 = q[0]! - p[0]!, e1 = q[1]! - p[1]!, f0 = s[0]! - r[0]!, f1 = s[1]! - r[1]!, g0 = r[0]! - p[0]!, g1 = r[1]! - p[1]!;
      const d = e0 * f1 - e1 * f0;
      if (!d) return null;
      const tt = (g0 * f1 - g1 * f0) / d, uu = (g0 * e1 - g1 * e0) / d;
      return tt > 0 && tt < 1 && uu > 0 && uu < 1 ? ([p[0]! + tt * e0, p[1]! + tt * e1] as [number, number]) : null;
    };
    const untangle = (L: [number, number][]) => {
      for (let k = 0; k < L.length - 3; k++) for (let j = L.length - 2; j > k + 1; j--) {
        const x = cross(L[k]!, L[k + 1]!, L[j]!, L[j + 1]!);
        if (x) { L.splice(k + 1, j - k, x); break; }
      }
      return L;
    };
    const cap = (c: P2) => {
      const out: [number, number][] = [];
      for (let k = 7; k >= 1; k--) { const tt = (Math.PI * k) / 8; out.push([c.x + rho * Math.cos(tt), c.y + rho * kk * Math.sin(tt)]); }
      return out;
    };
    const ring = [...untangle(A), ...cap(Q[n - 1]!), ...untangle(Bk).reverse(), ...cap(Q[0]!)];
    return `<polygon points="${ring.map(([x, y]) => `${f(x)},${f(y)}`).join(" ")}" fill="${st.faces?.top ?? st.face}" ` +
      `stroke="${stroke}"/>`;
  };
  const boxNames = new Set(scene.boxes.map((b) => b.name));
  const cl = (look: string) => look.replace(/\./g, " ");
  const textEl = (look: string, x: number, y: number, text: string, size?: number, anchor?: string, weight?: string) =>
    `<text class="${cl(look)}" x="${f(x)}" y="${f(y)}"${anchor ? ` text-anchor="${anchor}"` : ""}` +
    `${size !== undefined || weight ? ` style="${size !== undefined ? `font-size:${size}px;` : ""}${weight ? `font-weight:${weight};` : ""}"` : ""}>${escapeText(text)}</text>`;
  const labelSvg = (l: (typeof scene.labels)[number]) => {
    const svg = labelOwnSvg(l);
    return options.ids && svg ? `<g data-line="${l.line}">${svg}</g>` : svg;
  };
  const labelOwnSvg = (l: (typeof scene.labels)[number]) => {
    const p = to({ x: l.at[0], y: l.at[1], z: l.at[2] });
    // a label can be turned about a point of its own, as a clock hand is
    const sp = spin.get(l.name), rot = (inner: string) => (sp ? `<g transform="rotate(${+sp[0].toFixed(4)} ${sp[1]} ${sp[2]})">${inner}</g>` : inner);
    const own = (inner: string) => (l.off || l.rot ? `<g transform="${l.off ? `translate(${l.off[0]} ${l.off[1]})` : ""}${l.rot ? ` rotate(${l.rot})` : ""}">${inner}</g>` : inner);
    const k = l.nums ?? [], at = (inner: string) => faded(l.name, `<g transform="translate(${+(p.x + l.dx).toFixed(4)} ${+(p.y + l.dy).toFixed(4)})">${rot(own(inner))}</g>`);
    if (l.shape === "text" && (l.off || l.rot || sp)) return at(textEl(l.look, k[0] ?? 0, k[1] ?? 0, l.text, l.size, l.anchor, l.weight));
    if (l.shape === "rect") return at(`<rect class="${cl(l.look)}" x="${k[0]}" y="${k[1]}" width="${k[2]}" height="${k[3]}"${k[4] !== undefined ? ` rx="${k[4]}"` : ""}/>`);
    if (l.shape === "line") return at(`<line class="${cl(l.look)}" x1="${k[0]}" y1="${k[1]}" x2="${k[2]}" y2="${k[3]}"/>`);
    if (l.shape === "circle") return at(`<circle class="${cl(l.look)}" cx="${k[0] ?? 0}" cy="${k[1] ?? 0}" r="${k[2] ?? l.r ?? 1}"/>`);
    if (l.shape === "path" && (l.off || l.rot || sp)) return at(`<path class="${cl(l.look)}" d="${escapeText(l.text)}"/>`);
    if (l.shape === "path") return faded(l.name, `<path class="${cl(l.look)}" transform="translate(${f(p.x + l.dx)} ${f(p.y + l.dy)})" d="${escapeText(l.text)}"/>`);
    // a level ring seen from above and to the side is an upright ellipse: its
    // width and height are where the ring's own x and y axes land on the page
    if (l.shape === "ring") {
      const r = (l.r ?? 1) / Math.SQRT2, a = to({ x: l.at[0] + r, y: l.at[1] - r, z: l.at[2] }), c = to({ x: l.at[0] + r, y: l.at[1] + r, z: l.at[2] });
      return faded(l.name, `<ellipse class="${cl(l.look)}" cx="${f(p.x + l.dx)}" cy="${f(p.y + l.dy)}" rx="${f(Math.abs(a.x - p.x))}" ry="${f(Math.abs(c.y - p.y))}"/>`);
    }
    // words are carried to their point by a translate and set off from it by x and y,
    // the way a moving label is drawn, so they fall on the same subpixels as one
    if (l.dx || l.dy) return faded(l.name, `<g transform="translate(${+p.x.toFixed(4)} ${+p.y.toFixed(4)})">${textEl(l.look, l.dx, l.dy, l.text, l.size, l.anchor, l.weight)}</g>`);
    return faded(l.name, textEl(l.look, p.x + l.dx, p.y + l.dy, l.text, l.size, l.anchor, l.weight));
  };
  const wireSvg = (wr: (typeof scene.wires)[number]) =>
    faded(wr.name, `<polyline class="${cl(wr.look)}" points="${wr.pts.map((q) => to({ x: q[0], y: q[1], z: q[2] })).map((p) => `${f(p.x)},${f(p.y)}`).join(" ")}"/>`);
  // a decal is drawn in its face's own frame, carried there by the face's matrix
  const decalSvg = (dc: (typeof scene.decals)[number]) => {
    const b = look(dc.target);
    if (!b) return "";
    const { x, y, z, w, d, h } = b, x1 = x + w, y1 = y + d, z1 = z + h;
    const [o0, u, v]: [P3, P3, P3] = dc.face === "top" ? [{ x, y, z: z1 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }]
      : dc.face === "left" ? [{ x, y: y1, z: z1 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }]
        : [{ x: x1, y: y1, z: z1 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: -1 }];
    const o = dc.at ? { x: dc.at[0], y: dc.at[1], z: dc.at[2] } : o0;
    const O = to(o), U = to({ x: o.x + u.x, y: o.y + u.y, z: o.z + u.z }), V = to({ x: o.x + v.x, y: o.y + v.y, z: o.z + v.z });
    const k = dc.nums, cls = `class="${cl(dc.look)}"`;
    if (dc.kind === "outline") {
      const pts = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, c]) => {
        const fw = dc.face === "top" ? w : dc.face === "left" ? w : d, fh = dc.face === "top" ? d : h;
        return { x: O.x + (U.x - O.x) * a! * fw + (V.x - O.x) * c! * fh, y: O.y + (U.y - O.y) * a! * fw + (V.y - O.y) * c! * fh };
      });
      return faded(dc.name, `<polygon ${cls} points="${pts.map((p) => `${f(p.x)},${f(p.y)}`).join(" ")}"/>`);
    }
    const el = dc.kind === "rect" ? `<rect ${cls} x="${k[0]}" y="${k[1]}" width="${k[2]}" height="${k[3]}"${k[4] !== undefined ? ` rx="${k[4]}"` : ""}/>`
      : dc.kind === "line" ? `<line ${cls} x1="${k[0]}" y1="${k[1]}" x2="${k[2]}" y2="${k[3]}"/>`
        : dc.kind === "circle" ? `<circle ${cls} cx="${k[0]}" cy="${k[1]}" r="${k[2]}"/>`
          : dc.kind === "path" ? `<path ${cls} d="${escapeText(dc.text ?? "")}"/>`
          : dc.kind === "poly" ? `<polygon ${cls} points="${escapeText(dc.text ?? "")}"/>`
            : dc.kind === "text" ? textEl(dc.look, k[0] ?? 0, k[1] ?? 0, dc.text ?? "", dc.size, dc.anchor, dc.weight) : "";
    const m = [U.x - O.x, U.y - O.y, V.x - O.x, V.y - O.y, O.x, O.y].map((n) => +n.toFixed(4)).join(" ");
    const sp = spin.get(dc.name);
    const turned = sp ? `<g transform="rotate(${+sp[0].toFixed(4)} ${sp[1]} ${sp[2]})">${el}</g>` : el;
    return faded(dc.name, `<g transform="matrix(${m})">${turned}</g>`);
  };
  const ruleSvg = (rule: (typeof scene.rules)[number]) => {
    const p0 = to({ x: rule.from[0], y: rule.from[1], z: rule.from[2] }), p1 = to({ x: rule.to[0], y: rule.to[1], z: rule.to[2] });
    if (rule.via) {
      const m = to({ x: rule.via[0], y: rule.via[1], z: rule.via[2] });
      return `<polyline points="${f(p0.x)},${f(p0.y)} ${f(m.x)},${f(m.y)} ${f(p1.x)},${f(p1.y)}" fill="none" stroke="${tone(rule.stroke)}"/>`;
    }
    return `<line x1="${f(p0.x)}" y1="${f(p0.y)}" x2="${f(p1.x)}" y2="${f(p1.y)}" fill="none" ` +
      `stroke="${tone(rule.stroke)}"${rule.dashed ? ` stroke-dasharray="1 3"` : ""}/>`;
  };
  // each corner rounded by its own radius: a quadratic from a point back along
  // one edge, through the corner, to a point along the other
  const fillet = (src: [number, number][], round: number[], n: number) => {
    const m = src.length, out: [number, number][] = [];
    for (let k = 0; k < m; k++) {
      const a = src[(k + m - 1) % m]!, q = src[k]!, c = src[(k + 1) % m]!;
      const la = Math.hypot(a[0] - q[0], a[1] - q[1]), lb = Math.hypot(c[0] - q[0], c[1] - q[1]);
      const tt = Math.min(round[k] ?? 0, la / 2, lb / 2);
      const p1 = [q[0] + ((a[0] - q[0]) / la) * tt, q[1] + ((a[1] - q[1]) / la) * tt];
      const p2 = [q[0] + ((c[0] - q[0]) / lb) * tt, q[1] + ((c[1] - q[1]) / lb) * tt];
      for (let s = 0; s <= n; s++) {
        const u = s / n, w = 1 - u;
        out.push([w * w * p1[0]! + 2 * w * u * q[0] + u * u * p2[0]!, w * w * p1[1]! + 2 * w * u * q[1] + u * u * p2[1]!]);
      }
    }
    return out;
  };
  const plateSvg = (plate: (typeof scene.plates)[number]): string => {
    let uv: [number, number][] = [];
    if (plate.arc !== undefined) {
      // a rounded rectangle with circular corners, the same ring a rounded solid uses
      const [x0, y0] = plate.pts[0]!, [x1, y1] = plate.pts[2]!;
      const rr = Math.max(0, Math.min(plate.round[0] ?? 0, (x1 - x0) / 2, (y1 - y0) / 2)), sg = plate.arc;
      for (const [cu, cv, a0] of [[x1 - rr, y1 - rr, 0], [x0 + rr, y1 - rr, 90], [x0 + rr, y0 + rr, 180], [x1 - rr, y0 + rr, 270]] as const)
        for (let k = 0; k <= sg; k++) {
          const a = ((a0 + (90 / sg) * k) * Math.PI) / 180;
          uv.push([cu + rr * Math.cos(a), cv + rr * Math.sin(a)]);
        }
    } else uv = fillet(plate.pts, plate.round, plate.n ?? 4);
    const pts = (qs: P2[]) => qs.map((q) => `${f(q.x)},${f(q.y)}`).join(" ");
    if (plate.h && plate.inner) {
      // a rounded outline pushed out into a solid: its silhouette is the hull of
      // both ends, and the near run of an inset outline on the far end is the soft rim
      const sil = hull([...uv.map(([u, v]) => to(plateAt(plate, u, v))), ...uv.map(([u, v]) => to(plateAt(plate, u, v, plate.h)))]);
      const inner = fillet(plate.inner.pts, plate.inner.round, plate.n ?? 4), n = inner.length;
      const area = inner.reduce((s, q, k) => { const r = inner[(k + 1) % n]!; return s + q[0] * r[1] - r[0] * q[1]; }, 0), sgn = Math.sign(area) || 1;
      const az = ((st.view?.az ?? 45) * Math.PI) / 180, kk = st.view?.k ?? 1 / Math.sqrt(3);
      const eye = { x: Math.sin(az), y: Math.cos(az), z: kk / Math.sqrt(1 - kk * kk) };
      const [fu, fv] = plate.axis === "z" ? [eye.x, eye.y] : plate.axis === "y" ? [eye.x, eye.z] : [eye.y, eye.z];
      const keep = inner.map((_, k) => {
        const a = inner[(k + n - 1) % n]!, b = inner[(k + 1) % n]!, tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
        return sgn * ((tz / l) * fu - (tx / l) * fv) > 0;
      });
      let s0 = -1;
      for (let k = 0; k < n; k++) if (keep[k] && !keep[(k + n - 1) % n]) { s0 = k; break; }
      const run: [number, number][] = [];
      if (s0 >= 0) for (let k = 0; k < n && keep[(s0 + k) % n]; k++) run.push(inner[(s0 + k) % n]!);
      return `<polygon points="${pts(sil)}" fill="${tone(plate.fill)}" stroke="${tone(plate.stroke)}"/>` +
        (run.length > 1 ? `<polyline points="${pts(run.map(([u, v]) => to(plateAt(plate, u, v, plate.h))))}" fill="none" stroke="${st.rimTone ?? st.stroke}"/>` : "");
    }
    if (plate.h) {
      // an outline pushed up into a slab, any shape, dents and all. its edges split
      // into the run that faces us and the run that faces away: the silhouette is
      // the far run along the top and the near run along the bottom, and the near
      // run along the top is the soft rim
      const n = uv.length;
      const area = uv.reduce((s, q, k) => { const r = uv[(k + 1) % n]!; return s + q[0] * r[1] - r[0] * q[1]; }, 0);
      const az = ((st.view?.az ?? 45) * Math.PI) / 180, sgn = Math.sign(area) || 1;
      const near = uv.map((q, k) => {
        const r = uv[(k + 1) % n]!, dx = r[0] - q[0], dy = r[1] - q[1];
        return sgn * (dy * Math.sin(az) - dx * Math.cos(az)) > 0;
      });
      const runOf = (want: boolean) => {
        const s = near.findIndex((v, k) => v === want && near[(k + n - 1) % n] !== want), out: [number, number][] = [];
        for (let k = s; near[k % n] === want && out.length < n; k++) out.push(uv[k % n]!);
        return out.concat([uv[(s + out.length) % n]!]);
      };
      const lift = (qs: [number, number][], z: number) => qs.map(([u, v]) => to(turned({ x: u, y: v, z }, plate.turn, plate.pivot ?? [0, 0])));
      const back = runOf(false), fore = runOf(true), z0 = plate.z, z1 = plate.z + plate.h;
      return `<polygon points="${pts([...lift(back, z1), ...lift(fore, z0)])}" fill="${tone(plate.fill)}" stroke="${tone(plate.stroke)}"/>` +
        `<polyline points="${pts(lift(fore, z1))}" fill="none" stroke="${st.rimTone ?? st.stroke}"/>`;
    }
    const out = uv.map(([u, v]) => to(plateAt(plate, u, v)));
    return `<polygon points="${out.map((q) => `${f(q.x)},${f(q.y)}`).join(" ")}" fill="${tone(plate.fill)}" stroke="${tone(plate.stroke)}"/>`;
  };

  sorted.forEach((sb, i) => {
    const b = turnOf.get(sb) ?? sb;
    const icon = iconOf.get(b);
    if (icon) {
      const g = findGlyph(icon.glyph);
      // scene.ts drops an icon the catalogue does not have, so this is only ever
      // a second pair of hands
      if (g) {
        // the art is flat, so it is painted onto the horizontal face rather than
        // stood up: its own box is mapped onto a square of the size it asked for,
        // which puts it in the plane of the thing it sits on and foreshortens it
        // the same way. standing flat art up is what makes it look pasted on.
        // the set pads every glyph inside its square; the art itself sits in the
        // middle five sixths, and that is what is fitted to the size asked for
        const pad = g.w / 12, art = g.w - 2 * pad;
        const plane = (z: number) => {
          const o = to({ x: icon.x, y: icon.y, z });
          const ax = to({ x: icon.x + icon.size, y: icon.y, z }), ay = to({ x: icon.x, y: icon.y + icon.size, z });
          const a = (ax.x - o.x) / art, b = (ax.y - o.y) / art, c = (ay.x - o.x) / art, d = (ay.y - o.y) / art;
          return [a, b, c, d, o.x - a * pad - c * pad, o.y - b * pad - d * pad].map((v) => f(v)).join(" ");
        };
        const host = hostOf.get(icon.name);
        let panel = "", lift = 0;
        if (host) {
          // set into the face: a shallow rounded panel the glyph stands in, and
          // the glyph raised off it, its shadow the same shape a little lower
          const round = !!host.round, side = icon.size * (round ? 1.36 : 1.28), r = round ? side / 2 : side * 0.2;
          const cx = icon.x + icon.size / 2, cy = icon.y + icon.size / 2;
          const pts: P2[] = [];
          for (const [ux, uy, a0] of [[1, 1, 0], [-1, 1, 90], [-1, -1, 180], [1, -1, 270]] as const)
            for (let k = 0; k <= 6; k++) {
              const a = ((a0 + 15 * k) * Math.PI) / 180;
              pts.push(to({ x: cx + ux * (side / 2 - r) + r * Math.cos(a), y: cy + uy * (side / 2 - r) + r * Math.sin(a), z: icon.z }));
            }
          panels.push(pts);
          // the face colour first, so whatever else is on that face stops at the panel
          const face = toneOf(paint(host, host.accent), "top", roleOf(host, host.accent));
          panel = `<polygon points="${pts.map((q) => `${f(q.x)},${f(q.y)}`).join(" ")}" fill="${face}" stroke="none" data-role="${roleOf(host, host.accent)}"/>` +
            `<polygon points="${pts.map((q) => `${f(q.x)},${f(q.y)}`).join(" ")}" fill="${st.stroke}" fill-opacity="0.07" ` +
            `stroke="${st.stroke}" stroke-opacity="0.45" stroke-width="${f(Math.max(0.6, st.strokeWidth * 0.45))}" data-role="ink"/>`;
          lift = Math.min(0.06 * icon.size, 0.05);
        }
        const ink = (z: number, extra: string) => `<g transform="matrix(${plane(z)})" fill="${st.stroke}" stroke="none"${extra}>${g.body}</g>`;
        const svg = withSolid(icon.name, panel + (lift ? ink(icon.z, ' fill-opacity="0.22" data-role="ink"') + ink(icon.z + lift, ' data-role="ink"') : ink(icon.z, ' data-role="ink"')));
        drawables.push({ key: i, svg });
      }
      return;
    }
    const plate = plateOf.get(b);
    if (plate) {
      drawables.push({ key: i, svg: plateSvg(plate) });
      return;
    }
    const lb = labelOf.get(b);
    if (lb) {
      drawables.push({ key: i, svg: labelSvg(lb) });
      return;
    }
    const wr = wireOf.get(b);
    if (wr) {
      drawables.push({ key: i, svg: wireSvg(wr) });
      return;
    }
    if (b.outline) {
      drawables.push({ key: i, svg: withSolid(b.name, prismSvg(b)) });
      return;
    }
    if (st.machine && boxNames.has(b.name)) {
      // three faces, each its own outlined polygon: right, front left, then top
      const { x, y, z, w, d, h } = b, x1 = x + w, y1 = y + d, z1 = z + h;
      const quad = (q: P3[]) => `<polygon class="${b.look ?? "ln"}" points="${q.map(to).map((p) => `${f(p.x)},${f(p.y)}`).join(" ")}"/>`;
      drawables.push({ key: i, svg: withSolid(b.name,
        quad([{ x: x1, y, z }, { x: x1, y: y1, z }, { x: x1, y: y1, z: z1 }, { x: x1, y, z: z1 }]) +
        quad([{ x, y: y1, z }, { x: x1, y: y1, z }, { x: x1, y: y1, z: z1 }, { x, y: y1, z: z1 }]) +
        quad([{ x, y, z: z1 }, { x: x1, y, z: z1 }, { x: x1, y: y1, z: z1 }, { x, y: y1, z: z1 }])) });
      return;
    }
    const tb = tubeOf.get(b);
    if (tb) {
      drawables.push({ key: i, svg: tubeSvg(tb) });
      return;
    }
    const rod = rodOf.get(b);
    if (rod) {
      // a ball at each end seen from anywhere is a circle, so the rod's outline is
      // the hull of two circles; the band is a stroke straight across it
      const A = to({ x: rod.from[0], y: rod.from[1], z: rod.from[2] }), Bp = to({ x: rod.to[0], y: rod.to[1], z: rod.to[2] });
      const az = ((st.view?.az ?? 45) * Math.PI) / 180, o = to({ x: 0, y: 0, z: 0 }), one = to({ x: Math.cos(az), y: -Math.sin(az), z: 0 });
      const px = Math.hypot(one.x - o.x, one.y - o.y);
      const disc = (c: P2, r: number) => Array.from({ length: 20 }, (_, k) => ({ x: c.x + r * px * Math.cos((k * Math.PI) / 10), y: c.y + r * px * Math.sin((k * Math.PI) / 10) }));
      const pts = (qs: P2[]) => qs.map((q) => `${f(q.x)},${f(q.y)}`).join(" ");
      let band = "";
      if (rod.band !== undefined) {
        const tt = rod.band, e = { x: A.x + (Bp.x - A.x) * tt, y: A.y + (Bp.y - A.y) * tt }, len = Math.hypot(Bp.x - A.x, Bp.y - A.y) || 1;
        const nx = -(Bp.y - A.y) / len, ny = (Bp.x - A.x) / len, w = (rod.r0 + (rod.r1 - rod.r0) * tt - rod.inset) * px;
        band = `<line x1="${f(e.x + nx * w)}" y1="${f(e.y + ny * w)}" x2="${f(e.x - nx * w)}" y2="${f(e.y - ny * w)}" fill="none" stroke="${st.rimTone ?? st.stroke}"/>`;
      }
      drawables.push({ key: i, svg: `<polygon points="${pts(hull([...disc(A, rod.r0), ...disc(Bp, rod.r1)]))}" fill="${st.faces?.top ?? st.face}" ` +
        `stroke="${rod.edge ? tone(rod.edge) : rod.hi ? (st.hiTone ?? st.stroke) : (st.sil ?? st.stroke)}"/>` + band });
      return;
    }
    const dish = dishOf.get(b);
    if (dish) {
      drawables.push({ key: i, svg: dishSvg(dish) });
      return;
    }
    const dot = dotOf.get(b);
    if (dot) {
      drawables.push({ key: i, svg: dotSvg(dot) });
      return;
    }
    const rule = ruleOf.get(b);
    if (rule) {
      drawables.push({ key: i, svg: ruleSvg(rule) });
      return;
    }
    const cone = coneOf.get(b);
    if (cone) {
      const fill = paint(b, cone.accent);
      const role = roleOf(b, cone.accent);
      const [base, tip] = coneEnds(cone);
      const ring = (p: typeof base, r: number) => circle3(p, r, cone.axis).map(to);
      // the silhouette is the hull of the base and whatever the tip has left of a
      // ring, so a point and a blunt cap are the same drawing with a different radius
      const lit = toneOf(fill, "left", role);
      const svg = poly(hull([...ring(base, cone.r), ...ring(tip, cone.r * cone.cap)]), lit, true, role)
        + (cone.cap > 0 ? poly(ring(tip, cone.r * cone.cap), toneOf(fill, "top", role), true, role) : "");
      drawables.push({ key: i, svg: withSolid(b.name, svg) });
      return;
    }
    const cyl = cylOf.get(b);
    if (cyl && st.machine && cyl.axis === "z") {
      // a disc the way it is drawn by hand: its bottom rim, the band of its side,
      // the two upright edges, then its top rim over all of it
      const c0 = to({ x: cyl.x + cyl.r, y: cyl.y + cyl.r, z: cyl.z }), c1 = to({ x: cyl.x + cyl.r, y: cyl.y + cyl.r, z: cyl.z + cyl.h });
      const q = cyl.r / Math.SQRT2, ex = to({ x: cyl.x + cyl.r + q, y: cyl.y + cyl.r - q, z: cyl.z }), ey = to({ x: cyl.x + cyl.r + q, y: cyl.y + cyl.r + q, z: cyl.z });
      const rx = Math.abs(ex.x - c0.x), ry = Math.abs(ey.y - c0.y);
      drawables.push({ key: i, svg: withSolid(b.name,
        `<ellipse class="${b.look ?? "ln"}" cx="${f(c0.x)}" cy="${f(c0.y)}" rx="${f(rx)}" ry="${f(ry)}"/>` +
        `<rect class="fl" x="${f(c0.x - rx)}" y="${f(c1.y)}" width="${f(2 * rx)}" height="${f(c0.y - c1.y)}"/>` +
        `<line class="lo" x1="${f(c0.x - rx)}" y1="${f(c1.y)}" x2="${f(c0.x - rx)}" y2="${f(c0.y)}"/>` +
        `<line class="lo" x1="${f(c0.x + rx)}" y1="${f(c1.y)}" x2="${f(c0.x + rx)}" y2="${f(c0.y)}"/>` +
        `<ellipse class="${b.look ?? "ln"}" cx="${f(c1.x)}" cy="${f(c1.y)}" rx="${f(rx)}" ry="${f(ry)}"/>`) });
      return;
    }
    if (cyl) {
      const fill = paint(b, cyl.accent);
      const role = roleOf(b, cyl.accent);
      const [a, e] = cylEnds(cyl);
      const sum = (p: { x: number; y: number; z: number }) => p.x + p.y + p.z;
      const near = sum(a) > sum(e) ? a : e;
      const ring = (p: typeof a) => circle3(p, cyl.r, cyl.axis).map(to);
      // the barrel outline is the hull of both end circles, the near cap on top
      drawables.push({ key: i, svg: withSolid(b.name,
        poly(hull([...ring(a), ...ring(e)]), toneOf(fill, "left", role), true, role) +
        poly(ring(near), toneOf(fill, "top", role), true, role)) });
      return;
    }
    if (st.round === "prism") {
      // a rounded footprint pushed up from its base. drawn as two lines only: the
      // silhouette, which is the hull of the top and bottom rings, and a soft rim
      // round the front of the top, inset by the solid's own rim width. no face is
      // shaded; every surface is the same plate.
      const r = b.r ?? 0;
      const sg = b.seg ?? 4;
      const ring = (x0: number, y0: number, x1: number, y1: number, rr: number) => {
        rr = Math.max(0, Math.min(rr, (x1 - x0) / 2, (y1 - y0) / 2));
        const out: { u: number; v: number; nu: number; nv: number }[] = [];
        for (const [cu, cv, a0] of [[x1 - rr, y1 - rr, 0], [x0 + rr, y1 - rr, 90], [x0 + rr, y0 + rr, 180], [x1 - rr, y0 + rr, 270]] as const)
          for (let k = 0; k <= sg; k++) {
            const a = ((a0 + (90 / sg) * k) * Math.PI) / 180;
            out.push({ u: cu + rr * Math.cos(a), v: cv + rr * Math.sin(a), nu: Math.cos(a), nv: Math.sin(a) });
          }
        return out;
      };
      // the ring lies in the plane across the axis and is pushed out along it, from
      // e0 to e1. u and v are the ring's own two coordinates
      const ax = b.axis ?? "z";
      const pv = pivotOf(b);
      const at = (q: { u: number; v: number }, e: number) =>
        to(posed(b, ax === "z" ? { x: q.u, y: q.v, z: e } : ax === "y" ? { x: q.u, y: e, z: q.v } : { x: e, y: q.u, z: q.v }, pv));
      const [u0, v0, du, dv, e0, e1] = ax === "z" ? [b.x, b.y, b.w, b.d, b.z, b.z + b.h]
        : ax === "y" ? [b.x, b.z, b.w, b.h, b.y, b.y + b.d] : [b.y, b.z, b.d, b.h, b.x, b.x + b.w];
      const squash = (qs: ReturnType<typeof ring>) => b.cut ? qs.map((q) => ({ ...q, v: Math.min(Math.max(q.v, b.cut![0]), b.cut![1]) })) : qs;
      const outer = squash(ring(u0, v0, u0 + du, v0 + dv, r));
      const tp = b.taper ?? 0, tr = b.topr ?? r;
      // the top ring: inset all round by the taper, or a size of its own centred over the base
      const [tu, tv] = b.topsize ? [(du - b.topsize[0]) / 2, (dv - b.topsize[1]) / 2] : [tp, tp];
      const top = tp > 0 || b.topr !== undefined || b.topsize ? squash(ring(u0 + tu, v0 + tv, u0 + du - tu, v0 + dv - tv, tr)) : outer;
      const sil = hull([...top.map((q) => at(q, e1)), ...outer.map((q) => at(q, e0))]);
      // the direction towards the eye, so a ring edge faces us when its normal leans that way
      const az = ((st.view?.az ?? 45) * Math.PI) / 180, kk = st.view?.k ?? 1 / Math.sqrt(3);
      const eye = { x: Math.sin(az), y: Math.cos(az), z: kk / Math.sqrt(1 - kk * kk) };
      // a ring edge faces us when its outward normal, turned and leaned with the
      // solid, leans towards the eye; the soft rim goes on whichever end does
      const dirOf = (v: P3) => leaned(turned(rolled(v, b.roll, [0, 0]), b.turn, [0, 0]), b.tilt, [0, 0]);
      const towards = (v: P3) => { const d = dirOf(v); return d.x * eye.x + d.y * eye.y + d.z * eye.z; };
      const facing = (q: { nu: number; nv: number }) =>
        towards(ax === "z" ? { x: q.nu, y: q.nv, z: 0 } : ax === "y" ? { x: q.nu, y: 0, z: q.nv } : { x: 0, y: q.nu, z: q.nv }) >= -1e-6;
      const capUp = towards(ax === "z" ? { x: 0, y: 0, z: 1 } : ax === "y" ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }) >= 0;
      let rim = "";
      const inset = b.rim ?? 0;
      if (inset > 0) {
        const eu = tu + inset, ev = tv + inset;
        const inner = squash(ring(u0 + eu, v0 + ev, u0 + du - eu, v0 + dv - ev, b.rimr ?? Math.max(0.03, tr - inset)));
        // the run of the inner ring that faces us, as one open line
        const n = inner.length;
        let s = -1;
        for (let i = 0; i < n; i++) if (facing(inner[i]!) && !facing(inner[(i + n - 1) % n]!)) { s = i; break; }
        const front = s < 0 ? (facing(inner[0]!) ? inner : []) : (() => {
          const out = [];
          for (let k = 0; k < n && facing(inner[(s + k) % n]!); k++) out.push(inner[(s + k) % n]!);
          return out;
        })();
        if (front.length > 1) {
          rim = `<polyline points="${front.map((q) => at(q, capUp ? e1 : e0)).map((q) => `${f(q.x)},${f(q.y)}`).join(" ")}" ` +
            `fill="none" stroke="${st.rimTone ?? st.stroke}"/>`;
        }
      }
      let ghost = "";
      if (b.reflect && b.reflect > 0 && ax === "z") {
        const n = outer.length;
        let s0 = -1;
        for (let i2 = 0; i2 < n; i2++) if (facing(outer[i2]!) && !facing(outer[(i2 + n - 1) % n]!)) { s0 = i2; break; }
        const fr: typeof outer = [];
        if (s0 >= 0) for (let k = 0; k < n && facing(outer[(s0 + k) % n]!); k++) fr.push(outer[(s0 + k) % n]!);
        if (fr.length > 1) {
          const z0 = b.z, z1 = b.z - b.reflect;
          const low = fr.map((q) => at(q, z1));
          const ends = [fr[0]!, fr[fr.length - 1]!].map((q) => [at(q, z0), at(q, z1)]);
          const y0 = Math.min(...fr.map((q) => at(q, z0).y)), y1 = Math.max(...low.map((q) => q.y)) + 2;
          const id = `${figureId}-g${i}`;
          ghost = `<defs><linearGradient id="${id}l" gradientUnits="userSpaceOnUse" x1="0" y1="${f(y0)}" x2="0" y2="${f(y1)}">` +
            `<stop offset="0" stop-color="#fff" stop-opacity="0.7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
            `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${canvasW}" height="${canvasH}">` +
            `<rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="url(#${id}l)"/></mask></defs>` +
            `<g mask="url(#${id})" fill="none" stroke="${st.stroke}">` +
            `<polyline points="${low.map((q) => `${f(q.x)},${f(q.y)}`).join(" ")}"/>` +
            ends.map(([a, c]) => `<line x1="${f(a!.x)}" y1="${f(a!.y)}" x2="${f(c!.x)}" y2="${f(c!.y)}"/>`).join("") + `</g>`;
        }
      }
      const fill = paint(b, b.accent);
      const role = roleOf(b, b.accent);
      const edge = b.edge ? tone(b.edge) : b.hi ? (st.hiTone ?? st.stroke) : (st.sil ?? st.stroke);
      if (b.open) {
        // an open box: the far walls and the floor line inside go under what it
        // holds, the near wall goes over it
        const e = b.rim ?? 0;
        const inner = squash(ring(u0 + e, v0 + e, u0 + du - e, v0 + dv - e, b.rimr ?? Math.max(0.03, tr - e)));
        const runOf = (qs: typeof inner, keep: (q: (typeof inner)[number]) => boolean) => {
          const n = qs.length;
          let s = -1;
          for (let k = 0; k < n; k++) if (keep(qs[k]!) && !keep(qs[(k + n - 1) % n]!)) { s = k; break; }
          if (s < 0) return keep(qs[0]!) ? qs.slice() : [];
          const out: typeof inner = [];
          for (let k = 0; k < n && keep(qs[(s + k) % n]!); k++) out.push(qs[(s + k) % n]!);
          return out;
        };
        const lr = (qs: P2[]) => (qs.length && qs[0]!.x > qs[qs.length - 1]!.x ? qs.slice().reverse() : qs);
        const pts = (qs: P2[]) => qs.map((q) => `${f(q.x)},${f(q.y)}`).join(" ");
        const line = (qs: P2[], stroke: string) => `<polyline points="${pts(qs)}" fill="none" stroke="${stroke}"/>`;
        const face = toneOf(fill, "top", role);
        if (!fronts.has(sb)) {
          drawables.push({ key: i, svg: withSolid(b.name, ghost +
            `<polygon points="${pts(sil)}" fill="${face}" stroke="${edge}" data-role="${role}"/>` +
            `<polygon points="${pts(inner.map((q) => at(q, e1)))}" fill="none" stroke="${st.stroke}"/>` +
            line(runOf(inner, (q) => !facing(q)).map((q) => at(q, e0 + (b.floor ?? 0))), st.rimTone ?? st.stroke)) });
        } else {
          const iF = lr(runOf(inner, facing).map((q) => at(q, e1)));
          const oT = lr(runOf(outer, facing).map((q) => at(q, e1))), oB = lr(runOf(outer, facing).map((q) => at(q, e0)));
          drawables.push({ key: i, svg: withSolid(b.name,
            `<polygon points="${pts([...iF, oT[oT.length - 1]!, ...oB.slice().reverse(), oT[0]!])}" fill="${face}" stroke="none"/>` +
            line(oT, st.rimTone ?? st.stroke) + line(iF, st.stroke) + line([oT[0]!, ...oB, oT[oT.length - 1]!], edge)) });
        }
        return;
      }
      if (b.cap) {
        // a slab: its outline in the light tone, then whichever end faces the eye
        // outlined in full on top
        const near = capUp ? top.map((q) => at(q, e1)) : outer.map((q) => at(q, e0));
        const pts = (qs: P2[]) => qs.map((q) => `${f(q.x)},${f(q.y)}`).join(" ");
        drawables.push({ key: i, svg: withSolid(b.name,
          `<polygon points="${pts(sil)}" fill="${toneOf(fill, "top", role)}" stroke="${st.rimTone ?? st.stroke}" data-role="${role}"/>` +
          `<polygon points="${pts(near)}" fill="${toneOf(fill, "top", role)}" stroke="${edge}"/>`) });
        return;
      }
      drawables.push({ key: i, svg: withSolid(b.name, ghost +
        `<polygon points="${sil.map((q) => `${f(q.x)},${f(q.y)}`).join(" ")}" fill="${toneOf(fill, "top", role)}" stroke="${edge}" data-role="${role}"/>` + rim) });
      return;
    }
    if (b.r && st.round === "faces") {
      const fill = paint(b, b.accent);
      const role = roleOf(b, b.accent);
      // width and height of each face in scene units, in the order onFace reads them
      const dims = { left: [b.w, b.h], right: [b.d, b.h], top: [b.w, b.d] } as const;
      const face = (id: "left" | "right" | "top") => {
        const [fw, fh] = dims[id];
        const r = Math.min(b.r!, fw / 2, fh / 2);
        const pts: P2[] = [];
        // corners in face units, swept a quarter turn each
        const corner = (cu: number, cv: number, a0: number) => {
          for (let s = 0; s <= 6; s++) {
            const a = a0 + (s / 6) * (Math.PI / 2);
            pts.push(to(onFace(b, id, (cu + r * Math.cos(a)) / fw, (cv + r * Math.sin(a)) / fh)));
          }
        };
        corner(r, r, Math.PI);
        corner(fw - r, r, -Math.PI / 2);
        corner(fw - r, fh - r, 0);
        corner(r, fh - r, Math.PI / 2);
        return `<polygon points="${pts.map((q) => `${f(q.x)},${f(q.y)}`).join(" ")}" fill="${toneOf(fill, id, role)}" ` +
          `stroke-width="${f(st.strokeWidth * (st.faceInk ?? 1))}" data-role="${role}"/>`;
      };
      drawables.push({ key: i, svg: withSolid(b.name, face("left") + face("right") + face("top")) });
      return;
    }
    if (b.r) {
      // a rounded solid has no corner edges to draw: its outline is the hull of
      // the top and bottom footprints, with the top face drawn over it
      const fill = paint(b, b.accent);
      const role = roleOf(b, b.accent);
      const top = roundedRect(b, b.z + b.h).map(to);
      const bottom = roundedRect(b, b.z).map(to);
      // a rounded solid has no corner edges, so its sides are one silhouette and
      // cannot be split into a left and a right. they still have to take a side
      // tone, or every rounded box comes out flat while every square one is lit.
      const side = role === "face" && st.faces ? st.faces.left : shaded(fill, st.shade ? (st.shade.left + st.shade.right) / 2 : 1);
      drawables.push({ key: i, svg: withSolid(b.name,
        poly(hull([...top, ...bottom]), side, true, role) +
        poly(top, toneOf(fill, "top", role), true, role)) });
      return;
    }
    const fill = paint(b, b.accent);
    const role = roleOf(b, b.accent);
    const body = faces(b)
      .map((face) => `<polygon points="${face.pts.map(to).map((p) => `${f(p.x)},${f(p.y)}`).join(" ")}" fill="${toneOf(fill, face.id, role)}" data-role="${role}" stroke="none"/>`)
      .join("");
    const { own, back } = boxEdges(b);
    const lines = own.map((e) => edgeLine([to(e[0]), to(e[1])], false)).join("");
    // the edges round the back of this solid, only when the figure asks for them
    const hiddenLines = b.hidden === "dashed"
      ? back.map((e) => edgeLine([to(e[0]), to(e[1])], true)).join("")
      : "";
    drawables.push({ key: i, svg: withSolid(b.name, body + hiddenLines + lines) });
  });

  // marks drawn on a solid's faces, kept with that solid rather than laid over
  // the whole figure, so a ruled plate is covered by what stands on it
  const markSvgs = new Map<string, string[]>();
  const addMark = (name: string, svg: string) => {
    if (!markSvgs.has(name)) markSvgs.set(name, []);
    markSvgs.get(name)!.push(svg);
  };

  // lines, outlines and dots kept with a solid, in the order they were written
  const kept = [
    ...scene.rules.filter((r) => r.on).map((r) => ({ on: r.on!, line: r.line ?? 0, svg: () => ruleSvg(r) })),
    ...scene.plates.filter((pl) => pl.on).map((pl) => ({ on: pl.on!, line: pl.line ?? 0, svg: () => plateSvg(pl) })),
    ...(st.hairline ? scene.dots.filter((d) => d.at && d.on).map((d) => ({ on: d.on!, line: d.line ?? 0, svg: () => dotSvg(d) })) : []),
    ...scene.decals.map((dc) => ({ on: dc.target, line: dc.line, svg: () => decalSvg(dc) })),
    ...scene.labels.filter((l) => l.on).map((l) => ({ on: l.on!, line: l.line, svg: () => labelSvg(l) })),
    ...scene.wires.filter((w) => w.on).map((w) => ({ on: w.on!, line: w.line, svg: () => wireSvg(w) })),
  ].sort((a, b) => a.line - b.line);
  for (const k of kept) addMark(k.on, k.svg());

  for (const h of scene.holes) {
    const b = look(h.target);
    if (!b) continue;
    const c = h.face === "left" ? { x: b.x + b.w / 2, y: b.y + b.d, z: b.z + b.h / 2 }
      : h.face === "right" ? { x: b.x + b.w, y: b.y + b.d / 2, z: b.z + b.h / 2 }
        : { x: b.x + b.w / 2, y: b.y + b.d / 2, z: b.z + b.h };
    const axis = h.face === "left" ? "y" : h.face === "right" ? "x" : "z";
    const pts = circle3(c, h.r, axis as "x" | "y" | "z", h.sides).map(to);
    over.push(withSolid(b.name, `<polygon points="${pts.map((p) => `${f(p.x)},${f(p.y)}`).join(" ")}" fill="${st.face}" data-role="face"/>`));
  }

  // Detail on a surface, in scene units from the face's own corner, projected
  // through the face so it skews with it. Each mark is kept with its solid, so it
  // sorts and animates with it and is covered by whatever stands in front.
  const detail = st.detailWidth ?? st.strokeWidth;
  for (const m of scene.marks) {
    const b = look(m.target);
    if (!b) continue;
    const [FW, FH] = m.face === "left" ? [b.w, b.h] : m.face === "right" ? [b.d, b.h] : [b.w, b.d];
    const at = (u: number, v: number) => to(onFace(b, m.face as FaceId, u / FW, v / FH));
    const weight = (m.look.weight === undefined ? detail : m.look.weight * (st.unitStrokes ? unit : 1)) * (st.faceInk ?? 1);
    const stroke = tone(m.look.stroke);
    const skin = (m.look.opacity === undefined ? "" : ` opacity="${f(m.look.opacity)}"`) + ` fill="${tone(m.look.fill)}"` +
      (stroke === "none" ? ` stroke="none"` : ` stroke="${stroke}" stroke-width="${f(weight)}"`);
    const poly = (pts: P2[]) => `<polygon points="${pts.map((q) => `${f(q.x)},${f(q.y)}`).join(" ")}"${skin}/>`;
    const rail = (p0: P2, p1: P2) =>
      `<line x1="${f(p0.x)}" y1="${f(p0.y)}" x2="${f(p1.x)}" y2="${f(p1.y)}" stroke="${stroke}" stroke-width="${f(weight)}"/>`;
    const add = (svg: string) => addMark(b.name, withSolid(b.name, svg));
    // a rounded rectangle in face units, the corners swept a quarter turn each
    const rrect = (u: number, v: number, w: number, h: number, r0: number): P2[] => {
      const r = Math.max(0, Math.min(r0, w / 2, h / 2));
      if (r === 0) return [at(u, v), at(u + w, v), at(u + w, v + h), at(u, v + h)];
      const pts: P2[] = [];
      const corner = (cu: number, cv: number, a0: number) => {
        for (let s = 0; s <= 6; s++) {
          const a = a0 + (s / 6) * (Math.PI / 2);
          pts.push(at(cu + r * Math.cos(a), cv + r * Math.sin(a)));
        }
      };
      corner(u + r, v + r, Math.PI);
      corner(u + w - r, v + r, -Math.PI / 2);
      corner(u + w - r, v + h - r, 0);
      corner(u + r, v + h - r, Math.PI / 2);
      return pts;
    };
    const circle = (u: number, v: number, r: number, back = false) =>
      Array.from({ length: 48 }, (_, k) => {
        const a = ((back ? -k : k) / 48) * Math.PI * 2;
        return at(u + r * Math.cos(a), v + r * Math.sin(a));
      });
    const spokes = (u: number, v: number, r0: number, r1: number, n: number, turn: number) => {
      for (let k = 0; k < n; k++) {
        const a = (turn * Math.PI) / 180 + (k / n) * Math.PI * 2;
        add(rail(at(u + r0 * Math.cos(a), v + r0 * Math.sin(a)), at(u + r1 * Math.cos(a), v + r1 * Math.sin(a))));
      }
    };

    if (m.kind === "inset") add(poly(rrect(m.d, m.d, FW - 2 * m.d, FH - 2 * m.d, m.r)));
    else if (m.kind === "rect") for (let k = 0; k < m.n; k++) add(poly(rrect(m.u, m.v + k * m.step, m.w, m.h, m.r)));
    else if (m.kind === "bar") for (let k = 0; k < m.n; k++) add(poly(rrect(m.u - m.w / 2, m.v + k * m.step - m.h / 2, m.w, m.h, m.r)));
    else if (m.kind === "disc") {
      add(poly(circle(m.u, m.v, m.r)));
      if (m.spokes) spokes(m.u, m.v, m.r * m.hub, m.r * 0.95, m.spokes, 0);
    } else if (m.kind === "ticks") spokes(m.u, m.v, m.hub, m.r, m.n, m.turn);
    else if (m.kind === "line") for (let k = 0; k < m.n; k++) add(rail(at(m.u, m.v + k * m.step), at(m.u2, m.v2 + k * m.step)));
    else if (m.kind === "arc") {
      // open, so it is a sweep rather than a closed shape; repeated outward
      for (let k = 0; k < m.n; k++) {
        const r = m.r + k * m.step;
        const pts = Array.from({ length: 24 }, (_, s) => {
          const a = ((m.from + (s / 23) * (m.to - m.from)) * Math.PI) / 180;
          return at(m.u + r * Math.cos(a), m.v + r * Math.sin(a));
        });
        add(`<polyline points="${pts.map((q) => `${f(q.x)},${f(q.y)}`).join(" ")}" fill="none" stroke="${stroke}" stroke-width="${f(weight)}"/>`);
      }
    } else if (m.kind === "ring") {
      // outer then inner the other way round, so the hole is a real hole
      const path = (pts: P2[]) => pts.map((q, k) => `${k ? "L" : "M"}${f(q.x)} ${f(q.y)}`).join("") + "Z";
      add(`<path d="${path(circle(m.u, m.v, m.r))}${path(circle(m.u, m.v, m.r * m.inner, true))}" fill-rule="evenodd"${skin}/>`);
    } else if (m.kind === "tri") {
      add(poly([0, 1, 2].map((k) => {
        const a = (m.turn * Math.PI) / 180 + (k / 3) * Math.PI * 2 - Math.PI / 2;
        return at(m.u + m.r * Math.cos(a), m.v + m.r * Math.sin(a));
      })));
    } else {
      const step = m.size + m.gap;
      for (let gy = 0; gy < m.ny; gy++)
        for (let gx = 0; gx < m.nx; gx++) add(poly(rrect(m.u + gx * step, m.v + gy * step, m.size, m.size, m.r)));
    }
  }

  for (const pat of scene.patterns) {
    const b = look(pat.target);
    if (!b) continue;
    const n = pat.n, cw = b.w / n, cd = b.d / n;
    const cells: string[] = [];
    let i = 0;
    for (let gx = 0; gx < n; gx++) {
      for (let gy = 0; gy < n; gy++, i++) {
        const q = [
          { x: b.x + gx * cw, y: b.y + gy * cd, z: b.z + b.h },
          { x: b.x + (gx + 1) * cw, y: b.y + gy * cd, z: b.z + b.h },
          { x: b.x + (gx + 1) * cw, y: b.y + (gy + 1) * cd, z: b.z + b.h },
          { x: b.x + gx * cw, y: b.y + (gy + 1) * cd, z: b.z + b.h },
        ].map(to);
        const fill = pat.cells.includes(i) ? st.accentLine : "none";
        cells.push(`<polygon points="${q.map((p) => `${f(p.x)},${f(p.y)}`).join(" ")}" fill="${fill}"/>`);
      }
    }
    // kept with its solid, so whatever stands on the face covers the grid
    addMark(b.name, withSolid(b.name, cells.join("")));
  }

  for (const d of drawables.sort((a, b) => a.key - b.key)) {
    const name = sorted[d.key]!.name;
    solids.push(boxNames.has(name) ? faded(name, d.svg + (markSvgs.get(name) ?? []).join("")) : d.svg + (markSvgs.get(name) ?? []).join(""));
  }

  for (const r of scene.rings) {
    const b = look(r.target);
    if (!b) continue;
    const c = { x: b.x + b.w / 2, y: b.y + b.d / 2, z: b.z + b.h };
    // short dashes lying flat on the top face, one per step around the circle
    const dashes: string[] = [];
    for (let i = 0; i < r.n; i++) {
      const a0 = (i / r.n) * Math.PI * 2, a1 = a0 + (Math.PI * 2) / r.n * 0.45;
      const p = to({ x: c.x + Math.cos(a0) * r.r, y: c.y + Math.sin(a0) * r.r, z: c.z });
      const q = to({ x: c.x + Math.cos(a1) * r.r, y: c.y + Math.sin(a1) * r.r, z: c.z });
      const col = r.accentAt.includes(i) ? ` stroke="${st.accentLine}" stroke-width="4"` : "";
      dashes.push(`<line x1="${f(p.x)}" y1="${f(p.y)}" x2="${f(q.x)}" y2="${f(q.y)}"${col}/>`);
    }
    over.push(withSolid(b.name, dashes.join("")));
  }

  for (const [li, l] of scene.links.entries()) {
    const a = look(l.from), b = look(l.to);
    if (!a || !b) continue;
    const dash = l.dashed ? dashed : "";
    const drawn: string[] = [];
    if (l.mode === "corners") {
      // one riser per corner, which is how a gap between two platforms reads
      for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const p = to({ x: a.x + cx * a.w, y: a.y + cy * a.d, z: a.z + a.h });
        const q = to({ x: b.x + cx * b.w, y: b.y + cy * b.d, z: b.z + b.h });
        drawn.push(`<line x1="${f(p.x)}" y1="${f(p.y)}" x2="${f(q.x)}" y2="${f(q.y)}"${dash}/>`);
      }
    } else {
      const p = offPanel(topCentre(a), topCentre(b)), q = offPanel(topCentre(b), topCentre(a));
      drawn.push(`<line x1="${f(p.x)}" y1="${f(p.y)}" x2="${f(q.x)}" y2="${f(q.y)}"${dash}/>`);
    }
    over.push(wrap(moves?.links.get(li), drawn.join("")));
  }

  for (const a of scene.arrows.filter((a) => !a.route)) over.push(wrap(moves?.arrows.get(a.name), arrowSvg(a, 0, 1, true)));

  // a routed arrow is drawn over its own two solids, which it joins, but a
  // third solid standing in front of it hides the part behind. the arrow is
  // cut into short pieces, and each piece is clipped by the outline of every
  // other solid that is in front of that piece
  // which side of edge a->c a point is on; split counts a polygon's inside as negative
  const side = (p: P2, a: P2, c: P2) => (p.x - a.x) * -(c.y - a.y) + (p.y - a.y) * (c.x - a.x);
  const outline = (b: Box): P2[] => {
    const cyl = cylOf.get(b);
    const pts = cyl
      ? (() => { const [e0, e1] = cylEnds(cyl); return [...circle3(e0, cyl.r, cyl.axis, 24), ...circle3(e1, cyl.r, cyl.axis, 24)]; })()
      : b.r ? [...roundedRect(b, b.z), ...roundedRect(b, b.z + b.h)] : corners(b);
    const poly = hull(pts.map(to));
    // wind it the way split expects, checked against its own centre
    const mid = { x: poly.reduce((t, p) => t + p.x, 0) / poly.length, y: poly.reduce((t, p) => t + p.y, 0) / poly.length };
    return side(mid, poly[0]!, poly[1]!) < 0 ? poly : poly.reverse();
  };
  const insidePoly = (p: P2, poly: P2[]) => poly.every((a, i) => side(p, a, poly[(i + 1) % poly.length]!) < -1e-6);
  for (const a of scene.arrows.filter((a) => a.route)) {
    const own = (n: string) => (a.ends ?? []).some((e) => n === e || n.startsWith(`${e}.`));
    const others = [...scene.boxes, ...cylOf.keys()].filter((b) => !own(b.name));
    const len = Math.hypot(a.to[0] - a.from[0], a.to[1] - a.from[1], a.to[2] - a.from[2]);
    const n = Math.max(1, Math.ceil(len / 0.25));
    const start = to(xyz(point(a, 0)));
    const colour = a.accent ? ` stroke="${st.accentLine}" stroke-width="${st.strokeWidth + 1}"` : "";
    let headHidden = false;
    const drawn: string[] = [];
    const dashedHere = a.dashed || !!moves?.flows.has(a.name);
    for (let i = 0; i < n; i++) {
      const p = point(a, i / n), q = point(a, (i + 1) / n);
      const lo = [0, 1, 2].map((k) => Math.min(p[k]!, q[k]!)), hi = [0, 1, 2].map((k) => Math.max(p[k]!, q[k]!));
      const piece: Box = {
        name: `${a.name}#${i}`, x: lo[0]!, y: lo[1]!, z: lo[2]!,
        w: Math.max(hi[0]! - lo[0]!, 1e-3), d: Math.max(hi[1]! - lo[1]!, 1e-3), h: Math.max(hi[2]! - lo[2]!, 1e-3),
      };
      const blockers = others.filter((b) => inFront(b, piece) && !inFront(piece, b)).map(outline);
      const { visible } = split([to(xyz(p)), to(xyz(q))], blockers);
      for (const [u, v] of visible) {
        const offset = dashedHere ? `${dashed}${flowAttrs(a.name, Math.hypot(u.x - start.x, u.y - start.y), true)}` : "";
        drawn.push(`<line x1="${f(u.x)}" y1="${f(u.y)}" x2="${f(v.x)}" y2="${f(v.y)}"${offset}${colour}/>`);
      }
      if (i === n - 1) headHidden = blockers.some((poly) => insidePoly(to(xyz(q)), poly));
    }
    if (!headHidden) drawn.push(arrowSvg(a, 1, 1, true).replace(/^<line[^>]*\/>/, ""));
    over.push(wrap(moves?.arrows.get(a.name), drawn.join("")));
  }

  for (const br of scene.brackets) {
    const b = look(br.target);
    if (!b) continue;
    const { x0, x1, y0, y1 } = screenBox(b);
    const pad = 7, arm = Math.min(16, (x1 - x0) / 3);
    const X0 = x0 - pad, X1 = x1 + pad, Y0 = y0 - pad, Y1 = y1 + pad;
    const corners4: string[] = [];
    for (const [cx, cy, sx, sy] of [[X0, Y0, 1, 1], [X1, Y0, -1, 1], [X0, Y1, 1, -1], [X1, Y1, -1, -1]] as const) {
      corners4.push(
        `<polyline points="${f(cx)},${f(cy + sy * arm)} ${f(cx)},${f(cy)} ${f(cx + sx * arm)},${f(cy)}"${dashed}/>`,
      );
    }
    over.push(withSolid(b.name, corners4.join("")));
  }

  for (const d of scene.dots) {
    if (st.hairline && d.at) continue;
    const b = d.at ? undefined : look(d.target);
    if (!d.at && !b) continue;
    const p = d.at ? to({ x: d.at[0], y: d.at[1], z: d.at[2] }) : topCentre(b!);
    const r = d.r === undefined ? 3.2 : d.r * unit;
    const ring = d.accent ? st.accentLine : st.stroke;
    const svg = d.hollow
      ? `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(r)}" fill="${st.face}" stroke="${ring}" stroke-width="${f(r * 0.4)}" data-role="ink"/>`
      : `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(r)}" fill="${ring}" stroke="none" data-role="ink"/>`;
    over.push(b ? withSolid(b.name, svg) : svg);
  }

  // the figure's own screen bounds, so a tag never lands on top of the drawing
  const all = [
    ...scene.boxes.flatMap((b) => corners(b).map(to)),
    ...scene.cyls.flatMap((c) => cylPoints(c).map(to)),
    ...scene.arrows.flatMap((a) => [to(xyz(a.from)), to(xyz(a.to))]),
  ];
  const figTop = Math.min(...all.map((p) => p.y));
  const figBottom = Math.max(...all.map((p) => p.y));

  // labels sit in one row above the figure and one below. in a row they slide
  // sideways to clear each other, only as far as keeps their leader inside the
  // label and the label on the canvas. a tag that did not ask for a side moves
  // to the other row when its own is full. if the row still does not fit, labels
  // may slide further and their leader bends just short of the row. only when
  // even that fails does a label step further out. leaders are drawn first, so
  // none crosses over a label
  const H = 19, GAP = 8, INSET = 8, PAD = 4, STEP = H + 7;
  type Side = "above" | "below";
  type Label = {
    text: string; w: number; side: Side; fixed: boolean; index: number;
    // where the leader starts depends on the row: a solid's top for above, its base for below
    anchorFor: (side: Side) => P2; anchor: P2;
    lo: number; hi: number; x: number; y: number;
  };
  const labels: Label[] = [];
  for (const [index, t] of scene.tags.entries()) {
    const b = look(t.target);
    const arrow = scene.arrows.find((a) => a.name === t.target);
    if (!b && !arrow) continue;
    const w = t.text.length * 7.3 + 16;
    const anchorFor = (side: Side): P2 => arrow
      ? { x: (to(xyz(arrow.from)).x + to(xyz(arrow.to)).x) / 2, y: (to(xyz(arrow.from)).y + to(xyz(arrow.to)).y) / 2 }
      : side === "below" ? to({ x: b!.x + b!.w / 2, y: b!.y + b!.d / 2, z: b!.z }) : topCentre(b!);
    const anchor = anchorFor(t.side);
    labels.push({ text: t.text, w, side: t.side, fixed: t.fixed, index, anchorFor, anchor, lo: 0, hi: 0, x: anchor.x, y: 0 });
  }
  const bounds = (l: Label, loose: boolean) => {
    const edgeLo = PAD + l.w / 2, edgeHi = st.size - PAD - l.w / 2;
    l.lo = loose ? edgeLo : Math.max(l.anchor.x - (l.w / 2 - INSET), edgeLo);
    l.hi = loose ? edgeHi : Math.min(l.anchor.x + (l.w / 2 - INSET), edgeHi);
    // right at the canvas edge the leader can not stay inside, so the label only keeps on the canvas
    if (l.lo > l.hi) l.lo = l.hi = Math.min(Math.max(l.anchor.x, edgeLo), edgeHi);
  };
  const clamp = (v: number, l: Label) => Math.min(Math.max(v, l.lo), l.hi);
  // lay a row out left to right in anchor order; true when nothing overlaps
  const fits = (row: Label[], loose = false): boolean => {
    row.sort((a, b) => a.anchor.x - b.anchor.x);
    for (const l of row) { bounds(l, loose); l.x = clamp(l.anchor.x, l); }
    for (let it = 0; it < 200; it++) {
      let moved = false;
      for (let i = 0; i + 1 < row.length; i++) {
        const a = row[i]!, b = row[i + 1]!;
        const need = a.w / 2 + GAP + b.w / 2 - (b.x - a.x);
        if (need <= 1e-6) continue;
        const na = clamp(a.x - need / 2, a);
        const nb = clamp(b.x + need - (a.x - na), b);
        const na2 = clamp(na - Math.max(a.w / 2 + GAP + b.w / 2 - (nb - na), 0), a);
        if (Math.abs(na2 - a.x) > 1e-9 || Math.abs(nb - b.x) > 1e-9) moved = true;
        a.x = na2;
        b.x = nb;
      }
      if (!moved) break;
    }
    return row.every((l, i) => i === 0 || l.x - row[i - 1]!.x >= row[i - 1]!.w / 2 + GAP + l.w / 2 - 1e-6);
  };
  const rows = { above: labels.filter((l) => l.side === "above"), below: labels.filter((l) => l.side === "below") };
  const flipSide = (side: Side): Side => (side === "above" ? "below" : "above");
  const move = (l: Label, to: Side) => {
    rows[l.side].splice(rows[l.side].indexOf(l), 1);
    l.side = to;
    l.anchor = l.anchorFor(to);
    l.fixed = true;
    rows[to].push(l);
  };
  for (const side of ["above", "below"] as const) {
    const other = flipSide(side);
    for (let guard = 0; guard < labels.length && !fits(rows[side]); guard++) {
      const free = rows[side].filter((l) => !l.fixed);
      const tryMove = (l: Label) => {
        const probe = { ...l, anchor: l.anchorFor(other) };
        return fits([...rows[other].map((x) => ({ ...x })), probe]);
      };
      const pick = free.find((l) => fits(rows[side].filter((x) => x !== l).map((x) => ({ ...x }))) && tryMove(l)) ?? free.find(tryMove);
      if (!pick) break;
      move(pick, other);
    }
  }
  // rows that still do not fit: each label takes the nearest level out where it is clear
  const leaders: string[] = [];
  const boxes: string[] = [];
  // a style can fix the look of its labels; otherwise each figure takes one of them,
  // chosen from what its tags say, so a page of figures does not repeat one box
  const LOOKS = ["box", "pill", "plain", "underline", "corners", "chip"] as const;
  const tagLook = st.tag ?? LOOKS[parseInt(hash(scene.tags.map((t) => t.text).join("|")), 36) % LOOKS.length]!;
  // what sits behind a label's text. every look keeps a knockout, so a leader or
  // a solid behind never runs through the words
  const tagFrame = (x: number, y: number, w: number) => {
    const knock = (extra = "") => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${H}" fill="${st.background}"${extra} data-role="knockout"/>`;
    const thin = ` stroke="${st.stroke}" stroke-width="${f(Math.max(0.6, st.strokeWidth * 0.6))}" fill="none" data-role="line"`;
    switch (tagLook) {
      case "pill":
        return knock(` rx="${H / 2}"`);
      case "plain":
        return knock(' stroke="none"');
      case "underline":
        return knock(' stroke="none"') + `<line x1="${f(x + 4)}" y1="${f(y + H)}" x2="${f(x + w - 4)}" y2="${f(y + H)}"${thin}/>`;
      case "corners": {
        const t = 5;
        const c = (px: number, py: number, dx: number, dy: number) => `<polyline points="${f(px + dx * t)},${f(py)} ${f(px)},${f(py)} ${f(px)},${f(py + dy * t)}"${thin}/>`;
        return knock(' stroke="none"') + c(x, y, 1, 1) + c(x + w, y, -1, 1) + c(x, y + H, 1, -1) + c(x + w, y + H, -1, -1);
      }
      case "chip":
        return knock(` rx="4" stroke="none"`) + `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${H}" rx="4" fill="${st.stroke}" fill-opacity="0.12" stroke="none" data-role="ink"/>`;
      default:
        return knock();
    }
  };
  const ride = (i: number, inner: string) => wrap(moves?.tags.get(i), wrap(moves?.rides.get(i), inner));
  for (const side of ["above", "below"] as const) {
    const row = rows[side];
    const ok = fits(row) || fits(row, true);
    const base = side === "above" ? figTop - 16 - H : figBottom + 16;
    const taken: { x0: number; x1: number; level: number }[] = [];
    for (const l of row) {
      let level = 0;
      if (!ok) {
        while (taken.some((r) => r.level === level && l.x - l.w / 2 < r.x1 + GAP && l.x + l.w / 2 > r.x0 - GAP)) level++;
      }
      taken.push({ x0: l.x - l.w / 2, x1: l.x + l.w / 2, level });
      l.y = base + (side === "above" ? -1 : 1) * level * STEP;
      const x0 = l.x - l.w / 2;
      // the leader meets the label's near edge: straight when the anchor is over
      // the label, otherwise straight until just short of the row, then across
      const lx = Math.min(Math.max(l.anchor.x, x0 + INSET), x0 + l.w - INSET);
      const ly = side === "below" ? l.y : l.y + H;
      if (Math.abs(lx - l.anchor.x) < 0.01) {
        const a = offPanel(l.anchor, { x: lx, y: ly });
        leaders.push(ride(l.index, `<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(lx)}" y2="${f(ly)}"${dashed}/>`));
      } else {
        const bend = ly + (side === "below" ? -10 : 10);
        const a = offPanel(l.anchor, { x: l.anchor.x, y: bend });
        leaders.push(ride(l.index, `<polyline points="${f(a.x)},${f(a.y)} ${f(l.anchor.x)},${f(bend)} ${f(lx)},${f(ly)}"${dashed}/>`));
      }
      // which tag it is, counting tag lines from the top, for an editor
      const own = (inner: string) => (options.ids ? `<g data-tag="${l.index}">${inner}</g>` : inner);
      boxes.push(ride(l.index, own(
        tagFrame(x0, l.y, l.w) +
        `<text x="${f(l.x)}" y="${f(l.y + 13.5)}" text-anchor="middle" font-family="monospace"` +
        ` font-size="11" letter-spacing="0.5" stroke="none" fill="${st.stroke}" data-role="ink">${escapeText(l.text)}</text>`,
      )));
    }
  }
  // a ripple is three rings over the top of what sends it, each spreading and fading
  for (const name of scene.motion.ripples) {
    const parts = [...byName.values()].filter((b) => b.name === name || b.name.startsWith(`${name}.`));
    if (!parts.length) continue;
    const x0 = Math.min(...parts.map((b) => b.x)), y0 = Math.min(...parts.map((b) => b.y));
    const w = Math.max(...parts.map((b) => b.x + b.w)) - x0, d = Math.max(...parts.map((b) => b.y + b.d)) - y0;
    const top = Math.max(...parts.map((b) => b.z + b.h));
    const ring = circle3({ x: x0 + w / 2, y: y0 + d / 2, z: top }, 0.6 * Math.max(w, d), "z").map(to);
    for (let k = 0; k < 3; k++) {
      over.push(wrap(moves?.ambient.get(`${name}~ripple${k}`),
        `<polygon points="${ring.map((q) => `${f(q.x)},${f(q.y)}`).join(" ")}" fill="none" stroke="${st.accentLine}" ` +
        `stroke-width="${f(st.strokeWidth)}" data-role="signal"/>`));
    }
  }
  over.push(...leaders, ...boxes);

  const groundRing = (): string => {
    let cx: number, cy: number, r: number;
    if (scene.ground) {
      [cx, cy, r] = [scene.ground.x, scene.ground.y, scene.ground.r];
    } else {
      const feet = [...scene.boxes, ...scene.cyls.map((c) => ({ x: c.x, y: c.y, w: 2 * c.r, d: 2 * c.r }))];
      if (feet.length === 0) return "";
      const x0 = Math.min(...feet.map((b) => b.x)), x1 = Math.max(...feet.map((b) => b.x + b.w));
      const y0 = Math.min(...feet.map((b) => b.y)), y1 = Math.max(...feet.map((b) => b.y + b.d));
      [cx, cy, r] = [(x0 + x1) / 2, (y0 + y1) / 2, 0.59 * Math.hypot(x1 - x0, y1 - y0)];
    }
    const pts = Array.from({ length: 56 }, (_, k) => {
      const a = (k / 56) * Math.PI * 2;
      return to({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), z: 0 });
    });
    return `<polygon points="${pts.map((p) => `${f(p.x)},${f(p.y)}`).join(" ")}" fill="none" ` +
      `stroke="${st.ghost ?? shaded(st.stroke, 1.62)}" stroke-width="${f(1.4 * (st.strokeWidth / 2.1))}" ` +
      `stroke-dasharray="${f(6 * (st.strokeWidth / 2.1))} ${f(6 * (st.strokeWidth / 2.1))}" data-role="ground"/>`;
  };

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${options.frame?.x ?? 0} ${options.frame?.y ?? 0} ${canvasW} ${canvasH}" width="${canvasW}" height="${canvasH}"${st.name ? ` data-style="${st.name}"` : ""}${st.hairline ? ` class="${figureId}"` : ""}>` +
    (st.machine ? `<style>${st.machine.split("}").filter((r) => r.trim()).map((r) => `.${figureId} ${r}}`).join("")}</style>`
      : st.hairline ? `<style>.${figureId} *{vector-effect:non-scaling-stroke}</style>` : "") +
    `<rect${options.frame?.x ? ` x="${options.frame.x}"` : ""}${options.frame?.y ? ` y="${options.frame.y}"` : ""} width="${canvasW}" height="${canvasH}" fill="${st.background}" data-role="sheet"/>` +
    // the dotted field and the ring the figure stands on. both belong to the look
    // rather than the figure, so they are drawn from the style and never from a line.
    (st.ground && st.ground.dots > 0
      ? `<defs><pattern id="${figureId}-d" width="${st.ground.dots}" height="${st.ground.dots}" patternUnits="userSpaceOnUse">` +
        `<circle cx="1.6" cy="1.6" r="1.4" fill="${st.ground.dotColour ?? shaded(st.stroke, 1.72)}"/></pattern></defs>` +
        `<rect width="${st.size}" height="${st.size}" fill="url(#${figureId}-d)" data-role="sheet"/>`
      : "") +
    (st.ground?.ring ? groundRing() : "") +
    // a still frame needs no css; reduced motion shows the finished figure
    (rules.length && options.at === undefined
      ? `<style>${rules.join("")}@media (prefers-reduced-motion:reduce){[class^="${figureId}-"]{animation:none!important}}</style>`
      : "") +
    `<g stroke="${st.stroke}" stroke-width="${st.strokeWidth}" stroke-linejoin="round" stroke-linecap="round" fill="none" data-role="line">` +
    solids.join("") + over.join("") +
    `</g></svg>`
  );
}
