// tag labels: one row above and one below, sliding apart, changing rows, bending
// leaders, and stepping out only as a last resort
import { parse } from "../src/parse.ts";
import { build } from "../src/scene.ts";
import { render } from "../src/svg.ts";

let failed = 0;
const check = (what: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : `  ${detail}`}`);
};

type Label = { text: string; x: number; y: number; w: number; cx: number };
type Leader = { pts: number[][]; at: number };
const read = (src: string) => {
  // where labels go does not depend on how they look; the box is the easiest to read back
  const svg = render(build(parse(src)), { tag: "box" });
  const labels: Label[] = [...svg.matchAll(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="19"[^>]*\/><text x="([^"]+)"[^>]*>([^<]*)<\/text>/g)]
    .map((m) => ({ x: +m[1]!, y: +m[2]!, w: +m[3]!, cx: +m[4]!, text: m[5]! }));
  const leaders: Leader[] = [];
  for (const m of svg.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)" stroke-dasharray/g)) {
    leaders.push({ pts: [[+m[1]!, +m[2]!], [+m[3]!, +m[4]!]], at: m.index! });
  }
  for (const m of svg.matchAll(/<polyline points="([^"]+)" stroke-dasharray/g)) {
    leaders.push({ pts: m[1]!.split(" ").map((p) => p.split(",").map(Number)), at: m.index! });
  }
  // a tag's leader is the dashed line whose last point sits on its label's top or bottom edge
  const leaderOf = (l: Label) => leaders.find((d) => {
    const [x, y] = d.pts[d.pts.length - 1]!;
    return x! >= l.x - 0.01 && x! <= l.x + l.w + 0.01 && (Math.abs(y! - l.y) < 0.01 || Math.abs(y! - (l.y + 19)) < 0.01);
  });
  const firstLabel = svg.search(/<rect x="[^"]+" y="[^"]+" width="[^"]+" height="19"/);
  return { svg, labels, leaderOf, firstLabel, size: Number(svg.match(/viewBox="0 0 (\d+)/)![1]) };
};
const overlap = (a: Label, b: Label) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + 19 && b.y < a.y + 19;
const noOverlaps = (ls: Label[]) => ls.every((a, i) => ls.every((b, j) => j <= i || !overlap(a, b)));
const straight = (d: Leader | undefined) => !!d && d.pts.length === 2 && Math.abs(d.pts[0]![0]! - d.pts[1]![0]!) < 0.01;
const byText = (ls: Label[], t: string) => ls.find((l) => l.text === t)!;

{
  const r = read('slab a 2 2 0.4 at 0 0 0\nslab b 2 2 0.4 at 6 0 0\ntag a "LEFT"\ntag b "RIGHT"');
  const [l, rt] = [byText(r.labels, "LEFT"), byText(r.labels, "RIGHT")];
  check("far apart: same row, no overlap", l.y === rt.y && noOverlaps(r.labels));
  check("far apart: straight leaders, labels centred on them", straight(r.leaderOf(l)) && straight(r.leaderOf(rt)) &&
    Math.abs(r.leaderOf(l)!.pts[0]![0]! - l.cx) < 0.01, JSON.stringify(r.labels));
}
{
  // anchors a little apart: labels slide just enough, leaders stay straight
  const r = read('slab a 2 2 0.4 at 0 0 0\nslab b 2 2 0.4 at 1.2 -1.2 0\ntag a "FIRST"\ntag b "SECOND"');
  check("close anchors: labels slide, still one row", noOverlaps(r.labels) && r.labels[0]!.y === r.labels[1]!.y, JSON.stringify(r.labels));
  check("close anchors: both leaders straight", r.labels.every((l) => straight(r.leaderOf(l))));
}
{
  // a coin on a platform: same anchor. the tag that did not ask for a side moves below
  const r = read('slab base 4 4 0.3 r=0.6 at 0 0 0\nslab coin 1 1 0.2 r=0.5 on=base\ntag base "PLATFORM"\ntag coin "COIN"');
  const [p, c] = [byText(r.labels, "PLATFORM"), byText(r.labels, "COIN")];
  // the figure is centred on the canvas, so one label above the middle and one below means they took opposite rows
  const mid = r.size / 2;
  check("same anchor: one label changes row", (p.y < mid) !== (c.y < mid) && noOverlaps(r.labels), JSON.stringify(r.labels));
  check("same anchor: both leaders straight", straight(r.leaderOf(p)) && straight(r.leaderOf(c)));
}
{
  // same anchor, both asked to be above: they stay above, side by side, one leader bends
  const r = read('slab base 4 4 0.3 r=0.6 at 0 0 0\nslab coin 1 1 0.2 r=0.5 on=base\ntag base "PLATFORM" above\ntag coin "COIN" above');
  const [p, c] = [byText(r.labels, "PLATFORM"), byText(r.labels, "COIN")];
  check("asked for a side: both stay above in one row", p.y === c.y && noOverlaps(r.labels), JSON.stringify(r.labels));
  check("asked for a side: a leader bends to reach its label", r.labels.some((l) => r.leaderOf(l)?.pts.length === 3));
  check("every leader ends inside its label", r.labels.every((l) => !!r.leaderOf(l)));
}
{
  // an explicit below is kept even with the top row empty
  const r = read('slab a 2 2 0.4 at 0 0 0\ntag a "UNDER" below');
  const top = Math.min(...[...r.svg.matchAll(/<polygon points="([^"]+)"/g)].flatMap((m) => m[1]!.split(" ").map((p) => +p.split(",")[1]!)));
  check("below stays below", r.labels[0]!.y > top, JSON.stringify(r.labels));
}
{
  // near the canvas edge a long label stays on the canvas
  const r = read('slab a 1 1 0.4 at 0 0 0\nslab b 1 1 0.4 at 9 -9 0\ntag a "A VERY LONG LABEL TEXT"\ntag b "ANOTHER LONG ONE HERE"');
  check("long labels near the edges stay on the canvas", r.labels.every((l) => l.x >= 0 && l.x + l.w <= r.size), JSON.stringify(r.labels));
  check("and still have leaders", r.labels.every((l) => !!r.leaderOf(l)));
}
{
  // too many wide labels for two rows: they step out, never overlap, and every leader is drawn before any label
  const tags = Array.from({ length: 10 }, (_, i) => `slab s${i} 1 1 0.3 at ${i * 0.3} ${-i * 0.3} ${i * 0.35}\ntag s${i} "LABEL NUMBER ${i} X" above`).join("\n");
  const r = read(tags);
  const rows = new Set(r.labels.map((l) => l.y)).size;
  check("crowded: labels step out to more rows", rows > 1 && noOverlaps(r.labels), `${rows} rows`);
  const allLeaders = r.labels.map((l) => r.leaderOf(l)!);
  check("crowded: every leader found and drawn before the labels", allLeaders.every((d) => d && d.at < r.firstLabel));
}
{
  // a tall cylinder: the label row clears the top of the cylinder, not just the boxes
  const r = read('slab base 3 3 0.2 at 0 0 0\ncyl tower r=0.6 h=6 at 0.9 0.9 0.2\ntag base "BASE"');
  const cylTop = Math.min(...[...r.svg.matchAll(/<polygon points="([^"]+)"/g)].flatMap((m) => m[1]!.split(" ").map((p) => +p.split(",")[1]!)));
  check("label row is above a tall cylinder", r.labels[0]!.y + 19 <= cylTop - 10, `label bottom ${r.labels[0]!.y + 19}, figure top ${cylTop}`);
}
{
  // a tag on an arrow anchors at its middle
  const r = read('slab a 2 2 0.4 at 0 0 0\nslab b 2 2 0.4 at 6 0 0\narrow go from=a to=b\ntag go "FLOW"');
  check("tag on an arrow", r.labels.length === 1 && !!r.leaderOf(r.labels[0]!));
}
{
  const src = 'slab base 4 4 0.3 r=0.6 at 0 0 0\nslab coin 1 1 0.2 r=0.5 on=base\ntag base "A & B"\ntag coin "<COIN>"';
  const r = read(src);
  check("text is escaped", r.svg.includes(">A &amp; B<") && r.svg.includes(">&lt;COIN&gt;<"));
  check("same figure, same svg", read(src).svg === r.svg);
}
{
  // two tags on one solid, one above and one below: both kept, straight
  const r = read('box b 2 2 2 at 0 0 0\ntag b "TOP"\ntag b "BOTTOM" below');
  check("two tags on one solid", r.labels.length === 2 && r.labels.every((l) => straight(r.leaderOf(l))) && byText(r.labels, "TOP").y < byText(r.labels, "BOTTOM").y);
}

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
