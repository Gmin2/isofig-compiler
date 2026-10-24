import { ParseError, type Stmt } from "./parse.ts";
import { findGlyph } from "./icons.ts";
import { TINTS } from "./style.ts";
import { ADVANCE, glyphRings, hasGlyph, SHAPES, shapeRings, type ShapeKind } from "./shapes.ts";
import type { Box, FaceId } from "./iso.ts";

// fixed when the figure asked for a side; otherwise the label may move to the other row
export type Tag = { target: string; text: string; side: "above" | "below"; fixed: boolean };
export type Link = { from: string; to: string; dashed: boolean; mode: "centre" | "corners" };
export type Bracket = { target: string };
// route is set when the compiler worked out the path from named solids, ends
// holds those solids: they never hide the arrow, anything else in front of it does
export type Arrow = {
  name: string; from: [number, number, number]; to: [number, number, number]; dashed: boolean; accent?: boolean;
  route?: boolean; ends?: string[];
};
// a dot sits on a solid's top, or at a point of its own, the way a chart marks
// the joints of a line
// a line between two points in space, sorted in depth like a solid so it passes
// in front of what it is in front of and behind what is behind it
export type Rule = { name: string; from: [number, number, number]; to: [number, number, number]; dashed: boolean; stroke: string; on?: string; line?: number;
  // a point it bends through on the way, drawn as one line with a joint
  via?: [number, number, number] };

// a flat outline lying at one height, each corner rounded by its own radius. a
// circuit board or a sticker is this: no walls, only its outline at a level.
// axis says which plane it lies in: z flat at a height, y upright facing the
// front, x upright facing the side. arc rounds its corners with true circular
// arcs of seg points a quarter, as a rounded rectangle would be.
export type Plate = {
  name: string; z: number; pts: [number, number][]; round: number[]; fill: string; stroke: string;
  axis: "x" | "y" | "z"; arc?: number;
  // turned about an upright line like a solid can be, and kept with a named solid
  // so it is drawn straight after it instead of sorted on its own
  turn?: number; pivot?: [number, number]; on?: string;
  // pushed up this far from z into a slab of that outline
  h?: number; over?: string[];
  // leaned about the level line through hinge (y, z), as a card leans back in a file
  tilt?: number; hinge?: [number, number];
  // where it was written, so things kept with one solid are drawn in that order
  line?: number;
  // points along each rounded corner, and for a slab an outline inset inside it
  // whose near run is the soft rim
  n?: number; inner?: { pts: [number, number][]; round: number[] };
};

// a tube swept along a path of points, its outline offset from the path as drawn
// and its ends closed like the cut end of an upright pipe
export type Tube = { name: string; r: number; pts: [number, number, number][]; hi: boolean; over?: string[]; round?: boolean; edge?: string };

// a parabolic dish hung from a pivot, aimed by az round the vertical and el up
// from level: the bowl, its lip, two rings on the inside, struts to a feed horn
export type Dish = { name: string; at: [number, number, number]; r: number; focus: number; skin: number; az: number; el: number; hi: boolean; over?: string[] };

// a rod with rounded ends, thick r0 at from and r1 at to, like an antenna. band
// draws a ring round it that far along, inset from its outline
export type Rod = {
  name: string; from: [number, number, number]; to: [number, number, number]; r0: number; r1: number;
  band?: number; inset: number; hi: boolean; over?: string[]; edge?: string;
};

// a mark drawn in a face's own frame, the way a label is printed on a box: the
// top runs u along x and v along y from its back corner; the front left face u
// along x and v down from its top left; the right face u back along y and v down
export type Decal = {
  name: string; target: string; face: "top" | "left" | "right"; kind: string; nums: number[]; text?: string;
  look: string; size?: number; anchor?: string; weight?: string; line: number;
  // the frame's own origin, for a decal on a plane of its own rather than a face's corner
  at?: [number, number, number];
};
// words standing upright on the page at a point in space, nudged by dx, dy pixels
export type Label = {
  name: string; at: [number, number, number]; text: string; dx: number; dy: number; size?: number; look: string;
  anchor?: string; weight?: string; on?: string; line: number;
  // what stands at the point: words, a path in page units, or a level ring of radius r
  shape?: "text" | "path" | "ring" | "rect" | "line" | "circle"; r?: number; nums?: number[]; over?: string[];
  // set off from its point by this much and turned this far, before anything else
  off?: [number, number]; rot?: number;
};
// a line through any number of points, drawn as one
export type Wire = { name: string; pts: [number, number, number][]; look: string; on?: string; line: number };
// a value keyed in time, smil style: over dur seconds from begin, repeating; values
// at times (fractions of dur), stepped or eased straight between. path tracks move
// their targets along a path by how far along it points says they are
export type Track = {
  targets: string[]; attr: "opacity" | "path" | "turn" | "shift" | "tail"; values: number[][]; times: number[]; dur: number; begin: number;
  discrete: boolean; path?: [number, number, number][]; about?: [number, number, number]; axis?: "x" | "y" | "z"; base?: number[];
  // each step eased by this cubic, as smil's keySplines
  spline?: [number, number, number, number];
};

export type Dot = { target: string; at?: [number, number, number]; r?: number; hollow?: boolean; accent?: boolean; fill?: string; on?: string; line?: number; look?: string; name?: string };
export type Cyl = { name: string; x: number; y: number; z: number; r: number; h: number; axis: "x" | "y" | "z"; accent?: boolean; tint?: string | undefined };

/**
 * A solid that tapers to a point: a cone on its base, or an arrowhead when it is
 * sat on the end of a line. The language had no tapered form at all before this,
 * which is why a rising arrow could only ever be a flat tick on a stick.
 *
 * `cap` leaves the tip blunt, so the same line also draws a funnel or a frustum.
 */
export type Cone = { name: string; x: number; y: number; z: number; r: number; h: number; axis: "x" | "y" | "z"; cap: number; accent?: boolean; tint?: string | undefined };
export type Hole = { target: string; face: "left" | "right" | "top"; r: number; sides: number };

/**
 * Something drawn on one face of a solid, in that face's own 0 to 1 coordinates.
 *
 * This is what makes a solid read as an object rather than a block. A vault is a
 * rounded box until it has a recessed door, a dial and a keypad on it; a card is
 * a thin slab until it has a chip and its number lines. Placing those needs a
 * position on a surface, which nothing in the language could say before: `pattern`
 * covers a whole face and `icon` stamps one glyph in the middle of it.
 */
// How a mark is painted: a fill and a stroke, each a named tone the style
// resolves, and an optional line weight in scene units.
export type Look = { fill: string; stroke: string; weight?: number; opacity?: number };

type At = { target: string; face: FaceId; look: Look };

// Every number on a mark is in scene units measured from the face's own corner,
// the same units as everything else in the language. Fractions of the face were
// tried first and turned every circle on a non-square face into an ellipse.
export type Mark =
  | ({ kind: "inset"; d: number; r: number } & At)
  | ({ kind: "rect"; u: number; v: number; w: number; h: number; r: number; n: number; step: number } & At)
  | ({ kind: "bar"; u: number; v: number; w: number; h: number; r: number; n: number; step: number } & At)
  // `spokes` puts ticks round it, which is the difference between a circle and a dial
  | ({ kind: "disc"; u: number; v: number; r: number; spokes: number; hub: number } & At)
  | ({ kind: "ticks"; u: number; v: number; r: number; hub: number; n: number; turn: number } & At)
  | ({ kind: "cells"; u: number; v: number; nx: number; ny: number; size: number; gap: number; r: number } & At)
  | ({ kind: "line"; u: number; v: number; u2: number; v2: number; n: number; step: number } & At)
  | ({ kind: "arc"; u: number; v: number; r: number; from: number; to: number; n: number; step: number } & At)
  // an annulus, which a circle with a hole in it cannot be made from two discs
  // because the inner one would have to be painted in the face colour and would
  // then be wrong on every tinted solid
  | ({ kind: "ring"; u: number; v: number; r: number; inner: number } & At)
  | ({ kind: "tri"; u: number; v: number; r: number; turn: number } & At);
