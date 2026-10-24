// arrows between named solids: where the compiler routes them, what it refuses,
// and that a solid in front of an arrow covers it
import { parse } from "../src/parse.ts";
import { build } from "../src/scene.ts";
import { render } from "../src/svg.ts";

let failed = 0;
const check = (what: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : `  ${detail}`}`);
};
const near = (a: number[], b: number[], eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]!) < eps);
const arrow = (src: string, name = "go") => {
  const a = build(parse(src)).arrows.find((x) => x.name === name)!;
  return { from: a.from.map((v) => Math.round(v * 1e6) / 1e6), to: a.to.map((v) => Math.round(v * 1e6) / 1e6), route: a.route };
};
const refuses = (what: string, src: string, words: string) => {
  try {
    render(build(parse(src)));
    check(what, false, "compiled");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    check(what, msg.includes(words), msg.split("\n")[0]!);
  }
};

// side by side along x: straight through the gap at the middle of the shared height
{
  const a = arrow("slab a 2 2 0.4 at 0 0 0\nslab b 2 2 0.4 at 4 0 0\narrow go from=a to=b");
  check("along x, level, gap kept at both ends", near(a.from, [2.3, 1, 0.2]) && near(a.to, [3.7, 1, 0.2]), JSON.stringify(a));
  check("named ends mark the arrow as routed", a.route === true);
}
// reversed direction points the other way
{
  const a = arrow("slab a 2 2 0.4 at 0 0 0\nslab b 2 2 0.4 at 4 0 0\narrow go from=b to=a");
  check("along -x", near(a.from, [3.7, 1, 0.2]) && near(a.to, [2.3, 1, 0.2]), JSON.stringify(a));
}
// along y, and the shared band is used when the footprints only partly line up
{
  const a = arrow("slab a 2 2 0.4 at 0 0 0\nslab b 2 2 0.4 at 1 5 0\narrow go from=a to=b");
  check("along y through the shared band", near(a.from, [1.5, 2.3, 0.2]) && near(a.to, [1.5, 4.7, 0.2]), JSON.stringify(a));
}
// no shared band: corner to corner, leaving each footprint at its edge
{
  const a = arrow("box a 2 2 1 at 0 0 0\nbox b 2 2 1 at 5 5 0\narrow go from=a to=b");
  const g = 0.3 / Math.SQRT2;
  check("diagonal leaves at the corner", near(a.from, [2 + g, 2 + g, 0.5]) && near(a.to, [5 - g, 5 - g, 0.5]), JSON.stringify(a));
}
// discs: the arrow starts at the rim, not at the bounding square
{
  const a = arrow("slab a 2 2 0.2 r=1 at 0 0 0\nslab b 2 2 0.2 r=1 at 5 5 0\narrow go from=a to=b");
  const rim = 1 + Math.SQRT1_2, g = 0.3 / Math.SQRT2;
  check("coin to coin starts at the rim", near(a.from, [rim + g, rim + g, 0.1]) && near(a.to, [6 - Math.SQRT1_2 - g, 6 - Math.SQRT1_2 - g, 0.1]), JSON.stringify(a));
}
// rounded corners inside a shared band are still on the centre line, so nothing moves
{
  const a = arrow("slab a 2 2 0.4 r=0.8 at 0 0 0\nslab b 2 2 0.4 r=0.8 at 4 0 0\narrow go from=a to=b");
  check("rounded slabs along x", near(a.from, [2.3, 1, 0.2]) && near(a.to, [3.7, 1, 0.2]), JSON.stringify(a));
}
// different heights: the arrow keeps to the height both share
{
  const a = arrow("slab a 2 2 0.4 at 0 0 0\nbox b 2 2 3 at 4 0 0\narrow go from=a to=b");
  check("thin to tall stays at the thin one's middle", near(a.from, [2.3, 1, 0.2]) && near(a.to, [3.7, 1, 0.2]), JSON.stringify(a));
}
// nothing shared in height: it slopes from the middle of one to the middle of the other
{
  const a = arrow("box a 2 2 1 at 0 0 3\nbox b 2 2 1 at 4 0 0\narrow go from=a to=b");
  check("no shared height slopes from middle to middle", near(a.from, [2.3, 1, 3.5]) && near(a.to, [3.7, 1, 0.5]), JSON.stringify(a));
}
// one above the other: straight down or up through the shared footprint
{
  const down = arrow("slab a 2 2 0.4 at 0 0 3\nslab b 2 2 0.4 at 0 0 0\narrow go from=a to=b");
  check("above to below goes straight down", near(down.from, [1, 1, 2.7]) && near(down.to, [1, 1, 0.7]), JSON.stringify(down));
  const up = arrow("slab a 2 2 0.4 at 0 0 0\nslab b 2 2 0.4 at 0 0 3\narrow go from=a to=b");
  check("below to above goes straight up", near(up.from, [1, 1, 0.7]) && near(up.to, [1, 1, 2.7]), JSON.stringify(up));
  const off = arrow("slab a 2 2 0.4 at 0 0 3\nslab b 4 4 0.4 at 1 1 0\narrow go from=a to=b");
  check("vertical uses the middle of the overlap", near(off.from, [1.5, 1.5, 2.7]) && near(off.to, [1.5, 1.5, 0.7]), JSON.stringify(off));
}
// short gaps shrink the padding before refusing
{
  const a = arrow("slab a 2 2 0.4 at 0 0 0\nslab b 2 2 0.4 at 2.8 0 0\narrow go from=a to=b");
  check("a 0.8 gap still gets a 0.5 arrow", near(a.from, [2.15, 1, 0.2]) && near(a.to, [2.65, 1, 0.2]), JSON.stringify(a));
}
// the kinds of solid an end can be
{
  const st = arrow("slab a 2 2 0.4 at 0 0 0\nstack c 2 2 0.2 n=5 r=1 at 5 0 0\narrow go from=a to=c");
  check("whole stack, level with a", near(st.from, [2.3, 1, 0.2]) && near(st.to, [4.7, 1, 0.2]), JSON.stringify(st));
  const part = arrow("stack c 2 2 0.5 n=4 at 0 0 0\nslab a 2 2 0.5 at 5 0 1.5\narrow go from=c.3 to=a");
  check("one layer of a stack", near(part.from, [2.3, 1, 1.75]) && near(part.to, [4.7, 1, 1.75]), JSON.stringify(part));
  const fan = arrow("stack c 2 2 0.2 n=3 step=1,0 r=1 at 0 0 0\nslab a 2 2 0.6 at 7 0 0\narrow go from=c to=a");
  check("fanned stack starts from its nearest layer", near(fan.from, [4.3, 1, 0.5]), JSON.stringify(fan));
  const tray = arrow("tray t 4 4 1 at 0 0 0\nbox b 1 1 1 at 7 1.5 0\narrow go from=b to=t");
  check("tray as a whole", near(tray.from, [6.7, 2, 0.5]) && near(tray.to, [4.3, 2, 0.5]), JSON.stringify(tray));
  const grid = arrow("grid g 1 n=2,2,2 at 0 0 0\nbox b 1 1 1 at 5 0 0\narrow go from=g to=b");
  check("grid as a whole", near(grid.from, [2.3, 0.5, 0.5]) && near(grid.to, [4.7, 0.5, 0.5]), JSON.stringify(grid));
  const cyl = arrow("cyl c r=1 h=2 at 0 0 0\ncyl e r=1 h=2 at 5 5 0\narrow go from=c to=e");
  const rim = 1 + Math.SQRT1_2, g = 0.3 / Math.SQRT2;
  check("standing cylinders are discs", near(cyl.from, [rim + g, rim + g, 1]), JSON.stringify(cyl));
  const lying = arrow("cyl c r=1 h=3 axis=x at 0 0 0\nbox b 1 1 1 at 6 0.5 0\narrow go from=c to=b");
  check("lying cylinder is its box", near(lying.from, [3.3, 1, 0.5]) && near(lying.to, [5.7, 1, 0.5]), JSON.stringify(lying));
}
// one open end: leaving a solid towards a side, or coming in to one from a side
{
  const out = arrow("slab a 2 2 0.4 at 0 0 0\narrow go from=a to=+x");
  check("leaves along +x from the edge", near(out.from, [2.3, 1, 0.2]) && near(out.to, [4.3, 1, 0.2]) && out.route === true, JSON.stringify(out));
  const back = arrow("slab a 2 2 0.4 at 0 0 0\narrow go from=a to=-y");
  check("leaves along -y", near(back.from, [1, -0.3, 0.2]) && near(back.to, [1, -2.3, 0.2]), JSON.stringify(back));
  const up = arrow("box a 2 2 1 at 0 0 0\narrow go from=a to=+z");
  check("leaves straight up from the top", near(up.from, [1, 1, 1.3]) && near(up.to, [1, 1, 3.3]), JSON.stringify(up));
  const drop = arrow("box a 2 2 1 at 0 0 0\narrow go from=+z to=a");
  check("comes down onto the top", near(drop.from, [1, 1, 3.3]) && near(drop.to, [1, 1, 1.3]), JSON.stringify(drop));
  const inx = arrow("box a 2 2 1 at 0 0 0\narrow go from=-x to=a");
  check("comes in from -x", near(inx.from, [-2.3, 1, 0.5]) && near(inx.to, [-0.3, 1, 0.5]), JSON.stringify(inx));
  const coin = arrow("slab c 2 2 0.2 r=1 at 0 0 0\narrow go from=c to=+y");
  check("a disc's edge along +y is its rim", near(coin.from, [1, 2.3, 0.1]), JSON.stringify(coin));
  const under = arrow("box a 2 2 1 at 0 0 3\narrow go from=a to=-z");
  check("leaves from the bottom going down", near(under.from, [1, 1, 2.7]) && near(under.to, [1, 1, 0.7]), JSON.stringify(under));
}
refuses("two sides", "slab a 2 2 0.4 at 0 0 0\narrow go from=-x to=+x", "a name and a side");
refuses("side and point", "slab a 2 2 0.4 at 0 0 0\narrow go from=a to=+w", "a name and a side");
refuses("side to undefined", "slab a 2 2 0.4 at 0 0 0\narrow go from=+z to=b", "not defined");

// a fanned stack is mostly empty space: the arrow goes to its nearest layer
{
  const a = arrow("stack c 2 2 0.2 n=3 step=2,2 at 0 0 0\nbox a 2 2 1 at 8 4 0\narrow go from=c to=a");
  check("fanned stack routes from the nearest layer", near(a.from, [6.3, 5, 0.5]) && near(a.to, [7.7, 5, 0.5]), JSON.stringify(a));
  const back = arrow("stack c 2 2 0.2 n=3 step=2,2 at 0 0 0\nbox a 2 2 1 at 8 4 0\narrow go from=a to=c");
  check("and to it", near(back.from, [7.7, 5, 0.5]) && near(back.to, [6.3, 5, 0.5]), JSON.stringify(back));
  const straight = arrow("stack c 2 2 0.2 n=3 at 0 0 0\nbox a 2 2 1 at 5 0 0\narrow go from=c to=a");
  check("a straight stack is still the whole stack", near(straight.from, [2.3, 1, 0.3]), JSON.stringify(straight));
}
// an open end stops short of whatever is in its way
{
  const free = arrow("box a 2 2 1 at 0 0 3\nslab floor 6 6 0.2 at -2 -2 0\narrow go from=a to=-z");
  check("room below: full length", near(free.from, [1, 1, 2.7]) && near(free.to, [1, 1, 0.7]), JSON.stringify(free));
  const short = arrow("box a 2 2 1 at 0 0 3\nslab floor 6 6 0.2 at -2 -2 1.5\narrow go from=a to=-z");
  check("a floor in the way shortens it", near(short.from, [1, 1, 2.7]) && near(short.to, [1, 1, 2]), JSON.stringify(short));
  const lid = arrow("box b 2 2 1 at 0 0 0\nslab lid 2 2 0.2 at 0 0 3\narrow go from=+z to=b");
  check("coming in under a lid starts below it", near(lid.from, [1, 1, 2.7]) && near(lid.to, [1, 1, 1.3]), JSON.stringify(lid));
  const beside = arrow("box a 2 2 1 at 0 0 0\nbox wall 0.5 6 2 at 3.5 -2 0\narrow go from=a to=+x");
  check("a wall along +x shortens it", near(beside.from, [2.3, 1, 0.5]) && near(beside.to, [3.2, 1, 0.5]), JSON.stringify(beside));
  const aside = arrow("box a 2 2 1 at 0 0 0\nbox other 1 1 1 at 3 5 0\narrow go from=a to=+x");
  check("a solid off to the side is not in the way", near(aside.to, [4.3, 1, 0.5]), JSON.stringify(aside));
  const whole = arrow("stack s 2 2 0.5 n=4 at 0 0 0\narrow go from=s to=+z");
  check("a whole stack's own layers are not in the way", near(whole.from, [1, 1, 2.3]) && near(whole.to, [1, 1, 4.3]), JSON.stringify(whole));
  const top = arrow("stack s 2 2 0.5 n=4 at 0 0 0\narrow go from=s.3 to=+z");
  check("from the top layer up", near(top.from, [1, 1, 2.3]) && near(top.to, [1, 1, 4.3]), JSON.stringify(top));
}
refuses("the layers above a middle layer are in the way", "stack s 2 2 0.5 n=4 at 0 0 0\narrow go from=s.1 to=+z", "no room");
refuses("no room at all", "box a 2 2 1 at 0 0 3\nslab floor 6 6 0.2 at -2 -2 2.4\narrow go from=a to=-z", "no room");

// point arrows are untouched
{
  const a = arrow("slab a 2 2 0.4 at 0 0 0\narrow go from=0,0,1 to=3,0,1");
  check("points still work and are not routed", near(a.from, [0, 0, 1]) && near(a.to, [3, 0, 1]) && a.route === undefined, JSON.stringify(a));
}
// what the compiler refuses, with a message that says why
refuses("too close", "slab a 2 2 0.4 at 0 0 0\nslab b 2 2 0.4 at 2.3 0 0\narrow go from=a to=b", "too close");
refuses("touching", "slab a 2 2 0.4 at 0 0 0\nslab b 2 2 0.4 beside=a +x\narrow go from=a to=b", "too close");
refuses("stacked directly on top", "slab a 2 2 0.4 at 0 0 0\nslab b 2 2 0.4 on=a\narrow go from=a to=b", "too close");
refuses("same space", "box a 2 2 2 at 0 0 0\nbox b 2 2 2 at 1 1 1\narrow go from=a to=b", "same space");
refuses("inside a tray", "tray t 4 4 1 at 0 0 0\nbox b 1 1 1 at 1.5 1.5 0.3\narrow go from=b to=t", "same space");
refuses("to itself", "slab a 2 2 0.4 at 0 0 0\narrow go from=a to=a", "itself");
refuses("undefined end", "slab a 2 2 0.4 at 0 0 0\narrow go from=a to=nope", "not defined");
refuses("defined later", "slab a 2 2 0.4 at 0 0 0\narrow go from=a to=b\nslab b 2 2 0.4 at 4 0 0", "not defined");
refuses("an arrow as an end", "slab a 2 2 0.4 at 0 0 0\nslab b 2 2 0.4 at 4 0 0\narrow one from=a to=b\narrow go from=one to=b", "is an arrow");
refuses("one name one point", "slab a 2 2 0.4 at 0 0 0\narrow go from=a to=3,0,0", "a name and a side");
refuses("missing to", "slab a 2 2 0.4 at 0 0 0\narrow go from=a", "a name and a side");
refuses("missing both", "slab a 2 2 0.4 at 0 0 0\narrow go dashed", "three numbers");

// drawing: the solids an arrow joins never hide it, a third solid in front does
const accentLines = (svg: string) => [...svg.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"[^>]*stroke="#F5C542"/g)]
  .map((m) => [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as const);
const heads = (svg: string) => (svg.match(/<polyline [^>]*stroke="#F5C542"/g) ?? []).length;
const drawn = (ls: readonly (readonly number[])[]) => ls.reduce((s, l) => s + Math.hypot(l[2]! - l[0]!, l[3]! - l[1]!), 0);
{
  const free = render(build(parse("slab a 1 1 0.4 at 0 0 0\nslab b 1 1 0.4 at 5 0 0\narrow go from=a to=b accent")));
  const behind = render(build(parse("slab a 1 1 0.4 at 0 0 0\nslab b 1 1 0.4 at 5 0 0\nbox wall 7 0.4 2 at -0.5 -1.5 0\narrow go from=a to=b accent")));
  const front = render(build(parse("slab a 1 1 0.4 at 0 0 0\nslab b 1 1 0.4 at 5 0 0\nbox wall 7 0.4 2 at -0.5 1.5 0\narrow go from=a to=b accent")));
  check("nothing in the way: drawn whole with its head", accentLines(free).length > 0 && heads(free) === 1);
  // the wall changes the canvas fit, so compare against the arrow's own length on each canvas
  const scene = (src: string) => build(parse(src));
  check("a wall behind hides nothing", heads(behind) === 1 && accentLines(behind).length > 0);
  check("a wall in front hides the arrow and its head", accentLines(front).length === 0 && heads(front) === 0,
    `${accentLines(front).length} lines, ${heads(front)} heads`);
  check("scene unchanged by drawing", scene("slab a 1 1 0.4 at 0 0 0\nslab b 1 1 0.4 at 5 0 0\narrow go from=a to=b").arrows.length === 1);
}
{
  // a post in front of the middle of the arrow: the arrow shows either side of it, head included
  const svg = render(build(parse("slab a 1 1 0.4 at 0 0 0\nslab b 1 1 0.4 at 6 0 0\nbox post 0.6 0.6 3 at 3.2 1.4 0\narrow go from=a to=b accent")));
  const xs = accentLines(svg).flatMap((l) => [Math.min(l[0]!, l[2]!), Math.max(l[0]!, l[2]!)]);
  const segs = accentLines(svg).map((l) => [Math.min(l[0]!, l[2]!), Math.max(l[0]!, l[2]!)] as const).sort((p, q) => p[0] - q[0]);
  const gaps = segs.slice(1).filter((s, i) => s[0] - segs[i]![1] > 3).length;
  check("a post in front cuts a gap in the arrow", gaps === 1 && heads(svg) === 1, `${gaps} gaps, ${heads(svg)} heads, span ${Math.min(...xs)}..${Math.max(...xs)}`);
}
{
  // coming in to a tall solid from behind: its own solid does not hide the head
  const svg = render(build(parse("box tall 2 2 3 r=0.4 at 0 0 0\narrow go from=-x to=tall accent")));
  check("head stays visible against its own solid", heads(svg) === 1 && drawn(accentLines(svg)) > 20);
  const two = render(build(parse("box back 2 2 3 at 0 0 0\nbox front 2 2 3 at 4 0 0\narrow go from=front to=back accent")));
  check("front to back between two tall solids stays whole", heads(two) === 1 && accentLines(two).length > 0);
}
{
  // dashes run on across pieces instead of restarting
  const svg = render(build(parse("slab a 2 2 0.4 at 0 0 0\nslab b 2 2 0.4 at 6 0 0\narrow go from=a to=b dashed")));
  const offsets = [...svg.matchAll(/stroke-dashoffset="([\d.]+)"/g)].map((m) => Number(m[1]));
  check("dashed pieces carry the offset", offsets.length > 3 && offsets.every((o, i) => i === 0 || o > offsets[i - 1]!), JSON.stringify(offsets));
  check("exactly one arrow head", (svg.match(/<polyline /g) ?? []).length === 1);
}
{
  // tags and accent find a routed arrow by its name
  const svg = render(build(parse("slab a 2 2 0.4 at 0 0 0\nslab b 2 2 0.4 at 6 0 0\narrow go from=a to=b\naccent go\ntag go \"SYNC\"")));
  check("accent colours every piece", (svg.match(/stroke="#F5C542"/g) ?? []).length >= 2);
  check("tag on a routed arrow", svg.includes(">SYNC</text>"));
}

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
