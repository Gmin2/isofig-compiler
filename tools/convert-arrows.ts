// Rewrite point arrows as arrows between named solids, where that draws the same arrow.
//
//   node tools/convert-arrows.ts <in dir> <out dir>
//
// Each end is matched to the solid it leaves or enters. The rewritten line is only
// kept when the figure still compiles and the routed arrow runs the same way and
// starts and ends near where the teacher put it; otherwise the points stay.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../src/parse.ts";
import { build, type Scene } from "../src/scene.ts";

type S = { name: string; x: number; y: number; z: number; w: number; d: number; h: number };
type V = [number, number, number];

// the whole solids a figure names: a box, a cylinder, or all the parts of a stack, grid or tray
function solidsOf(scene: Scene, lines: string[]): S[] {
  const out: S[] = [];
  for (const line of lines) {
    const m = line.match(/^(box|slab|tray|stack|grid|cyl) (\S+)/);
    if (!m) continue;
    const n = m[2]!;
    const cyl = scene.cyls.find((c) => c.name === n);
    const all = cyl
      ? [{ x: cyl.x, y: cyl.y, z: cyl.z, w: cyl.axis === "x" ? cyl.h : 2 * cyl.r, d: cyl.axis === "y" ? cyl.h : 2 * cyl.r, h: cyl.axis === "z" ? cyl.h : 2 * cyl.r }]
      : scene.boxes.filter((b) => b.name === n || b.name.startsWith(`${n}.`));
    if (!all.length) continue;
    const x = Math.min(...all.map((b) => b.x)), y = Math.min(...all.map((b) => b.y)), z = Math.min(...all.map((b) => b.z));
    out.push({
      name: n, x, y, z,
      w: Math.max(...all.map((b) => b.x + b.w)) - x, d: Math.max(...all.map((b) => b.y + b.d)) - y, h: Math.max(...all.map((b) => b.z + b.h)) - z,
    });
  }
  return out;
}

const gap = (p: V, b: S) => Math.hypot(
  Math.max(b.x - p[0], 0, p[0] - (b.x + b.w)), Math.max(b.y - p[1], 0, p[1] - (b.y + b.d)), Math.max(b.z - p[2], 0, p[2] - (b.z + b.h)));
const overXY = (p: V, b: S) => p[0] > b.x && p[0] < b.x + b.w && p[1] > b.y && p[1] < b.y + b.d;
const dist = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const unit = (a: V, b: V): V => { const l = dist(a, b) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l, (b[2] - a[2]) / l]; };
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// the solid an arrow end belongs to: close to the end, on the far side of it
// (behind a start, ahead of a finish), and not the ground a level arrow runs over.
// an arrow going down onto something does end on it
function endSolid(p: V, other: V, dir: V, sign: number, solids: S[]): S | undefined {
  let best: S | undefined, bestGap = Infinity;
  for (const b of solids) {
    if (Math.abs(dir[2]) < 0.7 && overXY(p, b) && overXY(other, b) && p[2] >= b.z + b.h - 0.05) continue;
    const c: V = [b.x + b.w / 2, b.y + b.d / 2, b.z + b.h / 2];
    if (dot([c[0] - p[0], c[1] - p[1], c[2] - p[2]], dir) * sign <= 0) continue;
    const g = gap(p, b);
    if (g <= 0.9 && g < bestGap) { best = b; bestGap = g; }
  }
  return best;
}

function axisOf(dir: V): string | undefined {
  const k = [0, 1, 2].reduce((m, i) => (Math.abs(dir[i]!) > Math.abs(dir[m]!) ? i : m), 0);
  return Math.abs(dir[k]!) > 0.95 ? `${dir[k]! > 0 ? "+" : "-"}${"xyz"[k]}` : undefined;
}
const flip = (side: string) => (side[0] === "+" ? "-" : "+") + side[1];

const tryBuild = (lines: string[]): Scene | string => {
  try { return build(parse(lines.join("\n"))); } catch (e) { return e instanceof Error ? e.message.split("\n")[0]! : String(e); }
};

export type Outcome = { kind: "both" | "leaves" | "enters" | "kept"; why?: string; name: string; old: [V, V]; now?: [V, V]; tried?: string };

