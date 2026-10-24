// Motion as keyframes. Every moving thing gets a track: a list of looks
// (offset, scale, opacity, dash shift) at times, with an easing into the next.
// The same tracks become css for the browser and are evaluated at a time to draw
// a still frame, so a frame shows exactly what the animation plays.
import { inFront } from "./visible.ts";
import type { Box, P2, P3 } from "./iso.ts";
import { ParseError } from "./parse.ts";
import type { Entrance, Scene } from "./scene.ts";

export type Look = { tx: number; ty: number; s: number; o: number; dash: number };
export type Key = { at: number; look: Look; ease: [number, number, number, number] };
export type Track = { origin: P2; keys: Key[]; period: number; delay: number; repeat: boolean };

export type Plan = {
  loop: boolean;
  // seconds until the last entrance has landed
  settled: number;
  // by the name of a box part or a cylinder
  enter: Map<string, Track>;
  ambient: Map<string, Track>;
  // by index into scene.tags and scene.links, and by arrow name
  tags: Map<number, Track>;
  links: Map<number, Track>;
  arrows: Map<string, Track>;
  flows: Map<string, Track>;
  // a tag on something bobbing goes up and down with it, by index into scene.tags
  rides: Map<number, Track>;
};

const BASE: Look = { tx: 0, ty: 0, s: 1, o: 1, dash: 0 };
const LINEAR: Key["ease"] = [0, 0, 1, 1];
const EASE_IN: Key["ease"] = [0.55, 0, 1, 0.45];
const EASE_OUT: Key["ease"] = [0, 0.55, 0.45, 1];
const SMOOTH: Key["ease"] = [0.2, 0.8, 0.2, 1];
const SPRING: Key["ease"] = [0.3, 1.5, 0.5, 1];
const IN_OUT: Key["ease"] = [0.45, 0, 0.55, 1];

// how long each way of coming in takes, and the pause between steps
const DURATION = { drop: 0.7, rise: 0.6, pop: 0.55, fade: 0.5 };
const FIRST = 0.06, BETWEEN = 0.11, EXIT = 0.35, MARK_FADE = 0.3;
// the dash pattern is 6 on 5 off: shifting by 11 is one whole cycle
const DASH_CYCLE = 11;

const look = (l: Partial<Look>): Look => ({ ...BASE, ...l });

// loop overrides the figure's own timeline line: false plays the sequence once and
// leaves the finished figure; float, pulse and flow still run on
export type PlanOptions = {
  // draw what can be drawn and say what had to bend, instead of refusing the figure
  lenient?: boolean;
  notes?: string[];
};

