/// <reference lib="dom" />
// A figure that answers the pointer. It is a handful of numbers that ease towards
// where the pointer wants them, and a scene written from those numbers; every
// frame the compiler draws the scene again. Nothing here knows how to draw.
import { compile } from "./index.ts";
import type { Frame } from "./svg.ts";
import type { Style } from "./style.ts";

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rad = (d: number) => (d * Math.PI) / 180;

let reduced = false;
export const setReducedMotion = (on: boolean) => { reduced = on; };
export const reducedMotion = () => reduced;

// a damped spring, stepped at 240 a second whatever the frame rate, so it moves
// the same on every screen. it snaps home once it is near and nearly still
export type Spring = { x: number; v: number; t: number; k: number; c: number; m: number; eps: number };
export function spring(x: number, o: { k?: number; c?: number; m?: number; eps?: number } = {}): Spring {
  return { x, v: 0, t: x, k: o.k ?? 100, c: o.c ?? 18, m: o.m ?? 1, eps: o.eps ?? 0.01 };
}
export function step(sp: Spring, dt: number): boolean {
  if (reduced) {
    sp.x = sp.t;
    sp.v = 0;
    return false;
  }
  const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
  for (let i = 0; i < n; i++) {
    const a = (-sp.k * (sp.x - sp.t) - sp.c * sp.v) / sp.m;
    sp.v += a * h;
    sp.x += sp.v * h;
  }
  if (Math.abs(sp.x - sp.t) < sp.eps && Math.abs(sp.v) < sp.eps * 10) {
    sp.x = sp.t;
    sp.v = 0;
    return false;
  }
  return true;
}

function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (u: number) => ((ax * u + bx) * u + cx) * u;
  const Y = (u: number) => ((ay * u + by) * u + cy) * u;
  const dX = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 8; i++) {
      const e = X(u) - t;
      if (Math.abs(e) < 1e-5) break;
      const d = dX(u);
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    if (!(u >= 0 && u <= 1) || Math.abs(X(u) - t) > 1e-4) {
      let lo = 0, hi = 1;
      u = t;
      for (let i = 0; i < 24; i++) {
        if (X(u) < t) lo = u;
        else hi = u;
        u = (lo + hi) / 2;
      }
    }
    return Y(u);
  };
}
// a timed move for things that should go at a set pace rather than spring: a
// door swinging, a commit lifting after the one before it
export const EASE = bezier(0.32, 0.72, 0, 1);
export type Tween = { from: number; to: number; t0: number; dur: number };
export const tween = (v: number, dur = 700): Tween => ({ from: v, to: v, t0: -1e9, dur });
export const tval = (tw: Tween, now: number) => tw.from + (tw.to - tw.from) * (reduced ? 1 : EASE(clamp((now - tw.t0) / tw.dur, 0, 1)));
export const tset = (tw: Tween, to: number, now: number, delay: number) => {
  if (tw.to === to) return;
  tw.from = tval(tw, now);
  tw.to = to;
  tw.t0 = now + delay;
};
export const tdone = (tw: Tween, now: number) => reduced || now >= tw.t0 + tw.dur;

