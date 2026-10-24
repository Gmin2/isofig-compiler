// The compiler as a library: scene lines in, an svg and what the lint found out.
// Nothing here throws for a bad figure; a figure either compiles or says why not.
import { parse, ParseError } from "./parse.ts";
import { build, type Scene } from "./scene.ts";
import { render, type Options, type Frame } from "./svg.ts";
import { brandStyle, HAIRLINE, MACHINE, isStyleName, STYLE_NAMES, STYLES, styleNamed, TAG_LOOKS, TINTS, type Brand, type Style, type StyleName, type Tint } from "./style.ts";
import { lint, type Issue } from "./lint.ts";
import { settle } from "./settle.ts";

export type { Scene, Issue, Style, StyleName, Options, Tint, Frame, Brand };
export { HAIRLINE, MACHINE, STYLES, STYLE_NAMES, styleNamed, isStyleName, TINTS, TAG_LOOKS, brandStyle };

export type CompileError = {
  // the figure line the problem is on, when there is one
  line: number | null;
  message: string;
};

export type Compiled = {
  svg: string;
  issues: Issue[];
  // what had to be left out or bent to draw the figure, in lenient mode
  notes: string[];
  // solids slid clear of a shallow overlap before drawing, one line each
  settled: string[];
  // any enter, float, pulse or flow line
  animated: boolean;
  // seconds until the last entrance lands; null for a figure that does not move
  seconds: number | null;
};

export type CompileResult =
  | { ok: true; figure: Compiled }
  | { ok: false; error: CompileError };

export type CompileOptions = {
  // a named style, or the pieces of one. `styleNamed` turns a name into the whole thing.
  style?: Partial<Style>;
  // draw one still frame of the motion at this many seconds, instead of css
  at?: number;
  // override the figure's timeline line; false plays motion once and stays on the finished figure
  loop?: boolean;
  // draw what can be drawn and say what had to bend, instead of refusing the whole figure
  lenient?: boolean;
  // mark each piece with the solid or line it came from, for an editor
  ids?: boolean;
  // hold the canvas and projection fixed instead of fitting the figure, for frames of motion
  frame?: Frame;
};

// an overlap or an arrow through a solid this deep or deeper makes a figure look broken
export const SERIOUS_DEPTH = 0.1;

export function compile(source: string, options: CompileOptions = {}): CompileResult {
  try {
    const lenient = options.lenient ?? false;
    const scene = build(parse(source), { lenient });
    // drawing leniently, a shallow overlap is slid clear; strictly, the figure is drawn as written
    const settled = lenient ? settle(scene) : [];
    const notes = [...scene.notes];
    const timing: { settled: number | null } = { settled: null };
    const svg = render(scene, options.style ?? {}, {
      timing,
      ...(options.at === undefined ? {} : { at: options.at }),
      ...(options.loop === undefined ? {} : { loop: options.loop }),
      lenient,
      notes,
      ...(options.frame ? { frame: options.frame } : {}),
      ...(options.ids ? { ids: true } : {}),
    });
    const m = scene.motion;
    const animated = m.entrances.length + m.floats.length + m.pulses.length + m.flows.length +
      m.slides.length + m.bobs.length + m.blinks.length + m.ripples.length + m.hovers.length > 0;
    return { ok: true, figure: { svg, issues: lint(scene), animated, notes, settled, seconds: timing.settled } };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: { line: e.line, message: e.message.split("\n")[0] ?? e.message } };
    return { ok: false, error: { line: null, message: e instanceof Error ? e.message : String(e) } };
  }
}

export type Frames = { fps: number; svgs: string[] };
export type FrameOptions = CompileOptions & { fps?: number; hold?: number; most?: number };

/**
 * When to take the frames of a moving figure, for a gif or a video: through the entrances,
 * then a moment of whatever keeps moving after, so a loop of it does not cut off the instant it
 * lands. One moment for a figure that does not move. Null when the figure does not compile.
 */