export function plan(scene: Scene, to: (p: P3) => P2, unit: number, loop?: boolean, options: PlanOptions = {}): Plan | null {
  const m = { ...scene.motion, loop: loop ?? scene.motion.loop };
  if (!m.entrances.length && !m.floats.length && !m.pulses.length && !m.flows.length &&
    !m.slides.length && !m.bobs.length && !m.blinks.length && !m.ripples.length) return null;

  // every solid that can move: box parts and cylinders, as boxes
  // an icon is printed on what it sits on, so it moves the way that does: it joins
  // the solids here only to be carried, never to carry anything
  const iconBoxes: Box[] = scene.icons.map((g) => ({ name: g.name, x: g.x, y: g.y, z: g.z, w: g.size, d: g.size, h: 0 }));
  const isIcon = new Set(iconBoxes.map((b) => b.name));
  const solids: Box[] = [
    ...scene.boxes,
    ...iconBoxes,
    ...scene.cyls.map((c) => ({
      name: c.name, x: c.x, y: c.y, z: c.z,
      w: c.axis === "x" ? c.h : 2 * c.r, d: c.axis === "y" ? c.h : 2 * c.r, h: c.axis === "z" ? c.h : 2 * c.r,
    })),
  ];
  const partsOf = (name: string) => solids.filter((b) => b.name === name || b.name.startsWith(`${name}.`));
  // stagger order: a stack bottom up by its index, a grid bottom up then front to back, a tray all at once
  const staggerIndex = (parts: Box[]) => {
    const tray = parts.some((b) => b.name.endsWith(".floor"));
    if (tray || parts.length === 1) return new Map(parts.map((b) => [b.name, 0]));
    const sorted = [...parts].sort((a, b) => a.z - b.z || (a.x + a.y) - (b.x + b.y) || a.name.localeCompare(b.name));
    return new Map(sorted.map((b, i) => [b.name, i]));
  };
  const baseCentre = (b: Box): P3 => ({ x: b.x + b.w / 2, y: b.y + b.d / 2, z: b.z });
  const bounds = (bs: Box[]) => {
    const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y)), z = Math.min(...bs.map((b) => b.z));
    return { x, y, z, w: Math.max(...bs.map((b) => b.x + b.w)) - x, d: Math.max(...bs.map((b) => b.y + b.d)) - y, h: Math.max(...bs.map((b) => b.z + b.h)) - z };
  };

  // one entrance for one part: its start, its keys relative to that start, and how long it runs
  type Spec = { start: number; length: number; origin: P2; keys: (s: number) => Key[] };
  const specs = new Map<string, Spec>();
  const drop = Math.min(1.6 * unit, 90), rise = Math.min(0.8 * unit, 40);

  let stepStart = FIRST, stepEnd = FIRST;
  m.entrances.forEach((e, i) => {
    if (i > 0 && !e.together) stepStart = stepEnd + BETWEEN;
    const parts = partsOf(e.target);
    const index = staggerIndex(parts);
    let source = e.from ? bounds(partsOf(e.from)) : undefined;
    if (source) {
      const problem = pathProblem(e, parts, source);
      if (problem && !options.lenient) throw new ParseError(problem, e.line, e.text);
      if (problem) {
        options.notes?.push(`${problem}, so it comes in where it stands`);
        source = undefined;
      }
    }
    // coming out of something takes a little longer, so the way out can be seen
    const length = source ? 0.9 : DURATION[e.how];
    for (const part of parts) {
      const start = stepStart + e.stagger * index.get(part.name)!;
      const origin = to(baseCentre(part));
      let keys: Spec["keys"];
      if (source) {
        const from = to({ x: source.x + source.w / 2, y: source.y + source.d / 2, z: source.z + source.h / 2 });
        const dx = from.x - origin.x, dy = from.y - origin.y;
        // it shows up small where the source is, then travels out and grows into place
        keys = (s) => [
          { at: s, look: look({ tx: dx, ty: dy, s: 0.2, o: 0 }), ease: EASE_OUT },
          { at: s + 0.15 * length, look: look({ tx: dx, ty: dy, s: 0.4 }), ease: IN_OUT },
          { at: s + length, look: BASE, ease: LINEAR },
        ];
      } else if (e.how === "drop") {
        keys = (s) => [
          { at: s, look: look({ ty: -drop, o: 0 }), ease: LINEAR },
          { at: s + 0.15 * length, look: look({ ty: -0.97 * drop }), ease: EASE_IN },
          { at: s + 0.8 * length, look: look({ ty: 2 }), ease: EASE_OUT },
          { at: s + length, look: BASE, ease: LINEAR },
        ];
      } else if (e.how === "rise") {
        keys = (s) => [
          { at: s, look: look({ ty: rise, o: 0 }), ease: SMOOTH },
          { at: s + 0.72 * length, look: look({ ty: -0.14 * rise }), ease: EASE_OUT },
          { at: s + length, look: BASE, ease: LINEAR },
        ];
      } else if (e.how === "pop") {
        keys = (s) => [
          { at: s, look: look({ s: 0.2, o: 0 }), ease: LINEAR },
          { at: s + 0.25 * length, look: look({ s: 0.6 }), ease: SPRING },
          { at: s + length, look: BASE, ease: LINEAR },
        ];
      } else {
        keys = (s) => [
          { at: s, look: look({ o: 0 }), ease: EASE_OUT },
          { at: s + length, look: BASE, ease: LINEAR },
        ];
      }
      specs.set(part.name, { start, length, origin, keys });
    }
    stepEnd = Math.max(stepEnd, ...parts.map((p) => specs.get(p.name)!.start + length));
  });

  // whatever rests on something that comes in, comes in with it: a coin on a tile
  // pops with the tile. so does whatever hovers over it with nothing in between,
  // like a coin floating over a tray, and a stack, grid or tray comes in whole
  const groupOf = (name: string) => name.split(".")[0]!;
  const restsOn = (b: Box, s: Box) =>
    Math.abs(b.z - (s.z + s.h)) < 1e-6 &&
    Math.min(b.x + b.w, s.x + s.w) - Math.max(b.x, s.x) > 1e-6 && Math.min(b.y + b.d, s.y + s.d) - Math.max(b.y, s.y) > 1e-6;
  const groups = [...new Set(solids.map((b) => groupOf(b.name)))]
    .map((g) => ({ name: g, parts: solids.filter((b) => groupOf(b.name) === g) }))
    .filter((g) => g.parts.length > 1)
    .map((g) => ({ ...bounds(g.parts), name: g.name, parts: g.parts }));
  // the solid, or whole stack, grid or tray, nearest below the middle of b
  const beneath = (b: Box): string[] => {
    const cx = b.x + b.w / 2, cy = b.y + b.d / 2;
    const over = (s: { x: number; y: number; w: number; d: number; z: number; h: number }) =>
      cx > s.x && cx < s.x + s.w && cy > s.y && cy < s.y + s.d && s.z + s.h <= b.z + 1e-6;
    let top = -Infinity, names: string[] = [];
    for (const s of solids) {
      if (s === b || isIcon.has(s.name) || groupOf(s.name) === groupOf(b.name) || !over(s)) continue;
      if (s.z + s.h > top + 1e-6) { top = s.z + s.h; names = [s.name]; }
    }
    for (const g of groups) {
      if (g.name === groupOf(b.name) || !over(g)) continue;
      if (g.z + g.h > top + 1e-6) { top = g.z + g.h; names = g.parts.map((p) => p.name); }
    }
    return names;
  };
  // who carries what, so a carried thing can also pick up its carrier's float or pulse
  const carrier = new Map<string, string>();
  // an icon standing on something that never enters still floats with it
  for (const g of iconBoxes) {
    // the part it rests on, before the whole stack or grid that part belongs to
    const under = solids.find((s) => !isIcon.has(s.name) && restsOn(g, s))?.name ?? beneath(g)[0];
    if (under) carrier.set(g.name, under);
  }
  for (let pass = 0; pass <= solids.length; pass++) {
    let changed = false;
    for (const b of solids) {
      if (specs.has(b.name)) continue;
      let supports = solids.filter((s) => s !== b && !isIcon.has(s.name) && specs.has(s.name) && restsOn(b, s)).map((s) => s.name);
      if (!supports.length) supports = beneath(b).filter((n) => specs.has(n));
      if (!supports.length && b.name.includes(".")) {
        supports = solids.filter((s) => s !== b && specs.has(s.name) && groupOf(s.name) === groupOf(b.name)).map((s) => s.name);
      }
      if (!supports.length) continue;
      const latest = supports.reduce((a, n) => (specs.get(n)!.start > specs.get(a)!.start ? n : a));
      specs.set(b.name, specs.get(latest)!);
      carrier.set(b.name, latest);
      changed = true;
    }
    if (!changed) break;
  }

  /** Why this entrance can not come out of its source, or null when it can. */
  function pathProblem(e: Entrance, parts: Box[], source: { x: number; y: number; z: number; w: number; d: number; h: number }): string | null {
    const from = e.from!;
    // coming out of another solid moves sideways as well as up, so the drawing
    // order could change on the way. refuse when it would pass behind something
    // it stands in front of, or the other way round
    const moving = new Set(parts.map((p) => p.name));
    const others = solids.filter((o) => !moving.has(o.name) && o.name !== from && !o.name.startsWith(`${from}.`));
    const rel = (a: Box, b: Box) => (inFront(a, b) && !inFront(b, a) ? 1 : inFront(b, a) && !inFront(a, b) ? -1 : 0);
    const c = { x: source.x + source.w / 2, y: source.y + source.d / 2, z: source.z + source.h / 2 };
    for (const part of parts) {
      const base = baseCentre(part);
      const dx = c.x - base.x, dy = c.y - base.y, dz = c.z - base.z;
      for (const o of others) {
        const final = rel(part, o);
        if (!final) continue;
        for (let t = 0; t <= 1; t += 0.1) {
          const moved = { ...part, x: part.x + (1 - t) * dx, y: part.y + (1 - t) * dy, z: part.z + (1 - t) * dz };
          if (rel(moved, o) === -final) {
            return `${e.target} coming out of ${from} would pass ${final > 0 ? "behind" : "in front of"} ${o.name} on the way`;
          }
        }
      }
    }
    return null;
  }

  const settled = m.entrances.length ? stepEnd : 0;
  const period = settled + m.hold + EXIT;
  const hidden = (k: Key[]) => ({ ...k[0]!.look, o: 0 });
  // one entrance's keys laid out over the whole timeline
  const lay = (keys: Key[], origin: P2): Track => {
    const first = keys[0]!;
    const out: Key[] = [];
    if (first.at > 0) out.push({ at: 0, look: hidden(keys), ease: LINEAR });
    out.push(...keys);
    // with no hold the timeline can end before a late mark has faded in: keep times in order
    for (let i = 1; i < out.length; i++) out[i] = { ...out[i]!, at: Math.max(out[i]!.at, out[i - 1]!.at) };
    if (m.loop) {
      const last = keys[keys.length - 1]!;
      out.push({ at: Math.max(period - EXIT, last.at), look: last.look, ease: LINEAR });
      out.push({ at: period - 0.05, look: { ...last.look, o: 0 }, ease: LINEAR });
      out.push({ at: period, look: hidden(keys), ease: LINEAR });
    }
    return { origin, keys: dedupe(out), period: m.loop ? period : out[out.length - 1]!.at, delay: 0, repeat: m.loop };
  };
  const appear = (at: number, origin: P2 = { x: 0, y: 0 }): Track =>
    lay([{ at, look: look({ o: 0 }), ease: EASE_OUT }, { at: at + MARK_FADE, look: BASE, ease: LINEAR }], origin);

  const enter = new Map<string, Track>();
  for (const [name, spec] of specs) enter.set(name, lay(spec.keys(spec.start), spec.origin));
  // when a named solid, or all of it, is in place
  const landed = (name: string) => {
    const times = partsOf(name).map((p) => { const s = specs.get(p.name); return s ? s.start + s.length : 0; });
    return times.length ? Math.max(...times) : 0;
  };

  const tags = new Map<number, Track>();
  scene.tags.forEach((t, i) => {
    const arrow = scene.arrows.find((a) => a.name === t.target);
    const at = arrow ? arrowLanded(arrow.name) : landed(t.target);
    if (at > 0) tags.set(i, appear(at - 0.05));
  });
  function arrowLanded(name: string) {
    const a = scene.arrows.find((x) => x.name === name)!;
    // a point arrow joins nothing, so it waits for the whole figure
    const at = a.ends ? Math.max(0, ...a.ends.map(landed)) : settled;
    return at > 0 ? at + 0.05 : 0;
  }
  const arrows = new Map<string, Track>();
  for (const a of scene.arrows) {
    const at = arrowLanded(a.name);
    if (at > 0) arrows.set(a.name, appear(at));
  }
  const links = new Map<number, Track>();
  scene.links.forEach((l, i) => {
    const at = Math.max(landed(l.from), landed(l.to));
    if (at > 0) links.set(i, appear(at + 0.05));
  });

  // float, pulse and flow start once everything has landed, and never stop
  const ambient = new Map<string, Track>();
  const after = m.loop ? 0 : settled;
  for (const name of m.floats) {
    for (const part of partsOf(name)) {
      ambient.set(part.name, {
        origin: { x: 0, y: 0 }, period: 3, delay: after, repeat: true,
        keys: [
          { at: 0, look: BASE, ease: IN_OUT },
          { at: 1.5, look: look({ ty: -Math.min(0.12 * unit, 6) }), ease: IN_OUT },
          { at: 3, look: BASE, ease: LINEAR },
        ],
      });
    }
  }
  for (const name of m.pulses) {
    const parts = partsOf(name);
    const origin = to(baseCentre(bounds(parts) as Box));
    for (const part of parts) {
      ambient.set(part.name, {
        origin, period: 1.6, delay: after, repeat: true,
        keys: [
          { at: 0, look: BASE, ease: IN_OUT },
          { at: 0.8, look: look({ s: 1.06 }), ease: IN_OUT },
          { at: 1.6, look: BASE, ease: LINEAR },
        ],
      });
    }
  }
  // a move in scene units, as it lands on the page
  const shift = (by: [number, number, number]) => {
    const o = to({ x: 0, y: 0, z: 0 }), e = to({ x: by[0], y: by[1], z: by[2] });
    return { tx: e.x - o.x, ty: e.y - o.y };
  };
  // slide: every part goes one step and starts again. moves with the same step are
  // one belt, so the part furthest upstream fades in and the one furthest down fades
  // out, and a row of the same thing reads as a line that never stops
  const SLIDE = 1.6;
  const belts = new Map<string, Box[]>();
  for (const mv of m.slides) {
    const key = mv.by.join(",");
    belts.set(key, [...(belts.get(key) ?? []), ...partsOf(mv.target)]);
  }
  for (const [key, parts] of belts) {
    const by = key.split(",").map(Number) as [number, number, number];
    const along = (b: Box) => (b.x + b.w / 2) * by[0] + (b.y + b.d / 2) * by[1] + (b.z + b.h / 2) * by[2];
    const lo = Math.min(...parts.map(along)), hi = Math.max(...parts.map(along));
    const step = by[0] ** 2 + by[1] ** 2 + by[2] ** 2;
    const end = look(shift(by));
    for (const part of parts) {
      const a = along(part);
      const first = a - lo < 0.25 * step, last = hi - a < 0.25 * step;
      const keys: Key[] = [{ at: 0, look: look({ o: first ? 0 : 1 }), ease: LINEAR }];
      if (first) keys.push({ at: 0.3 * SLIDE, look: look(shift(by.map((v) => 0.3 * v) as [number, number, number])), ease: LINEAR });
      if (last) keys.push({ at: 0.7 * SLIDE, look: look(shift(by.map((v) => 0.7 * v) as [number, number, number])), ease: LINEAR });
      keys.push({ at: SLIDE, look: { ...end, o: last ? 0 : 1 }, ease: LINEAR });
      ambient.set(part.name, { origin: { x: 0, y: 0 }, period: SLIDE, delay: after, repeat: true, keys });
    }
  }
  // bob: out to the move, a beat there, and back, like a press coming down or a
  // layer lifting off the one below
  // next to a belt it keeps the belt's time, so a press comes down once per step
  const BOB = m.slides.length ? SLIDE : 2.4;
  const bobbing = new Set<Track>();
  for (const mv of m.bobs) {
    const there = look(shift(mv.by));
    const track: Track = {
      origin: { x: 0, y: 0 }, period: BOB, delay: after, repeat: true,
      keys: [
        { at: 0, look: BASE, ease: IN_OUT },
        { at: BOB / 3, look: there, ease: LINEAR },
        { at: BOB * 0.54, look: there, ease: IN_OUT },
        { at: BOB * 0.875, look: BASE, ease: LINEAR },
        { at: BOB, look: BASE, ease: LINEAR },
      ],
    };
    bobbing.add(track);
    for (const part of partsOf(mv.target)) ambient.set(part.name, track);
  }
  // whatever sits on something sliding or bobbing goes with it
  const moved = new Set([...m.slides, ...m.bobs].flatMap((mv) => partsOf(mv.target).map((p) => p.name)));
  for (let pass = 0; pass < 4; pass++) {
    for (const b of solids) {
      if (ambient.has(b.name) || isIcon.has(b.name)) continue;
      const under = solids.find((s) => s !== b && moved.has(s.name) && restsOn(b, s));
      if (!under) continue;
      ambient.set(b.name, ambient.get(under.name)!);
      carrier.set(b.name, under.name);
      moved.add(b.name);
    }
  }
  // blink: a light going off and on; the parts of a grid or stack take turns, so a
  // row of lights runs
  for (const name of m.blinks) {
    const parts = partsOf(name);
    const index = staggerIndex(parts);
    const period = Math.max(1.2, 0.18 * parts.length);
    for (const part of parts) {
      ambient.set(part.name, {
        origin: { x: 0, y: 0 }, period, delay: after + 0.18 * index.get(part.name)!, repeat: true,
        keys: [
          { at: 0, look: BASE, ease: LINEAR },
          { at: 0.45 * period, look: BASE, ease: LINEAR },
          { at: 0.5 * period, look: look({ o: 0.2 }), ease: LINEAR },
          { at: 0.9 * period, look: look({ o: 0.2 }), ease: LINEAR },
          { at: 0.95 * period, look: BASE, ease: LINEAR },
          { at: period, look: BASE, ease: LINEAR },
        ],
      });
    }
  }
  // ripple: rings spreading out over the top and fading, three at a time, like a
  // signal going out. svg.ts draws the rings; each has its own track
  const RIPPLE = 2.4;
  for (const name of m.ripples) {
    const top = bounds(partsOf(name));
    const origin = to({ x: top.x + top.w / 2, y: top.y + top.d / 2, z: top.z + top.h });
    for (let k = 0; k < 3; k++) {
      ambient.set(`${name}~ripple${k}`, {
        origin, period: RIPPLE, delay: after + (k * RIPPLE) / 3, repeat: true,
        keys: [
          { at: 0, look: look({ s: 0.35, o: 0 }), ease: LINEAR },
          { at: 0.2 * RIPPLE, look: look({ s: 0.7, o: 0.9 }), ease: EASE_OUT },
          { at: RIPPLE, look: look({ s: 1.6, o: 0 }), ease: LINEAR },
        ],
      });
    }
  }
  // icons bob and swell with what they are printed on
  for (const g of iconBoxes) {
    let c = carrier.get(g.name), seen = 0;
    while (c && !ambient.has(c) && carrier.has(c) && seen++ < 20) c = carrier.get(c);
    if (c && ambient.has(c) && !ambient.has(g.name)) ambient.set(g.name, ambient.get(c)!);
  }
  const flows = new Map<string, Track>();
  for (const name of m.flows) {
    flows.set(name, {
      origin: { x: 0, y: 0 }, period: 0.8, delay: 0, repeat: true,
      keys: [{ at: 0, look: BASE, ease: LINEAR }, { at: 0.8, look: look({ dash: -DASH_CYCLE }), ease: LINEAR }],
    });
  }

  const rides = new Map<number, Track>();
  scene.tags.forEach((t, i) => {
    const track = partsOf(t.target).map((p) => ambient.get(p.name)).find((tr) => tr && bobbing.has(tr));
    if (track) rides.set(i, track);
  });

  return { loop: m.loop, settled, enter, ambient, tags, links, arrows, flows, rides };
}