// a colour that eases from one tone to another when something is picked or let go,
// the way a css transition would: eased progress, and a change back before it has
// finished takes only as long as the part already travelled
export function fades(dur = 260, ease = bezier(0.5, 0, 0.1, 1)) {
  type F = { from: number; to: number; t0: number; d: number; back: number; f: number };
  const all = new Map<string, F>();
  const at = (key: string, now: number) => {
    const r = all.get(key);
    if (!r) return 0;
    if (reduced || now >= r.t0 + r.d) return r.to;
    return r.from + (r.to - r.from) * ease(clamp((now - r.t0) / r.d, 0, 1));
  };
  return {
    at,
    set(key: string, to: number, now: number) {
      const r = all.get(key);
      if (!r) { all.set(key, { from: to, to, t0: -1e9, d: 0, back: to, f: 1 }); return; }
      if (r.to === to) return;
      const cur = at(key, now), running = now < r.t0 + r.d;
      if (running && to === r.back) {
        const p = ease(clamp((now - r.t0) / r.d, 0, 1)), f = clamp(Math.abs(p * r.f + (1 - r.f)), 0, 1);
        all.set(key, { from: cur, to, t0: now, d: dur * f, back: r.to, f });
      } else all.set(key, { from: cur, to, t0: now, d: dur, back: cur, f: 1 });
    },
    busy: (now: number) => [...all.values()].some((r) => !reduced && now < r.t0 + r.d),
  };
}
// the same easing between any colours, for something that moves between more than
// two tones; colours are #rrggbb and so is what it gives back
export function paints(dur = 260, ease = bezier(0.5, 0, 0.1, 1)) {
  type C = [number, number, number];
  type F = { from: C; to: C; t0: number; d: number; back: C; f: number };
  const rgb = (h: string): C => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as C;
  const hex = (c: C) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const same = (a: C, b: C) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  const all = new Map<string, F>();
  const at = (key: string, now: number): C => {
    const r = all.get(key)!;
    if (reduced || now >= r.t0 + r.d) return r.to;
    const p = ease(clamp((now - r.t0) / r.d, 0, 1));
    return [0, 1, 2].map((i) => r.from[i]! + (r.to[i]! - r.from[i]!) * p) as C;
  };
  return {
    // as a tone the compiler takes: the six hex digits without the #
    at: (key: string, now: number) => (all.has(key) ? hex(at(key, now)).slice(1) : "000000"),
    set(key: string, colour: string, now: number) {
      const to = rgb(colour), r = all.get(key);
      if (!r) { all.set(key, { from: to, to, t0: -1e9, d: 0, back: to, f: 1 }); return; }
      if (same(r.to, to)) return;
      const cur = at(key, now), running = now < r.t0 + r.d;
      if (running && same(to, r.back)) {
        const p = ease(clamp((now - r.t0) / r.d, 0, 1)), f = clamp(Math.abs(p * r.f + (1 - r.f)), 0, 1);
        all.set(key, { from: cur, to, t0: now, d: dur * f, back: r.to, f });
      } else all.set(key, { from: cur, to, t0: now, d: dur, back: cur, f: 1 });
    },
    busy: (now: number) => [...all.values()].some((r) => !reduced && now < r.t0 + r.d),
    // jump to where it was heading, as a css transition does when its element is moved
    snap(key: string) { const r = all.get(key); if (r) all.set(key, { ...r, from: r.to, t0: -1e9, d: 0 }); },
  };
}
// a tone that is part of the way to hi: hi:40 is 40 parts hi to 60 of the plain edge
export const toward = (v: number, base = "sil", to = "hi") =>
  (v >= 1 ? to : v <= 0 ? base : `${to}:${+(v * 100).toFixed(3)}${base === "sil" ? "" : `:${base}`}`);

// the camera: turned az about the vertical, k the cosine of how far it looks
// down, S pixels to a unit, and where the origin lands. the pointer is read
// back through it onto whatever plane the figure cares about
export type Camera = { az: number; k: number; S: number; ox: number; oy: number };
export const camera = (azDeg: number, k: number, S: number): Camera => ({ az: rad(azDeg), k, S, ox: 0, oy: 0 });
export function project(C: Camera) {
  const c = Math.cos(C.az), s = Math.sin(C.az), zf = Math.sqrt(1 - C.k * C.k);
  return (x: number, y: number, z: number): [number, number] => {
    const X = x * c - y * s, Y = x * s + y * c;
    return [C.ox + C.S * X, C.oy + C.S * (Y * C.k - z * zf)];
  };
}
export function unproject(C: Camera, sx: number, sy: number, z: number): [number, number] {
  const c = Math.cos(C.az), s = Math.sin(C.az), zf = Math.sqrt(1 - C.k * C.k);
  const X = (sx - C.ox) / C.S, Y = ((sy - C.oy) / C.S + z * zf) / C.k;
  return [X * c + Y * s, -X * s + Y * c];
}
// centre the given points on cx, cy
export function fit(C: Camera, pts: number[][], cx: number, cy: number) {
  C.ox = 0;
  C.oy = 0;
  const P = project(C);
  let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
  for (const p of pts) {
    const q = P(p[0]!, p[1]!, p[2]!);
    a = Math.min(a, q[0]); b = Math.max(b, q[0]);
    c = Math.min(c, q[1]); d = Math.max(d, q[1]);
  }
  C.ox = cx - (a + b) / 2;
  C.oy = cy - (c + d) / 2;
}
// the compiler's frame for a camera, when the scene is written in units of
// `scale` camera units and moved by `shift` so nothing sits below zero
export function frameOf(C: Camera, width: number, height: number, scale: number, shift: [number, number, number]): Frame {
  const P = project(C), o = P(-shift[0], -shift[1], -shift[2]);
  return { width, height, unit: (C.S * scale) / Math.sqrt(1.5), ox: o[0], oy: o[1] };
}