export type Pattern = { target: string; n: number; cells: number[] };
export type Ring = { target: string; r: number; n: number; accentAt: number[] };
// a drawing that stands in the scene. size is its height in scene units
export type Icon = { name: string; glyph: string; x: number; y: number; z: number; size: number };
// motion, in the order the figure gives it. entrances play one step after
// another unless together; float, pulse and flow run once the entrances are done
export type Entrance = {
  target: string; how: "drop" | "rise" | "pop" | "fade"; from?: string | undefined; stagger: number; together: boolean;
  line: number; text: string;
};
// slide and bob carry a move in scene units: slide goes one step and starts over,
// which along a row of the same thing reads as a belt that never stops; bob goes
// there and comes back
export type Move = { target: string; by: [number, number, number] };
// what a solid does while the pointer is on it: rises, slides out, or lights up
export type Hover = { target: string; kind: "lift" | "open" | "glow"; by: [number, number, number] };
export type Motion = {
  entrances: Entrance[]; floats: string[]; pulses: string[]; flows: string[];
  slides: Move[]; bobs: Move[]; blinks: string[]; ripples: string[]; hovers: Hover[];
  loop: boolean; hold: number;
};

export type Scene = {
  boxes: Box[];
  cyls: Cyl[];
  cones: Cone[];
  dishes: Dish[];
  rods: Rod[];
  decals: Decal[];
  labels: Label[];
  wires: Wire[];
  tracks: Track[];
  tubes: Tube[];
  rules: Rule[];
  plates: Plate[];
  // where the figure stands, when it says so; otherwise under its footprint
  ground?: { x: number; y: number; r: number };
  holes: Hole[];
  patterns: Pattern[];
  marks: Mark[];
  rings: Ring[];
  icons: Icon[];
  tags: Tag[];
  links: Link[];
  brackets: Bracket[];
  arrows: Arrow[];
  dots: Dot[];
  motion: Motion;
  // what the compiler had to leave out to draw the figure at all
  notes: string[];
};

export type BuildOptions = {
  // draw what can be drawn and say what was left out, instead of refusing the figure
  lenient?: boolean;
};

const DIRS: Record<string, [number, number]> = {
  "+x": [1, 0], "-x": [-1, 0], "+y": [0, 1], "-y": [0, -1],
};

function num(s: Stmt, i: number, what: string): number {
  const v = s.nums[i];
  if (v === undefined) throw new ParseError(`${s.kind} needs ${what}`, s.line, s.text);
  return v;
}

function ref(byName: Map<string, Box>, name: string, s: Stmt): Box {
  const b = byName.get(name);
  if (!b) throw new ParseError(`"${name}" is not defined yet`, s.line, s.text);
  return b;
}

function triple(s: Stmt, key: string): [number, number, number] {
  const v = (s.opts[key] ?? "").split(",").map(Number);
  if (v.length !== 3 || v.some(isNaN)) throw new ParseError(`${key} wants three numbers like ${key}=1,2,0`, s.line, s.text);
  return [v[0]!, v[1]!, v[2]!];
}

function radius(s: Stmt, size: [number, number, number]): number | undefined {
  if (s.opts.r === undefined) return undefined;
  const r = Number(s.opts.r);
  if (!(r >= 0)) throw new ParseError(`r wants a number, got "${s.opts.r}"`, s.line, s.text);
  // the corners round the face the solid is pushed out from: its footprint, or
  // for one standing up, the upright face across its axis
  const ax = s.opts.axis;
  const [a, c] = ax === "y" ? [size[0], size[2]] : ax === "x" ? [size[1], size[2]] : [size[0], size[1]];
  return Math.min(r, a / 2, c / 2) || undefined;
}

const SIZES: Record<string, number> = { box: 3, slab: 3, tray: 3, stack: 3, grid: 1, cyl: 0, cone: 0, icon: 0, shape: 3, word: 0 };

// every solid takes exactly one of: at, on, beside. float lifts it afterwards.
function place(s: Stmt, size: [number, number, number], byName: Map<string, Box>): [number, number, number] {
  const [w, d] = size;
  const gap = Number(s.opts.gap ?? 0);
  let pos: [number, number, number];

  if (s.words.includes("at") || s.nums.length >= 6) {
    // the position comes after the numbers each kind takes: a box its three
    // sizes, a grid its cell size, a cylinder none
    const base = SIZES[s.kind] ?? 3;
    if (s.nums.length !== base + 3) {
      throw new ParseError(`${s.kind} ${s.name} needs ${base ? `${base} size number${base > 1 ? "s" : ""} and ` : ""}a position: at x y z`, s.line, s.text);
    }
    pos = [num(s, base, "x y z"), num(s, base + 1, "x y z"), num(s, base + 2, "x y z")];
  } else if (s.opts.on) {
    const a = ref(byName, s.opts.on, s);
    pos = [a.x + (a.w - w) / 2, a.y + (a.d - d) / 2, a.z + a.h + gap];
  } else if (s.opts.beside) {
    const a = ref(byName, s.opts.beside, s);
    const dirWord = s.words.find((x) => x in DIRS) ?? "+x";
    const [dx, dy] = DIRS[dirWord]!;
    pos = [
      a.x + (dx > 0 ? a.w + gap : dx < 0 ? -(w + gap) : (a.w - w) / 2),
      a.y + (dy > 0 ? a.d + gap : dy < 0 ? -(d + gap) : (a.d - d) / 2),
      a.z,
    ];
  } else {
    throw new ParseError(`${s.kind} ${s.name} needs a placement: at x y z, on=NAME, or beside=NAME`, s.line, s.text);
  }

  if (s.opts.float) pos[2] += Number(s.opts.float);
  return pos;
}

type Shape = { name: string; x: number; y: number; z: number; w: number; d: number; h: number; r: number };

// arrows keep this far from what they join, and need at least this much left to read as an arrow
const ARROW_GAP = 0.3;
const ARROW_MIN = 0.5;
// an arrow with one open end, leaving a solid or coming in to one, is this long
const ARROW_OPEN = 2;
const SIDES: Record<string, [number, number, number]> = {
  "+x": [1, 0, 0], "-x": [-1, 0, 0], "+y": [0, 1, 0], "-y": [0, -1, 0], "+z": [0, 0, 1], "-z": [0, 0, -1],
};

/**
 * The end of an arrow on one side of a solid: level with its middle for x and
 * y, over the centre of its top or bottom for z, a gap out from the surface.
 */
function sideOf(a: Shape, side: [number, number, number]): [number, number, number] {
  const cx = a.x + a.w / 2, cy = a.y + a.d / 2;
  if (side[2]) return [cx, cy, side[2] > 0 ? a.z + a.h + ARROW_GAP : a.z - ARROW_GAP];
  const far: [number, number] = [cx + side[0] * (a.w + a.d), cy + side[1] * (a.w + a.d)];
  const t = edgeAt(a, [cx, cy], far, true);
  const len = a.w + a.d;
  return [cx + side[0] * (t * len + ARROW_GAP), cy + side[1] * (t * len + ARROW_GAP), a.z + a.h / 2];
}

// is (x, y) inside the shape's footprint, rounded corners and discs included
function inFootprint(s: Shape, x: number, y: number): boolean {
  const r = s.r;
  const qx = Math.abs(x - (s.x + s.w / 2)) - (s.w / 2 - r);
  const qy = Math.abs(y - (s.y + s.d / 2)) - (s.d / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r <= 1e-9;
}

// the t in [0, 1] where a segment crosses a footprint's edge, given which end is inside
function edgeAt(s: Shape, p: [number, number], q: [number, number], insideAtStart: boolean): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 50; i++) {
    const t = (lo + hi) / 2;
    const inside = inFootprint(s, p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t);
    if (inside === insideAtStart) lo = t;
    else hi = t;
  }
  return (lo + hi) / 2;
}