// keys at the same moment: the later one wins, so a jump stays a jump
function dedupe(keys: Key[]): Key[] {
  const out: Key[] = [];
  for (const k of keys) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.at - k.at) < 1e-9) out[out.length - 1] = k;
    else out.push(k);
  }
  return out;
}

// css cubic-bezier: find the curve parameter for this x, then its y
function bezier([x1, y1, x2, y2]: Key["ease"], x: number): number {
  const at = (a: number, b: number, t: number) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t * t + t ** 3;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (at(x1, x2, mid) < x) lo = mid;
    else hi = mid;
  }
  return at(y1, y2, (lo + hi) / 2);
}

/** A track's look at a moment, the way the browser would play it. */
export function lookAt(track: Track, time: number): Look {
  let t = time - track.delay;
  if (t < 0) t = 0;
  if (track.repeat) t = ((t % track.period) + track.period) % track.period;
  else t = Math.min(t, track.period);
  const keys = track.keys;
  if (t <= keys[0]!.at) return keys[0]!.look;
  for (let i = 0; i + 1 < keys.length; i++) {
    const a = keys[i]!, b = keys[i + 1]!;
    if (t >= a.at && t <= b.at) {
      const p = b.at > a.at ? bezier(a.ease, (t - a.at) / (b.at - a.at)) : 1;
      const mix = (u: number, v: number) => u + (v - u) * p;
      return { tx: mix(a.look.tx, b.look.tx), ty: mix(a.look.ty, b.look.ty), s: mix(a.look.s, b.look.s), o: mix(a.look.o, b.look.o), dash: mix(a.look.dash, b.look.dash) };
    }
  }
  return keys[keys.length - 1]!.look;
}