export type Point = [number, number];
export type Figure = {
  frame: Frame;
  style: Partial<Style>;
  // the scene as it stands
  draw(): string;
  // what the figure says when nothing has happened yet
  rest?: string;
  // the moment its own timed tracks are drawn at, in seconds, for a figure that keeps a clock
  at?: number;
  // advance by dt seconds; true while anything is still moving
  tick(dt: number, now: number): boolean;
  move?(p: Point): void;
  down?(p: Point): void;
  leave?(): void;
  key?(e: KeyboardEvent): void;
};
export type Context = { wake(): void; read(text: string): void };

// keep a figure drawn in an element: it runs while something moves and sleeps
// otherwise, and a pointer event wakes it
export function mount(el: HTMLElement, make: (ctx: Context) => Figure, opts: { onRead?: (t: string) => void } = {}) {
  let raf = 0, last = 0, awake = true, shown = "", gone = false;
  const host = el.ownerDocument.createElement("div");
  // the drawing is replaced every frame, and a browser that loses the node under the
  // pointer never tells the stage it was left, so the pointer only ever meets the stage
  host.style.cssText = "width:100%;height:100%;pointer-events:none";
  el.appendChild(host);
  const loop = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1e3));
    last = now;
    awake = !!fig.tick(dt, now);
    paint();
    raf = awake && !gone ? requestAnimationFrame(loop) : 0;
  };
  const wake = () => {
    awake = true;
    if (!raf && !gone) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  };
  let said = false;
  const fig = make({ wake, read: (t) => { said = true; opts.onRead?.(t); } });
  if (!said) opts.onRead?.(fig.rest ?? "");
  function paint() {
    const src = fig.draw();
    if (src === shown && fig.at === undefined) return;
    shown = src;
    const r = compile(src, { style: fig.style, lenient: true, frame: fig.frame, ...(fig.at === undefined ? {} : { at: fig.at }) });
    if (r.ok) host.innerHTML = r.figure.svg.replace(/width="\d+(\.\d+)?" height="\d+(\.\d+)?"/, 'width="100%" height="100%"');
  }
  fig.tick(0, performance.now());
  paint();
  wake();
  // pointer positions in the frame's own units, like the svg's viewBox
  const pt = (e: PointerEvent): Point => {
    const r = el.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * fig.frame.width, ((e.clientY - r.top) / r.height) * fig.frame.height];
  };
  let tm = 0;
  const move = (e: PointerEvent) => { clearTimeout(tm); fig.move?.(pt(e)); wake(); };
  const down = (e: PointerEvent) => { clearTimeout(tm); (fig.down ?? fig.move)?.(pt(e)); wake(); };
  // a finger lifting is not the pointer leaving, so touch waits a moment first
  const leave = (e: PointerEvent) => {
    clearTimeout(tm);
    tm = window.setTimeout(() => { fig.leave?.(); wake(); }, e.pointerType === "mouse" ? 0 : 1400);
  };
  const key = (e: KeyboardEvent) => { fig.key?.(e); wake(); };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerleave", leave);
  el.addEventListener("keydown", key);
  return {
    wake,
    destroy() {
      gone = true;
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(tm);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("keydown", key);
      host.remove();
    },
  };
}