/**
 * The path of an arrow from one solid to another.
 *
 * Side by side, it runs through the gap between them, straight along x or y when
 * their footprints share a band, corner to corner otherwise, at the middle of the
 * height they share. One above the other, it runs straight up or down through
 * the footprint they share. Either way it stops short of both solids.
 */
function route(a: Shape, b: Shape, s: Stmt, lenient = false): [[number, number, number], [number, number, number]] | null {
  const noRoom = () => new ParseError(
    `arrow ${s.name}: ${a.name} and ${b.name} are too close for an arrow, move them apart or use link`, s.line, s.text);
  // too little room to read as an arrow: strictly that is a figure to redo, leniently it is
  // a figure drawn without that arrow
  const cramped = (): null => {
    if (!lenient) throw noRoom();
    return null;
  };
  const ox0 = Math.max(a.x, b.x), ox1 = Math.min(a.x + a.w, b.x + b.w);
  const oy0 = Math.max(a.y, b.y), oy1 = Math.min(a.y + a.d, b.y + b.d);
  const zlo = Math.max(a.z, b.z), zhi = Math.min(a.z + a.h, b.z + b.h);

  if (ox1 > ox0 && oy1 > oy0) {
    if (zhi > zlo) {
      if (!lenient) throw new ParseError(`arrow ${s.name}: ${a.name} and ${b.name} take up the same space, there is nowhere to draw it`, s.line, s.text);
      return null;
    }
    const cx = (ox0 + ox1) / 2, cy = (oy0 + oy1) / 2;
    const [z0, z1] = a.z >= b.z + b.h ? [a.z, b.z + b.h] : [a.z + a.h, b.z];
    const room = Math.abs(z1 - z0);
    if (room < ARROW_MIN) return cramped();
    const pad = Math.min(ARROW_GAP, (room - ARROW_MIN) / 2) * Math.sign(z1 - z0);
    return [[cx, cy, z0 + pad], [cx, cy, z1 - pad]];
  }

  const ca: [number, number] = [a.x + a.w / 2, a.y + a.d / 2];
  const cb: [number, number] = [b.x + b.w / 2, b.y + b.d / 2];
  let p = ca, q = cb;
  // a shared band is always inside both footprints along the centre line, rounded or not
  if (oy1 > oy0) {
    const y = (oy0 + oy1) / 2;
    p = [ca[0], y]; q = [cb[0], y];
  } else if (ox1 > ox0) {
    const x = (ox0 + ox1) / 2;
    p = [x, ca[1]]; q = [x, cb[1]];
  }
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const t0 = edgeAt(a, p, q, true);
  const t1 = edgeAt(b, p, q, false);
  const room = (t1 - t0) * len;
  if (room < ARROW_MIN) return cramped();
  const pad = Math.min(ARROW_GAP, (room - ARROW_MIN) / 2) / len;
  const ta = t0 + pad, tb = t1 - pad;
  // with a shared height the arrow is level; without one it slopes from the middle of one to the middle of the other
  const za = zhi > zlo ? (zlo + zhi) / 2 : a.z + a.h / 2;
  const zb = zhi > zlo ? (zlo + zhi) / 2 : b.z + b.h / 2;
  const at = (t: number): [number, number, number] =>
    [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, za + (zb - za) * (t - ta) / (tb - ta)];
  return [at(ta), at(tb)];
}