export function convert(src: string): { text: string; outcomes: Outcome[] } {
  let lines = src.split("\n").map((l) => l.trim()).filter(Boolean);
  const outcomes: Outcome[] = [];
  const first = tryBuild(lines);
  if (typeof first === "string") return { text: lines.join("\n"), outcomes };
  const solids = solidsOf(first, lines);

  for (const a of first.arrows) {
    const i = lines.findIndex((l) => l.startsWith(`arrow ${a.name} `));
    if (i < 0) continue;
    const old: [V, V] = [a.from, a.to];
    const dir = unit(a.from, a.to);
    const s0 = endSolid(a.from, a.to, dir, -1, solids);
    const s1 = endSolid(a.to, a.from, dir, 1, solids);
    const words = lines[i]!.split(" ").slice(2).filter((w) => !w.startsWith("from=") && !w.startsWith("to="));
    let kind: Outcome["kind"], ends: string;
    const side = axisOf(dir);
    if (s0 && s1 && s0.name !== s1.name) { kind = "both"; ends = `from=${s0.name} to=${s1.name}`; }
    else if (s0 && !s1 && side) { kind = "leaves"; ends = `from=${s0.name} to=${side}`; }
    else if (s1 && !s0 && side) { kind = "enters"; ends = `from=${flip(side)} to=${s1.name}`; }
    else {
      outcomes.push({ kind: "kept", why: s0 && s1 ? "same solid at both ends" : s0 || s1 ? "one end, not along an axis" : "no solid at either end", name: a.name, old });
      continue;
    }
    const line = ["arrow", a.name, ...words.filter((w) => w !== "dashed" && w !== "accent"), ends, ...words.filter((w) => w === "dashed" || w === "accent")].join(" ");
    let next = [...lines];
    next[i] = line;
    let scene = tryBuild(next);
    if (typeof scene === "string" && scene.includes("not defined")) {
      // the arrow came before a solid it now names: move it after the later of the two
      const defAt = (n: string) => next.findIndex((l) => new RegExp(`^(box|slab|tray|stack|grid|cyl) ${n} `).test(l));
      const after = Math.max(...[s0, s1].filter(Boolean).map((s) => defAt(s!.name)));
      next.splice(i, 1);
      next.splice(after, 0, line);
      scene = tryBuild(next);
    }
    if (typeof scene === "string") {
      outcomes.push({ kind: "kept", why: `compiler: ${scene.replace(/^line \d+: /, "").replace(/arrow \S+: /, "")}`, name: a.name, old });
      continue;
    }
    const b = scene.arrows.find((x) => x.name === a.name)!;
    const now: [V, V] = [b.from, b.to];
    const same = dot(unit(b.from, b.to), dir) >= 0.85;
    // the teacher can lift an arrow over what stands between two solids; a routed
    // arrow keeps level, so one that would run through a third solid stays as points
    const joined = [s0, s1].filter(Boolean).map((x) => x!.name);
    const mine = (n: string) => joined.some((e) => n === e || n.startsWith(`${e}.`));
    const blockers = [...scene.boxes.filter((x) => !mine(x.name)),
      ...scene.cyls.filter((c) => !mine(c.name)).map((c) => ({ x: c.x, y: c.y, z: c.z, w: c.axis === "x" ? c.h : 2 * c.r, d: c.axis === "y" ? c.h : 2 * c.r, h: c.axis === "z" ? c.h : 2 * c.r }))];
    const through = Array.from({ length: 41 }, (_, j) => j / 40).some((t) => {
      const q = [0, 1, 2].map((k) => b.from[k]! + (b.to[k]! - b.from[k]!) * t);
      return blockers.some((x) => Math.min(q[0]! - x.x, x.x + x.w - q[0]!, q[1]! - x.y, x.y + x.d - q[1]!, q[2]! - x.z, x.z + x.h - q[2]!) > 0.05);
    });
    if (through) {
      outcomes.push({ kind: "kept", why: "routed arrow runs through another solid", name: a.name, old, now, tried: next.join("\n") });
      continue;
    }
    // an open end is a fixed length, so only the end on the solid has to match
    const close = kind === "both" ? dist(b.from, a.from) <= 1.5 && dist(b.to, a.to) <= 1.5
      : kind === "leaves" ? dist(b.from, a.from) <= 1.2 : dist(b.to, a.to) <= 1.2;
    if (!same || !close) {
      outcomes.push({ kind: "kept", why: !same ? "routed arrow points another way" : "routed ends too far from the original", name: a.name, old, now, tried: next.join("\n") });
      continue;
    }
    lines = next;
    outcomes.push({ kind, name: a.name, old, now });
  }
  // a figure can not open with an arrow: a point arrow before any solid moves below the first one
  const firstSolid = lines.findIndex((l) => /^(box|slab|tray|stack|grid|cyl) /.test(l));
  const leading = lines.slice(0, Math.max(firstSolid, 0)).filter((l) => l.startsWith("arrow "));
  if (leading.length) lines = [...lines.slice(0, firstSolid).filter((l) => !l.startsWith("arrow ")), lines[firstSolid]!, ...leading, ...lines.slice(firstSolid + 1)];
  return { text: lines.join("\n"), outcomes };
}

if (process.argv[1]?.endsWith("convert-arrows.ts")) {
  const [inDir, outDir] = process.argv.slice(2);
  if (!inDir || !outDir) {
    console.error("usage: node tools/convert-arrows.ts <in dir> <out dir>");
    process.exit(2);
  }
  mkdirSync(outDir, { recursive: true });
  const tally: Record<string, number> = {};
  const report: Record<string, Outcome[]> = {};
  for (const f of readdirSync(inDir).filter((f: string) => f.endsWith(".fig")).sort()) {
    const { text, outcomes } = convert(readFileSync(join(inDir, f), "utf8"));
    writeFileSync(join(outDir, f), text + "\n");
    if (outcomes.length) report[f] = outcomes;
    for (const o of outcomes) {
      const key = o.kind === "kept" ? `kept: ${o.why}` : o.kind;
      tally[key] = (tally[key] ?? 0) + 1;
    }
  }
  writeFileSync(join(outDir, "arrows.json"), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(tally, null, 1));
}