export function frameTimes(source: string, options: FrameOptions = {}): { fps: number; times: number[] } | null {
  const { fps = 15, hold = 1.5, most = 8, ...draw } = options;
  const first = compile(source, { ...draw, loop: false });
  if (!first.ok) return null;
  // a figure that only drifts, with nothing coming in, still gets a few seconds of it
  const seconds = Math.min(most, first.figure.seconds === null ? 0 : first.figure.seconds + hold) || (first.figure.animated ? 3 : 0);
  if (seconds === 0) return { fps, times: [] };
  return { fps, times: Array.from({ length: Math.round(seconds * fps) }, (_, i) => i / fps) };
}

/** The frames themselves, every one on the same canvas so they line up. */
export function frames(source: string, options: FrameOptions = {}): Frames | null {
  const plan = frameTimes(source, options);
  if (!plan) return null;
  const { fps: _fps, hold: _hold, most: _most, ...draw } = options;
  if (!plan.times.length) {
    const still = compile(source, { ...draw, loop: false });
    return still.ok ? { fps: plan.fps, svgs: [still.figure.svg] } : null;
  }
  const svgs: string[] = [];
  for (const at of plan.times) {
    const r = compile(source, { ...draw, loop: false, at });
    if (r.ok) svgs.push(r.figure.svg);
  }
  return { fps: plan.fps, svgs };
}

export function isSerious(issue: Issue): boolean {
  return issue.depth >= SERIOUS_DEPTH;
}

// a figure says the same thing this many times before it is just padding; a row of six
// identical tiles is still a row, twenty of them is the model having lost the plot
const REPEATS_ALLOWED = 6;

/**
 * How much of a figure is the same line over and over. Names and numbers are taken out, so
 * `slab pin3 0.45 0.45 0.08 beside=pin2 +x gap=0.15` and its twenty siblings count as one shape.
 */
export function repetition(source: string): number {
  const seen = new Map<string, number>();
  for (const line of source.split("\n")) {
    const text = line.trim();
    if (!text || text.startsWith("#")) continue;
    const shape = text.replace(/[0-9]+(\.[0-9]+)?/g, "#").replace(/\b[a-z][a-z0-9_.]*\b/g, (word) => (/^(box|slab|shape|word|tray|stack|cyl|grid|group|arrow|link|tag|brackets|accent|enter|float|pulse|flow|slide|bob|blink|ripple|hover|lift|open|glow|by|timeline|on|beside|at|gap|r|n|wall|axis|h|from|to|dashed|below|together|stagger|loop|once|hold|drop|rise|pop|fade)$/.test(word) ? word : "*"));
    seen.set(shape, (seen.get(shape) ?? 0) + 1);
  }
  const most = Math.max(0, ...seen.values());
  return Math.max(0, most - REPEATS_ALLOWED);
}

// lower is better: compiles first, then fewest things wrong with it, then how badly
// A figure that repeats itself is wrong in the same way an overlap is: nobody wants it.
export type Badness = readonly [failed: 0 | 1, wrong: number, repeated: number, depth: number];

export function badness(result: CompileResult, source = ""): Badness {
  if (!result.ok) return [1, 0, 0, 0];
  const issues = result.figure.issues;
  const depth = Math.round(issues.reduce((sum, i) => sum + i.depth, 0) * 1000) / 1000;
  const repeated = repetition(source);
  // something left out counts against a figure the same way a serious overlap does
  return [0, issues.filter(isSerious).length + result.figure.notes.length + (repeated > 0 ? 1 : 0), repeated, depth];
}

function compareBadness(a: Badness, b: Badness): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3];
}

export type Pick = { index: number; result: CompileResult; clean: boolean };

/** Every sample, best first; samples that are equally good keep their order. */
export function rankSamples(sources: readonly string[], options: CompileOptions = {}): Pick[] {
  return sources
    .map((source, index) => {
      const result = compile(source, options);
      const b = badness(result, source);
      return { pick: { index, result, clean: result.ok && b[1] === 0 }, b };
    })
    .sort((x, y) => compareBadness(x.b, y.b) || x.pick.index - y.pick.index)
    .map((x) => x.pick);
}

/** The best of several samples for one brief, the earliest on a tie. Null when there are none. */
export function pickBest(sources: readonly string[], options: CompileOptions = {}): Pick | null {
  return rankSamples(sources, options)[0] ?? null;
}