export function build(stmts: Stmt[], options: BuildOptions = {}): Scene {
  const boxes: Box[] = [];
  const tags: Tag[] = [];
  const links: Link[] = [];
  const brackets: Bracket[] = [];
  const arrows: Arrow[] = [];
  const notes: string[] = [];
  const dots: Dot[] = [];
  const cyls: Cyl[] = [];
  const cones: Cone[] = [];
  const rules: Rule[] = [];
  const plates: Plate[] = [];
  const dishes: Dish[] = [];
  const rods: Rod[] = [];
  const decals: Decal[] = [];
  const labels: Label[] = [];
  const wires: Wire[] = [];
  const tracks: Track[] = [];
  const tubes: Tube[] = [];
  let ground: { x: number; y: number; r: number } | undefined;
  const holes: Hole[] = [];
  const patterns: Pattern[] = [];
  const marks: Mark[] = [];
  const rings: Ring[] = [];
  const icons: Icon[] = [];
  const motion: Motion = { entrances: [], floats: [], pulses: [], flows: [], slides: [], bobs: [], blinks: [], ripples: [], hovers: [], loop: true, hold: 1.5 };
  let timelineSet = false;
  const byName = new Map<string, Box>();
  // a name motion can act on: a solid, or one part of a stack, grid or tray
  const solidName = (name: string, s: Stmt) => {
    if (arrows.some((a) => a.name === name)) throw new ParseError(`${s.kind} works on solids, ${name} is an arrow`, s.line, s.text);
    if (!byName.has(name)) throw new ParseError(`"${name}" is not defined yet`, s.line, s.text);
    return name;
  };

  // stacks whose layers step sideways; their bounds are mostly empty space
  const fanned = new Set<string>();

  // the room a named solid takes up, for routing arrows. a stack, grid or tray
  // is the bounds of all its parts; a stack only keeps its rounding when the
  // layers sit straight on each other, a cylinder standing up is a disc. a
  // fanned stack is the layer nearest to where the arrow comes from
  const shape = (name: string, s: Stmt, toward?: [number, number, number]): Shape => {
    const cyl = cyls.find((c) => c.name === name);
    if (cyl) {
      const b = ref(byName, name, s);
      return { name, x: b.x, y: b.y, z: b.z, w: b.w, d: b.d, h: b.h, r: cyl.axis === "z" ? cyl.r : 0 };
    }
    // a glyph standing in the scene is a thing an arrow can point at. it is not
    // an obstacle though: art does not get in the way of a line
    const glyph = icons.find((g) => g.name === name);
    if (glyph) {
      return { name, x: glyph.x, y: glyph.y, z: glyph.z, w: glyph.size, d: glyph.size, h: glyph.size, r: 0 };
    }
    let parts = boxes.filter((b) => b.name.startsWith(`${name}.`));
    if (toward && fanned.has(name) && parts.length) {
      const far = (b: Box) => Math.hypot(b.x + b.w / 2 - toward[0], b.y + b.d / 2 - toward[1], b.z + b.h / 2 - toward[2]);
      parts = [parts.reduce((m, b) => (far(b) < far(m) ? b : m))];
    }
    const own = boxes.find((b) => b.name === name);
    const all = own ? [own] : parts;
    if (!all.length) {
      if (arrows.some((a) => a.name === name)) throw new ParseError(`an arrow can only join solids, ${name} is an arrow`, s.line, s.text);
      ref(byName, name, s);
      throw new ParseError(`${name} is not a solid an arrow can join`, s.line, s.text);
    }
    const x = Math.min(...all.map((b) => b.x)), y = Math.min(...all.map((b) => b.y)), z = Math.min(...all.map((b) => b.z));
    const w = Math.max(...all.map((b) => b.x + b.w)) - x;
    const d = Math.max(...all.map((b) => b.y + b.d)) - y;
    const h = Math.max(...all.map((b) => b.z + b.h)) - z;
    const straight = all.every((b) => b.x === all[0]!.x && b.y === all[0]!.y && b.w === all[0]!.w && b.d === all[0]!.d);
    return { name, x, y, z, w, d, h, r: straight ? Math.min(all[0]!.r ?? 0, w / 2, d / 2) : 0 };
  };

  // how long an arrow with an open end can be, running from p along dir: its usual
  // length, or short of the first solid in the way. the solid it belongs to is not in the way
  const open = (p: [number, number, number], dir: [number, number, number], own: string, s: Stmt): number => {
    const k = dir.findIndex((v) => v !== 0);
    const others = [0, 1, 2].filter((i) => i !== k);
    let hit = Infinity;
    const solids = [...boxes, ...cyls.map((c) => byName.get(c.name)!)];
    for (const b of solids) {
      if (b.name === own || b.name.startsWith(`${own}.`)) continue;
      const lo = [b.x, b.y, b.z], hi = [b.x + b.w, b.y + b.d, b.z + b.h];
      if (!others.every((i) => p[i]! > lo[i]! + 1e-9 && p[i]! < hi[i]! - 1e-9)) continue;
      const ahead = dir[k]! > 0 ? lo[k]! - p[k]! : p[k]! - hi[k]!;
      if (ahead >= -1e-9) hit = Math.min(hit, ahead);
    }
    const len = Math.min(ARROW_OPEN, hit - ARROW_GAP);
    if (len < ARROW_MIN) {
      throw new ParseError(`arrow ${s.name}: no room for it next to ${own}, something is in the way`, s.line, s.text);
    }
    return len;
  };

  const add = (b: Box) => {
    if (boxes.some((o) => o.name === b.name)) throw new Error(`duplicate name "${b.name}"`);
    boxes.push(b);
    byName.set(b.name, b);
  };

  for (const s of stmts) {
    const accent = s.words.includes("accent");
    // a named colour for the face, which beats the accent colour
    const tint = s.opts.tint;
    if (tint !== undefined && !(TINTS as readonly string[]).includes(tint)) {
      throw new ParseError(`tint is one of ${TINTS.join(", ")}, not "${tint}"`, s.line, s.text);
    }
    const hidden = s.opts.hidden === "dashed" ? ("dashed" as const) : undefined;
    switch (s.kind) {
      case "shape": {
        const kind = s.words.find((w) => (SHAPES as readonly string[]).includes(w)) as ShapeKind | undefined;
        if (!kind) throw new ParseError(`shape needs a kind, one of ${SHAPES.join(", ")}`, s.line, s.text);
        const size: [number, number, number] = [num(s, 0, "width depth height"), num(s, 1, "width depth height"), num(s, 2, "width depth height")];
        const along = (s.opts.axis ?? "z") as "x" | "y" | "z";
        if (!["x", "y", "z"].includes(along)) throw new ParseError("axis is x, y or z", s.line, s.text);
        const [x, y, z] = place(s, size, byName);
        // the outline lies in the plane across `along`, and points along that plane's own axes
        const [W, V] = along === "z" ? [size[0], size[1]] : along === "y" ? [size[0], size[2]] : [size[1], size[2]];
        const dir = String(s.opts.point ?? "");
        const flat: Record<string, "+u" | "-u" | "+v" | "-v"> = along === "x"
          ? { "+y": "+u", "-y": "-u", "+x": "+v", "-x": "-v" }
          : { "+x": "+u", "-x": "-u", "+y": "+v", "-y": "-v" };
        add({ name: s.name, x, y, z, w: size[0], d: size[1], h: size[2], accent, tint, hidden, r: radius(s, size),
          outline: { rings: shapeRings(kind, W, V, flat[dir]), along } });
        break;
      }
      case "word": {
        const text = (s.words.find((w) => w !== "at" && w !== "accent" && !(w in DIRS)) ?? "").toUpperCase();
        if (!text) throw new ParseError('word needs its text in quotes, like word sign "OPEN" size=1 at 0 0 0', s.line, s.text);
        const cap = Number(s.opts.size ?? 1), deep = Number(s.opts.deep ?? 0.25 * cap);
        if (!(cap > 0 && cap <= 20) || !(deep > 0 && deep <= 20)) throw new ParseError("size and deep are scene units, above 0 and up to 20", s.line, s.text);
        const along = (s.opts.axis ?? "y") as "x" | "y" | "z";
        if (!["x", "y", "z"].includes(along)) throw new ParseError("axis is x, y or z", s.line, s.text);
        const step = ADVANCE * cap, span = text.length * step - (step - (4 / 6) * cap);
        // standing, a word reads along x with its face to the front; lying, it reads along x from above;
        // turned, it reads along y
        const size: [number, number, number] = along === "y" ? [span, deep, cap] : along === "z" ? [span, cap, deep] : [deep, span, cap];
        const [x, y, z] = place(s, size, byName);
        const missing = [...new Set([...text].filter((c) => !hasGlyph(c)))];
        if (missing.length) notes.push(`word ${s.name}: no letter for ${missing.join(" ")}, so it is left out`);
        [...text].forEach((ch, k) => {
          const rings = glyphRings(ch, cap);
          if (!rings) return;
          const us = rings.flat().map((q) => q[0]), vs = rings.flat().map((q) => q[1]);
          const u0 = Math.min(...us), v0 = Math.min(...vs), lw = Math.max(...us) - u0, lh = Math.max(...vs) - v0;
          // lying flat, a letter's top points away from us, or it reads in a mirror
          // standing across x, a word reads toward -y, so letters run from the far end and turn round
          const own = rings.map((r) => along === "z"
            ? r.map(([u, v]) => [u - u0, lh - (v - v0)] as [number, number]).reverse()
            : along === "x"
              ? r.map(([u, v]) => [lw - (u - u0), v - v0] as [number, number]).reverse()
              : r.map(([u, v]) => [u - u0, v - v0] as [number, number]));
          const at = k * step + u0;
          const part = along === "y" ? { x: x + at, y, z: z + v0, w: lw, d: deep, h: lh }
            : along === "z" ? { x: x + at, y: y + v0, z, w: lw, d: lh, h: deep }
            : { x, y: y + span - at - lw, z: z + v0, w: deep, d: lw, h: lh };
          add({ name: `${s.name}.${k}`, ...part, accent, tint, hidden, outline: { rings: own, along } });
        });
        byName.set(s.name, { name: s.name, x, y, z, w: size[0], d: size[1], h: size[2] });
        break;
      }
      case "box":
      case "slab": {
        const size: [number, number, number] = [
          num(s, 0, "width depth height"), num(s, 1, "width depth height"), num(s, 2, "width depth height"),
        ];
        const [x, y, z] = place(s, size, byName);
        add({ name: s.name, x, y, z, w: size[0], d: size[1], h: size[2], accent, tint, hidden, r: radius(s, size),
          ...(s.opts.rim === undefined ? {} : { rim: Number(s.opts.rim) }), ...(s.words.includes("hi") ? { hi: true } : {}),
          ...(s.opts.taper === undefined ? {} : { taper: Number(s.opts.taper) }),
          ...(s.opts.topr === undefined ? {} : { topr: Number(s.opts.topr) }),
          ...(s.opts.rimr === undefined ? {} : { rimr: Number(s.opts.rimr) }),
          ...(s.opts.reflect === undefined ? {} : { reflect: Number(s.opts.reflect) }),
          ...(s.opts.seg === undefined ? {} : { seg: Number(s.opts.seg) }),
          ...(s.opts.axis === "x" || s.opts.axis === "y" ? { axis: s.opts.axis } : {}),
          ...(s.opts.turn === undefined ? {} : { turn: Number(s.opts.turn) }),
          ...(s.opts.pivot === undefined ? {} : { pivot: String(s.opts.pivot).split(",").map(Number) as [number, number] }),
          ...(s.words.includes("cap") ? { cap: true } : {}),
          ...(s.opts.tilt === undefined ? {} : { tilt: Number(s.opts.tilt) }),
          ...(s.opts.hinge === undefined ? {} : { hinge: String(s.opts.hinge).split(",").map(Number) as [number, number] }),
          ...(s.opts.roll === undefined ? {} : { roll: Number(s.opts.roll) }),
          ...(s.opts.axle === undefined ? {} : { axle: String(s.opts.axle).split(",").map(Number) as [number, number] }),
          ...(s.opts.cut === undefined ? {} : { cut: String(s.opts.cut).split(",").map(Number) as [number, number] }),
          ...(s.opts.over === undefined ? {} : { over: String(s.opts.over).split(",") }),
          ...(s.opts.edge === undefined ? {} : { edge: String(s.opts.edge) }),
          ...(s.opts.look === undefined ? {} : { look: String(s.opts.look) }),
          ...(s.words.includes("open") ? { open: true } : {}),
          ...(s.opts.floor === undefined ? {} : { floor: Number(s.opts.floor) }),
          ...(s.opts.topsize === undefined ? {} : { topsize: String(s.opts.topsize).split(",").map(Number) as [number, number] }) });
        break;
      }
      case "tray": {
        // floor plus four walls, each a solid in its own right so depth sorting
        // handles the near wall sitting in front of what is inside
        const [w, d, h] = [num(s, 0, "w d h"), num(s, 1, "w d h"), num(s, 2, "w d h")];
        const wall = Number(s.opts.wall ?? 0.3);
        const [x, y, z] = place(s, [w, d, h], byName);
        add({ name: `${s.name}.floor`, x, y, z, w, d, h: wall, accent, tint, hidden });
        add({ name: `${s.name}.wx0`, x, y, z: z + wall, w: wall, d, h: h - wall, accent, tint });
        add({ name: `${s.name}.wx1`, x: x + w - wall, y, z: z + wall, w: wall, d, h: h - wall, accent, tint });
        add({ name: `${s.name}.wy0`, x: x + wall, y, z: z + wall, w: w - 2 * wall, d: wall, h: h - wall, accent, tint });
        add({ name: `${s.name}.wy1`, x: x + wall, y: y + d - wall, z: z + wall, w: w - 2 * wall, d: wall, h: h - wall, accent, tint });
        byName.set(s.name, { name: s.name, x, y, z, w, d, h });
        break;
      }
      case "stack": {
        const size: [number, number, number] = [num(s, 0, "w d h"), num(s, 1, "w d h"), num(s, 2, "w d h")];
        const n = Number(s.opts.n ?? 3);
        const gap = Number(s.opts.gap ?? 0);
        const [sx, sy] = (s.opts.step ?? "0,0").split(",").map(Number);
        const accentAt = s.opts.accent ? Number(s.opts.accent) : -1;
        const [x, y, z] = place(s, size, byName);
        if (sx || sy) fanned.add(s.name);
        for (let i = 0; i < n; i++) {
          add({
            name: `${s.name}.${i}`,
            x: x + i * (sx ?? 0), y: y + i * (sy ?? 0), z: z + i * (size[2] + gap),
            w: size[0], d: size[1], h: size[2], r: radius(s, size),
            accent: accentAt === i || (accent && accentAt < 0),
            tint,
          });
        }
        byName.set(s.name, { name: s.name, x, y, z, w: size[0], d: size[1], h: n * size[2] + (n - 1) * gap });
        break;
      }
      case "grid": {
        const cell = num(s, 0, "cell size");
        const [nx, ny, nz] = (s.opts.n ?? "3,3,3").split(",").map(Number) as [number, number, number];
        const pitch = Number(s.opts.pitch ?? cell);
        // a cell is a cube unless it is given a height, which is what turns a
        // grid of studs into a row of columns holding something up
        const tall = Number(s.opts.h ?? cell);
        // a foot and a capital, so a column reads as carrying the thing above it.
        // they are wider than the shaft and may carry their own tint.
        const cap = Number(s.opts.cap ?? 0);
        const capw = Number(s.opts.capw ?? cell + cap * 0.7);
        const captint = s.opts.captint;
        if (captint !== undefined && !(TINTS as readonly string[]).includes(captint)) {
          throw new ParseError(`captint is one of ${TINTS.join(", ")}, not "${captint}"`, s.line, s.text);
        }
        const round = s.opts.shape === "cyl";
        // the room the cells really take: n cells, and the gaps between them, not after the last
        const span = (n: number) => (n - 1) * pitch + cell;
        const [x, y, z] = place(s, [span(nx), span(ny), (nz - 1) * pitch + tall], byName);
        for (let i = 0; i < nx; i++)
          for (let j = 0; j < ny; j++)
            for (let k = 0; k < nz; k++) {
              const cx = x + i * pitch, cy = y + j * pitch, cz = z + k * pitch;
              const name = `${s.name}.${i}${j}${k}`;
              if (round) {
                // a round column, between its foot and its capital
                const h = tall - 2 * cap;
                cyls.push({ name, x: cx, y: cy, z: cz + cap, r: cell / 2, h, axis: "z", accent, tint });
                byName.set(name, { name, x: cx, y: cy, z: cz + cap, w: cell, d: cell, h });
              } else {
                add({ name, x: cx, y: cy, z: cz, w: cell, d: cell, h: tall, r: Number(s.opts.r ?? 0) });
              }
            }
        if (cap > 0) {
          const off = (capw - cell) / 2;
          for (let i = 0; i < nx; i++)
            for (let j = 0; j < ny; j++)
              for (const [tag, at] of [["foot", z], ["cap", z + tall - cap]] as const)
                add({
                  name: `${s.name}.${tag}${i}${j}`,
                  x: x + i * pitch - off, y: y + j * pitch - off, z: at,
                  w: capw, d: capw, h: cap, r: Number(s.opts.capr ?? 0), tint: captint,
                });
        }
        byName.set(s.name, { name: s.name, x, y, z, w: span(nx), d: span(ny), h: (nz - 1) * pitch + tall });
        break;
      }
      case "tag": {
        if (!arrows.some((a) => a.name === s.name)) ref(byName, s.name, s);
        const text = s.words.find((w) => !["accent", "above", "below"].includes(w));
        if (!text) throw new ParseError("tag needs text in quotes", s.line, s.text);
        tags.push({
          target: s.name, text, side: s.words.includes("below") ? "below" : "above",
          fixed: s.words.includes("below") || s.words.includes("above"),
        });
        break;
      }
      case "link": {
        ref(byName, s.name, s);
        const to = s.words.find((w) => byName.has(w));
        if (!to) throw new ParseError(`link needs a second name, none of "${s.words.join(" ")}" is defined`, s.line, s.text);
        links.push({
          from: s.name, to,
          dashed: s.words.includes("dashed"),
          mode: s.words.includes("corners") ? "corners" : "centre",
        });
        break;
      }
      case "brackets": {
        ref(byName, s.name, s);
        brackets.push({ target: s.name });
        break;
      }
      case "arrow": {
        // each end is a solid's name, a side like +x, or a point
        const kind = (v = "") => (/^[A-Za-z]/.test(v) ? "name" : v in SIDES ? "side" : "point");
        const [k0, k1] = [kind(s.opts.from), kind(s.opts.to)];
        let from: [number, number, number], to: [number, number, number];
        if (k0 === "point" && k1 === "point") {
          [from, to] = [triple(s, "from"), triple(s, "to")];
        } else if (k0 === "name" && k1 === "name") {
          if (s.opts.from === s.opts.to) throw new ParseError(`arrow ${s.name} goes from ${s.opts.from} to itself`, s.line, s.text);
          const mid = (x: Shape): [number, number, number] => [x.x + x.w / 2, x.y + x.d / 2, x.z + x.h / 2];
          const a0 = shape(s.opts.from!, s), b0 = shape(s.opts.to!, s);
          const path = route(shape(s.opts.from!, s, mid(b0)), shape(s.opts.to!, s, mid(a0)), s, options.lenient);
          if (!path) {
            notes.push(`arrow ${s.name}: there is no room between ${s.opts.from} and ${s.opts.to}, so it is left out`);
            break;
          }
          [from, to] = path;
        } else if (k0 === "name" && k1 === "side") {
          // leaving a solid towards a side
          const dir = SIDES[s.opts.to!]!;
          from = sideOf(shape(s.opts.from!, s), dir);
          const len = open(from, dir, s.opts.from!, s);
          to = [0, 1, 2].map((i) => from[i]! + dir[i]! * len) as [number, number, number];
        } else if (k0 === "side" && k1 === "name") {
          // coming in to a solid from a side
          const dir = SIDES[s.opts.from!]!;
          to = sideOf(shape(s.opts.to!, s), dir);
          const len = open(to, dir, s.opts.to!, s);
          from = [0, 1, 2].map((i) => to[i]! + dir[i]! * len) as [number, number, number];
        } else {
          throw new ParseError(
            "arrow ends are two names (from=a to=b), a name and a side (from=a to=+x, from=+z to=b), or two points (from=0,0,0 to=2,0,0)",
            s.line, s.text);
        }
        const ends = [s.opts.from, s.opts.to].filter((v) => kind(v) === "name") as string[];
        arrows.push({
          name: s.name, from, to, dashed: s.words.includes("dashed"), accent,
          ...(ends.length ? { route: true, ends } : {}),
        });
        break;
      }
      case "decal": {
        const [target, face] = String(s.opts.on ?? "").split(".");
        if (!target || !(face === "top" || face === "left" || face === "right")) throw new ParseError("decal wants on=NAME.top, NAME.left or NAME.right", s.line, s.text);
        decals.push({ name: s.name, target, face, kind: s.words[0] ?? "outline", nums: s.nums, ...(s.words[1] === undefined ? {} : { text: s.words[1] }),
          ...(s.opts.at === undefined ? {} : { at: s.opts.at.split(",").map(Number) as [number, number, number] }),
          look: s.opts.look ?? "lo", ...(s.opts.size === undefined ? {} : { size: Number(s.opts.size) }),
          ...(s.opts.anchor === undefined ? {} : { anchor: s.opts.anchor }), ...(s.opts.weight === undefined ? {} : { weight: s.opts.weight }), line: s.line });
        break;
      }
      case "label": {
        if (s.nums.length < 3) throw new ParseError("label wants a point: label NAME at x y z \"words\"", s.line, s.text);
        const ws = s.words.filter((w) => w !== "at"), kinds = ["path", "ring", "rect", "line", "circle"] as const;
        const shape = (kinds as readonly string[]).includes(ws[0] ?? "") ? (ws[0] as (typeof kinds)[number]) : "text";
        labels.push({ name: s.name, at: [s.nums[0]!, s.nums[1]!, s.nums[2]!], text: (shape === "text" ? ws[0] : ws[1]) ?? "", shape,
          ...(s.opts.r === undefined ? {} : { r: Number(s.opts.r) }), nums: s.nums.slice(3), dx: Number(s.opts.dx ?? 0), dy: Number(s.opts.dy ?? 0),
          ...(s.opts.size === undefined ? {} : { size: Number(s.opts.size) }), look: s.opts.look ?? "tx",
          ...(s.opts.anchor === undefined ? {} : { anchor: s.opts.anchor }), ...(s.opts.weight === undefined ? {} : { weight: s.opts.weight }),
          ...(s.opts.on === undefined ? {} : { on: s.opts.on }), ...(s.opts.over === undefined ? {} : { over: s.opts.over.split(",") }),
          ...(s.opts.off === undefined ? {} : { off: s.opts.off.split(",").map(Number) as [number, number] }),
          ...(s.opts.rot === undefined ? {} : { rot: Number(s.opts.rot) }), line: s.line });
        break;
      }
      case "wire": {
        const pts = String(s.opts.pts ?? "").split(";").filter(Boolean).map((q) => q.split(",").map(Number) as [number, number, number]);
        if (pts.length < 2) throw new ParseError("wire wants pts=x,y,z;x,y,z", s.line, s.text);
        wires.push({ name: s.name, pts, look: s.opts.look ?? "lo", ...(s.opts.on === undefined ? {} : { on: s.opts.on }), line: s.line });
        break;
      }
      case "track": {
        const list = (k: string) => String(s.opts[k] ?? "").split(";").filter((x) => x !== "");
        const attr = s.opts.path ? "path" : (s.opts.attr ?? "opacity") as Track["attr"];
        const values = list(attr === "path" ? "points" : "values").map((v) => v.split(",").map(Number));
        const times = list("times").map(Number);
        if (values.length !== times.length) throw new ParseError("track wants as many values as times", s.line, s.text);
        const pts = (k: string) => String(s.opts[k]).split(";").filter(Boolean).map((q) => q.split(",").map(Number) as [number, number, number]);
        tracks.push({ targets: s.name.split(","), attr, values, times, dur: Number(s.opts.dur ?? 1), begin: Number(s.opts.begin ?? 0),
          discrete: s.words.includes("discrete"), ...(s.opts.path ? { path: pts("path") } : {}),
          ...(s.opts.about ? { about: pts("about")[0]! } : {}), ...(s.opts.axis ? { axis: s.opts.axis as "x" | "y" | "z" } : {}),
          ...(s.opts.base ? { base: s.opts.base.split(",").map(Number) } : {}),
          ...(s.opts.spline ? { spline: s.opts.spline.split(",").map(Number) as [number, number, number, number] } : {}) });
        break;
      }
      case "tube": {
        const pts = String(s.opts.pts ?? "").split(";").filter(Boolean).map((q) => q.split(",").map(Number) as [number, number, number]);
        if (pts.length < 2 || pts.some((q) => q.length !== 3 || q.some(isNaN))) throw new ParseError("tube wants pts=x,y,z;x,y,z with two points or more", s.line, s.text);
        tubes.push({ name: s.name, r: Number(s.opts.r ?? 0.2), pts, hi: s.words.includes("hi"), ...(s.words.includes("round") ? { round: true } : {}),
          ...(s.opts.edge === undefined ? {} : { edge: String(s.opts.edge) }),
          ...(s.opts.over === undefined ? {} : { over: String(s.opts.over).split(",") }) });
        break;
      }
      case "rod": {
        rods.push({ name: s.name, from: triple(s, "from"), to: triple(s, "to"), r0: Number(s.opts.r0 ?? s.opts.r ?? 0.2),
          r1: Number(s.opts.r1 ?? s.opts.r ?? 0.2), ...(s.opts.band === undefined ? {} : { band: Number(s.opts.band) }),
          inset: Number(s.opts.inset ?? 0), hi: s.words.includes("hi"), ...(s.opts.edge === undefined ? {} : { edge: String(s.opts.edge) }),
          ...(s.opts.over === undefined ? {} : { over: String(s.opts.over).split(",") }) });
        break;
      }
      case "dish": {
        const [az, el] = String(s.opts.aim ?? "0,0").split(",").map(Number);
        dishes.push({ name: s.name, at: triple(s, "pivot"), r: Number(s.opts.r ?? 1), focus: Number(s.opts.focus ?? 1),
          skin: Number(s.opts.skin ?? 0), az: az ?? 0, el: el ?? 0, hi: s.words.includes("hi"),
          ...(s.opts.over === undefined ? {} : { over: String(s.opts.over).split(",") }) });
        break;
      }
      case "plate": {
        let pts = String(s.opts.pts ?? "").split(";").filter(Boolean).map((q) => q.split(",").map(Number) as [number, number]);
        let arc: number | undefined;
        if (s.opts.rect) {
          const [x0, y0, x1, y1] = String(s.opts.rect).split(",").map(Number) as [number, number, number, number];
          pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
          arc = Number(s.opts.seg ?? 4);
        }
        if (pts.length < 3 || pts.some((q) => q.length !== 2 || q.some(isNaN))) {
          throw new ParseError("plate wants pts=x,y;x,y;x,y with at least three corners", s.line, s.text);
        }
        const round = s.opts.round ? String(s.opts.round).split(",").map(Number) : pts.map(() => 0);
        if (arc !== undefined) round.splice(0, round.length, ...pts.map(() => Number(s.opts.r ?? 0)));
        const axis = s.opts.axis === "x" || s.opts.axis === "y" ? s.opts.axis : "z";
        plates.push({ name: s.name, z: Number(s.opts.z ?? s.opts.at ?? 0), pts, round, fill: s.opts.fill ?? "none", stroke: s.opts.stroke ?? "line",
          axis, ...(arc === undefined ? {} : { arc }),
          ...(s.opts.turn === undefined ? {} : { turn: Number(s.opts.turn) }),
          ...(s.opts.pivot === undefined ? {} : { pivot: String(s.opts.pivot).split(",").map(Number) as [number, number] }),
          ...(s.opts.on === undefined ? {} : { on: String(s.opts.on), line: s.line }),
          ...(s.opts.h === undefined ? {} : { h: Number(s.opts.h) }),
          ...(arc === undefined && s.opts.seg !== undefined ? { n: Number(s.opts.seg) } : {}),
          ...(s.opts.inner === undefined ? {} : { inner: {
            pts: String(s.opts.inner).split(";").filter(Boolean).map((q) => q.split(",").map(Number) as [number, number]),
            round: String(s.opts.innerround ?? "").split(",").filter(Boolean).map(Number) } }),
          ...(s.opts.tilt === undefined ? {} : { tilt: Number(s.opts.tilt) }),
          ...(s.opts.hinge === undefined ? {} : { hinge: String(s.opts.hinge).split(",").map(Number) as [number, number] }),
          ...(s.opts.over === undefined ? {} : { over: String(s.opts.over).split(",") }) });
        break;
      }
      case "rule": {
        rules.push({ name: s.name, from: triple(s, "from"), to: triple(s, "to"),
          dashed: s.words.includes("dashed"), stroke: s.opts.stroke ?? "line", ...(s.opts.on === undefined ? {} : { on: String(s.opts.on), line: s.line }),
          ...(s.opts.via === undefined ? {} : { via: triple(s, "via") }) });
        break;
      }
      case "ground": {
        const [gx, gy] = [s.nums[0], s.nums[1]];
        if (gx === undefined || gy === undefined) throw new ParseError("ground needs where: ground NAME at x y r=", s.line, s.text);
        ground = { x: gx, y: gy, r: Number(s.opts.r ?? 2) };
        break;
      }
      case "cone": {
        const r = Number(s.opts.r ?? 0.5);
        const h = Number(s.opts.h ?? 1);
        const axis = (s.opts.axis ?? "z") as "x" | "y" | "z";
        const size: [number, number, number] =
          axis === "z" ? [2 * r, 2 * r, h] : axis === "y" ? [2 * r, h, 2 * r] : [h, 2 * r, 2 * r];
        const [x, y, z] = place(s, size, byName);
        cones.push({ name: s.name, x, y, z, r, h, axis, cap: Number(s.opts.cap ?? 0), accent, tint });
        byName.set(s.name, { name: s.name, x, y, z, w: size[0], d: size[1], h: size[2] });
        break;
      }
      case "cyl": {
        const r = Number(s.opts.r ?? 0.5);
        const h = Number(s.opts.h ?? 1);
        const axis = (s.opts.axis ?? "z") as "x" | "y" | "z";
        // a cylinder occupies the same room as the box around it, which is what
        // placement and the canvas fit need to know
        const size: [number, number, number] =
          axis === "z" ? [2 * r, 2 * r, h] : axis === "y" ? [2 * r, h, 2 * r] : [h, 2 * r, 2 * r];
        const [x, y, z] = place(s, size, byName);
        cyls.push({ name: s.name, x, y, z, r, h, axis, accent, tint });
        byName.set(s.name, { name: s.name, x, y, z, w: size[0], d: size[1], h: size[2] });
        break;
      }
      case "icon": {
        // the glyph name is free text: the catalogue resolves it at compile time,
        // so it can grow without the grammar or the model changing
        const glyph = s.words.find((w) => w !== "at" && w !== "accent" && !(w in DIRS));
        if (!glyph) throw new ParseError('icon needs a glyph name in quotes, like icon it "printer" on=box', s.line, s.text);
        const size = Number(s.opts.size ?? 1);
        if (!(size > 0 && size <= 20)) throw new ParseError("icon size is a height in scene units, above 0 and up to 20", s.line, s.text);
        const [x, y, z] = place(s, [size, size, size], byName);
        // an unknown glyph costs a glyph, never the figure
        if (!findGlyph(glyph)) {
          notes.push(`icon ${s.name}: nothing in the catalogue is called "${glyph}", so it is left out`);
          break;
        }
        icons.push({ name: s.name, glyph, x, y, z, size });
        byName.set(s.name, { name: s.name, x, y, z, w: size, d: size, h: size });
        break;
      }
      case "on": {
        // the face is the last segment, the same way a hole reads one
        const cut = s.name.lastIndexOf(".");
        const target = cut > 0 ? s.name.slice(0, cut) : s.name;
        const face = cut > 0 ? s.name.slice(cut + 1) : "";
        if (!["left", "right", "top"].includes(face)) {
          throw new ParseError(`on needs a face, one of left, right, top: "${s.name}"`, s.line, s.text);
        }
        ref(byName, target, s);
        const SHAPES = ["inset", "rect", "bar", "disc", "ticks", "cells", "line", "arc", "ring", "tri"];
        const shape = s.words.find((w) => SHAPES.includes(w));
        if (!shape) throw new ParseError(`on needs a shape: ${SHAPES.join(", ")}`, s.line, s.text);
        // the short words still work, and fill= and stroke= name a tone outright
        const w = (x: string) => s.words.includes(x);
        const accent = w("accent");
        const look: Look = {
          fill: s.opts.fill ?? (w("lit") ? "lit" : w("filled") ? (accent ? "accent" : "ink") : w("pale") ? "top" : "none"),
          stroke: s.opts.stroke ?? (w("faint") ? "faint" : accent ? "accent" : "line"),
          ...(s.opts.weight === undefined ? {} : { weight: Number(s.opts.weight) }),
          ...(s.opts.opacity === undefined ? {} : { opacity: Number(s.opts.opacity) }),
        };
        const at = { target, face: face as FaceId, look };
        const n = (i: number, d: number) => s.nums[i] ?? d;
        const o = (k: string, d: number) => Number(s.opts[k] ?? d);
        const reps = { n: Math.max(1, Math.min(24, o("n", 1))), step: o("step", 0.1) };
        if (shape === "inset") marks.push({ kind: "inset", ...at, d: n(0, 0.1), r: o("r", 0) });
        else if (shape === "rect") marks.push({ kind: "rect", ...at, u: n(0, 0), v: n(1, 0), w: n(2, 0.4), h: n(3, 0.2), r: o("r", 0), ...reps });
        else if (shape === "bar") marks.push({ kind: "bar", ...at, u: n(0, 0.5), v: n(1, 0.5), w: o("w", 0.4), h: o("h", 0.06), r: o("r", 0), ...reps });
        else if (shape === "disc") marks.push({ kind: "disc", ...at, u: n(0, 0.5), v: n(1, 0.5), r: o("r", 0.15), spokes: o("spokes", 0), hub: o("hub", 0.62) });
        else if (shape === "ticks") marks.push({ kind: "ticks", ...at, u: n(0, 0.5), v: n(1, 0.5), r: o("r", 0.2), hub: o("hub", 0.1), n: o("n", 12), turn: o("turn", 0) });
        else if (shape === "line") marks.push({ kind: "line", ...at, u: n(0, 0), v: n(1, 0), u2: n(2, 0), v2: n(3, 0), ...reps });
        else if (shape === "arc") marks.push({ kind: "arc", ...at, u: n(0, 0.5), v: n(1, 0.5), r: o("r", 0.2), from: o("from", -60), to: o("to", 60), ...reps });
        else if (shape === "ring") marks.push({ kind: "ring", ...at, u: n(0, 0.5), v: n(1, 0.5), r: o("r", 0.2), inner: o("inner", 0.6) });
        else if (shape === "tri") marks.push({ kind: "tri", ...at, u: n(0, 0.5), v: n(1, 0.5), r: o("r", 0.12), turn: o("turn", 0) });
        else {
          const [nx = 3, ny = 3] = String(s.opts.n ?? "3,3").split(",").map(Number);
          marks.push({ kind: "cells", ...at, u: n(0, 0), v: n(1, 0), nx, ny, size: o("size", 0.1), gap: o("gap", 0.04), r: o("r", 0) });
        }
        break;
      }
      case "hole": {
        // the face is the last segment, so a hole can go on a part of a grid or
        // stack: sockets.000.top is the top of cube 000, not a face named 000
        const cut = s.name.lastIndexOf(".");
        const target = cut > 0 ? s.name.slice(0, cut) : s.name;
        const face = cut > 0 ? s.name.slice(cut + 1) : "left";
        if (!["left", "right", "top"].includes(face)) {
          throw new ParseError(`hole needs a face, one of left, right, top: "${s.name}"`, s.line, s.text);
        }
        ref(byName, target, s);
        holes.push({
          target,
          face: face as "left" | "right" | "top",
          r: Number(s.opts.r ?? 0.5),
          sides: s.words.includes("hex") ? 6 : 48,
        });
        break;
      }
      case "pattern": {
        ref(byName, s.name, s);
        patterns.push({
          target: s.name,
          n: Number(s.opts.n ?? 4),
          cells: (s.opts.accent ?? "").split(",").filter(Boolean).map(Number),
        });
        break;
      }
      case "ring": {
        ref(byName, s.name, s);
        rings.push({
          target: s.name,
          r: Number(s.opts.r ?? 2),
          n: Number(s.opts.n ?? 12),
          // one dash or several, so a whole ring can read as progress
          accentAt: (s.opts.accent ?? "").split(",").filter(Boolean).map(Number),
        });
        break;
      }
      case "dot": {
        const at = s.words.includes("at") && s.nums.length >= 3
          ? ([s.nums[0]!, s.nums[1]!, s.nums[2]!] as [number, number, number]) : undefined;
        if (!at) ref(byName, s.name, s);
        dots.push({ target: s.name, ...(at ? { at } : {}),
          ...(s.opts.r === undefined ? {} : { r: Number(s.opts.r) }),
          hollow: s.words.includes("hollow"), accent: s.words.includes("accent"),
          ...(s.opts.fill === undefined ? {} : { fill: s.opts.fill }), ...(s.opts.on === undefined ? {} : { on: String(s.opts.on), line: s.line }),
          ...(s.opts.look === undefined ? {} : { look: s.opts.look }), name: s.name });
        break;
      }
      case "enter": {
        const how = (["drop", "rise", "pop", "fade"] as const).find((h) => s.words.includes(h));
        if (!how) throw new ParseError("enter needs how it comes in: drop, rise, pop or fade", s.line, s.text);
        const target = solidName(s.name, s);
        const covered = (n: string) => n === target || n.startsWith(`${target}.`) || target.startsWith(`${n}.`);
        if (motion.entrances.some((e) => covered(e.target))) {
          throw new ParseError(`${target} already enters on an earlier line`, s.line, s.text);
        }
        let from: string | undefined;
        if (s.opts.from !== undefined) {
          from = solidName(s.opts.from, s);
          if (from === target || from.startsWith(`${target}.`) || target.startsWith(`${from}.`)) {
            throw new ParseError(`${target} can not come out of itself`, s.line, s.text);
          }
        }
        const stagger = Number(s.opts.stagger ?? 0);
        if (!(stagger >= 0 && stagger <= 2)) throw new ParseError("stagger is a number of seconds from 0 to 2", s.line, s.text);
        motion.entrances.push({
          target, how, from, stagger, together: s.words.includes("together") && motion.entrances.length > 0, line: s.line, text: s.text,
        });
        break;
      }
      case "float":
      case "pulse": {
        const list = s.kind === "float" ? motion.floats : motion.pulses;
        const target = solidName(s.name, s);
        if (list.includes(target)) throw new ParseError(`${target} already has ${s.kind}`, s.line, s.text);
        list.push(target);
        break;
      }
      case "slide":
      case "bob": {
        const target = solidName(s.name, s);
        const by = String(s.opts.by ?? "").split(",").map(Number);
        if (by.length !== 3 || by.some((v) => !Number.isFinite(v) || Math.abs(v) > 20) || by.every((v) => v === 0)) {
          throw new ParseError(`${s.kind} needs where it moves, by=x,y,z in scene units, not all 0`, s.line, s.text);
        }
        const all = [...motion.slides, ...motion.bobs];
        if (all.some((m) => m.target === target)) throw new ParseError(`${target} already slides or bobs`, s.line, s.text);
        (s.kind === "slide" ? motion.slides : motion.bobs).push({ target, by: by as [number, number, number] });
        break;
      }
      case "hover": {
        const target = solidName(s.name, s);
        if (motion.hovers.some((h) => h.target === target)) throw new ParseError(`${target} already has a hover`, s.line, s.text);
        if (s.opts.lift !== undefined) {
          const lift = Number(s.opts.lift);
          if (!(lift > 0 && lift <= 5)) throw new ParseError("lift is how far it rises, above 0 and up to 5", s.line, s.text);
          motion.hovers.push({ target, kind: "lift", by: [0, 0, lift] });
        } else if (s.opts.open !== undefined) {
          const by = String(s.opts.open).split(",").map(Number);
          if (by.length !== 3 || by.some((v) => !Number.isFinite(v) || Math.abs(v) > 10) || by.every((v) => v === 0)) {
            throw new ParseError("open is where it slides to, open=x,y,z in scene units, not all 0", s.line, s.text);
          }
          motion.hovers.push({ target, kind: "open", by: by as [number, number, number] });
        } else if (s.words.includes("glow")) {
          motion.hovers.push({ target, kind: "glow", by: [0, 0, 0] });
        } else {
          throw new ParseError("hover needs what it does: lift=0.3, open=x,y,z or glow", s.line, s.text);
        }
        break;
      }
      case "blink":
      case "ripple": {
        const list = s.kind === "blink" ? motion.blinks : motion.ripples;
        const target = solidName(s.name, s);
        if (list.includes(target)) throw new ParseError(`${target} already has ${s.kind}`, s.line, s.text);
        list.push(target);
        break;
      }
      case "flow": {
        if (!arrows.some((a) => a.name === s.name)) throw new ParseError(`flow works on arrows, "${s.name}" is not an arrow`, s.line, s.text);
        if (motion.flows.includes(s.name)) throw new ParseError(`${s.name} already flows`, s.line, s.text);
        motion.flows.push(s.name);
        break;
      }
      case "timeline": {
        if (timelineSet) throw new ParseError("only one timeline line", s.line, s.text);
        if (s.name !== "loop" && s.name !== "once") throw new ParseError("timeline is loop or once", s.line, s.text);
        const hold = Number(s.opts.hold ?? 1.5);
        if (!(hold >= 0 && hold <= 10)) throw new ParseError("hold is a number of seconds from 0 to 10", s.line, s.text);
        motion.loop = s.name === "loop";
        motion.hold = hold;
        timelineSet = true;
        break;
      }
      case "accent": {
        const arrow = arrows.find((a) => a.name === s.name);
        if (arrow) arrow.accent = true;
        else {
          // a grid or stack named whole lights every part of it, which is what is drawn
          const parts = [...boxes, ...cyls].filter((b) => b.name.startsWith(`${s.name}.`));
          if (parts.length && !boxes.some((b) => b.name === s.name)) for (const p of parts) p.accent = true;
          else ref(byName, s.name, s).accent = true;
        }
        break;
      }
    }
  }
  return { boxes, cyls, cones, dishes, rods, decals, labels, wires, tracks, tubes, rules, plates, ...(ground ? { ground } : {}), holes, patterns, marks, rings, icons, tags, links, brackets, arrows, dots, motion, notes };
}
