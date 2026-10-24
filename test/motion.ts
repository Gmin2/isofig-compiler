// motion: the timeline the lines make, what comes in with what, and what is refused
import { parse } from "../src/parse.ts";
import { build } from "../src/scene.ts";
import { render } from "../src/svg.ts";
import { lookAt, plan, type Plan } from "../src/motion.ts";
import { project } from "../src/iso.ts";

let failed = 0;
const check = (what: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : `  ${detail}`}`);
};
const planOf = (src: string): Plan => plan(build(parse(src)), (p) => project(p, 30), 30)!;
// when a track first becomes fully visible and settles at its final look
const lands = (p: Plan, name: string) => {
  const t = p.enter.get(name)!;
  const k = t.keys.findIndex((k, i) => i > 0 && k.look.o === 1 && k.look.s === 1 && k.look.tx === 0 && k.look.ty === 0);
  return t.keys[k]!.at;
};
const starts = (p: Plan, name: string) => p.enter.get(name)!.keys.find((k) => k.at > 0)!.at;
const refuses = (what: string, src: string, words: string) => {
  try {
    render(build(parse(src)));
    check(what, false, "compiled");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    check(what, msg.includes(words) && /^line \d+:/.test(msg), msg.split("\n")[0]!);
  }
};

const base = "slab base 8 4 0.3 at 0 0 0\nslab a 1.5 1.5 0.3 at 0.5 1 0.3\nslab b 1.5 1.5 0.3 at 3 1 0.3\nslab c 1.5 1.5 0.3 at 5.5 1 0.3\n";

// no motion, no plan, no css
{
  const svg = render(build(parse(base)));
  check("a figure without motion has no style and no groups with classes", !svg.includes("<style>") && !svg.includes("class="));
  check("and no plan", plan(build(parse(base)), (p) => project(p, 30), 30) === null);
}
// steps follow line order; together shares a step; stagger spaces out layers
{
  const p = planOf(base + "enter a pop\nenter b pop\nenter c pop together");
  check("each enter line starts after the one before has landed", starts(p, "b") > lands(p, "a"), `${starts(p, "b")} vs ${lands(p, "a")}`);
  check("together starts with the step before", starts(p, "c") === starts(p, "b"));
  const q = planOf("slab base 4 4 0.3 at 0 0 0\nstack deck 2 2 0.2 n=4 on=base\nenter deck drop stagger=0.25");
  const s = [0, 1, 2, 3].map((i) => starts(q, `deck.${i}`));
  check("stagger drops the layers bottom up, 0.25s apart", s.every((v, i) => i === 0 || Math.abs(v - s[i - 1]! - 0.25) < 1e-9), JSON.stringify(s));
  check("the base, not entering, has no track", !q.enter.has("base"));
}
// what rests on something that comes in, comes in with it
{
  const p = planOf(base + "slab coin 0.6 0.6 0.1 r=0.3 on=b\nslab dot 0.3 0.3 0.1 on=coin\nenter b pop");
  check("a coin on a popping tile pops with it", p.enter.get("coin")?.keys === undefined ? false : starts(p, "coin") === starts(p, "b") && p.enter.get("coin")!.origin.x === p.enter.get("b")!.origin.x);
  check("and whatever sits on the coin too", starts(p, "dot") === starts(p, "b"));
  check("the platform under them does not", !p.enter.has("base"));
  const q = planOf("tray t 4 4 1 at 0 0 0\nbox inside 1 1 1 at 1.5 1.5 0.3\nenter t rise");
  check("a box on a tray's floor comes in with the tray", starts(q, "inside") === starts(q, "t.floor"));
  // a stack stepped sideways: only its first layer touches the floor, the others rest on nothing
  const r = planOf("tray t 6 4 0.7 at 0 0 0\nstack s 1.2 1.2 0.12 n=3 step=1.5,0 at 0.5 1 0.3\nenter t rise");
  check("every layer of a stepped stack in a tray comes in with the tray", [0, 1, 2].every((i) => r.enter.has(`s.${i}`) && starts(r, `s.${i}`) === starts(r, "t.floor")),
    JSON.stringify([0, 1, 2].map((i) => r.enter.has(`s.${i}`))));
  const hover = planOf("tray live 3 2.4 0.7 wall=0.3 at 5 0 0\nslab coin 1.4 1.4 0.2 r=0.7 on=live float=1\nenter live pop");
  check("a coin floating over a tray comes in with the tray", hover.enter.has("coin") && starts(hover, "coin") === starts(hover, "live.floor"));
  const above = planOf("stack large 4 3 0.16 n=8 gap=0.08 at 0 0 0\nslab tight 1.7 1.7 0.04 on=large gap=1\nslab score 1.4 1.4 0.18 on=tight gap=0.06\nenter large drop stagger=0.2");
  check("a card hovering over a stack comes in with its top layer", above.enter.has("tight") && starts(above, "tight") === starts(above, "large.7"),
    `${above.enter.has("tight")}`);
  check("and what hovers over that card too", above.enter.has("score") && starts(above, "score") === starts(above, "large.7"));
  const between = planOf("slab ground 6 6 0.2 at 0 0 0\nslab shelf 3 3 0.2 at 1.5 1.5 1\nslab lamp 1 1 0.2 at 2.5 2.5 2.5\nenter ground fade");
  check("a shelf over the ground comes in with it, and a lamp over the shelf too", starts(between, "shelf") === starts(between, "ground") && starts(between, "lamp") === starts(between, "ground"));
  const beside = planOf("slab ground 6 6 0.2 at 0 0 0\nslab base 1 1 0.3 at 7 0 0\nslab lid 1 1 0.1 at 7 0 1\nenter ground fade");
  check("a lid over a still solid beside the entering one stays put", !beside.enter.has("lid"));
  const lone = planOf("slab ground 8 4 0.2 at 0 0 0\nstack s 1 1 0.2 n=2 step=2,0 at 1 1 0.2\nslab other 1 1 0.2 at 6 1 0.2\nenter other pop");
  check("a stack that rests on nothing entering stays put", !lone.enter.has("s.0") && !lone.enter.has("s.1"));
}
// marks wait for their solids
{
  const p = planOf(base + "arrow go from=a to=c\ntag b \"B\"\nlink a b\narrow loose from=0,5,1 to=2,5,1\nenter a fade\nenter b pop\nenter c drop");
  const appear = (t: { keys: { at: number; look: { o: number } }[] }) => t.keys.find((k) => k.look.o === 1)!.at;
  check("a tag appears after its solid lands", appear(p.tags.get(0)!) >= lands(p, "b"));
  check("an arrow appears after both its ends land", appear(p.arrows.get("go")!) >= lands(p, "c"));
  check("a link appears after both its ends land", appear(p.links.get(0)!) >= lands(p, "b"));
  check("a point arrow waits for the whole figure", appear(p.arrows.get("loose")!) >= p.settled);
}
// loop and once
{
  const loop = planOf(base + "enter a pop\ntimeline loop hold=2");
  const t = loop.enter.get("a")!;
  check("loop: hidden at the start and the end of each cycle", t.keys[0]!.look.o === 0 && t.keys[t.keys.length - 1]!.look.o === 0 && t.repeat);
  check("loop: holds for the hold time before fading", t.period > loop.settled + 2 - 1e-9);
  const once = planOf(base + "enter a pop\ntimeline once");
  const u = once.enter.get("a")!;
  check("once: ends shown and does not repeat", u.keys[u.keys.length - 1]!.look.o === 1 && !u.repeat);
  check("once: long after, the look is the finished figure", JSON.stringify(lookAt(u, 60)) === JSON.stringify({ tx: 0, ty: 0, s: 1, o: 1, dash: 0 }));
  check("at the very start an entering solid is invisible", lookAt(u, 0).o === 0);
  check("times inside a track only go forward", [loop, once].every((pl) => [...pl.enter.values(), ...pl.tags.values()].every((tr) => tr.keys.every((k, i) => i === 0 || k.at >= tr.keys[i - 1]!.at))));
  const zero = planOf(base + "tag a \"A\"\nenter a pop\ntimeline loop hold=0");
  check("hold=0 still keeps a tag's times in order", [...zero.tags.values()].every((tr) => tr.keys.every((k, i) => i === 0 || k.at >= tr.keys[i - 1]!.at)));
}
// float, pulse, flow
{
  const p = planOf(base + "arrow go from=a to=c\nstack s 1 1 0.2 n=3 at 6 3 0.3\nfloat b\npulse s\nflow go\ntimeline once");
  check("float and pulse wait until the figure has settled in once mode", p.ambient.get("b")!.delay === p.settled && p.ambient.get("s.0")!.delay === p.settled);
  check("pulse scales a stack's layers about one shared point", p.ambient.get("s.0")!.origin.x === p.ambient.get("s.2")!.origin.x && p.ambient.get("s.0")!.origin.y === p.ambient.get("s.2")!.origin.y);
  const svg = render(build(parse(base + "arrow go from=a to=c\nflow go")));
  check("a flowing arrow is dashed even if not asked", /stroke-dasharray[^>]*class="[^"]*-flow"/.test(svg));
  check("flow css shifts one whole dash cycle", svg.includes("calc(var(--o,0px) - 11px)"));
}
// css
{
  const svg = render(build(parse(base + "enter a pop\nenter b drop")));
  check("reduced motion turns animation off", svg.includes("prefers-reduced-motion:reduce") && svg.includes("animation:none"));
  const other = render(build(parse(base + "enter a pop\nenter c drop")));
  const id = (s: string) => s.match(/class="(m[a-z0-9]+)-/)![1];
  check("two figures get different class prefixes", id(svg) !== id(other));
  check("the same figure gets the same svg", render(build(parse(base + "enter a pop\nenter b drop"))) === svg);
  const holes = render(build(parse(base + "hole b.top r=0.4\nenter b pop")));
  const cls = [...holes.matchAll(/<g class="([^"]+)">/g)].map((m) => m[1]);
  check("a hole moves with its solid, sharing its animation", cls.length === 2 && cls[0] === cls[1], JSON.stringify(cls));
  const frame = render(build(parse(base + "enter a pop\nenter b drop")), {}, { at: 0 });
  check("a still frame has no css", !frame.includes("<style>") && frame.includes('opacity="0"'));
}
// refusals
refuses("enter needs how", base + "enter a", "drop, rise, pop or fade");
refuses("enter an undefined solid", base + "enter nope pop", "not defined");
refuses("enter an arrow", base + "arrow go from=a to=c\nenter go pop", "is an arrow");
refuses("enter twice", base + "enter a pop\nenter a drop", "already enters");
refuses("enter a layer of a stack that already enters", "stack s 1 1 0.2 n=3 at 0 0 0\nenter s drop\nenter s.1 pop", "already enters");
refuses("enter a stack after one of its layers", "stack s 1 1 0.2 n=3 at 0 0 0\nenter s.1 pop\nenter s drop", "already enters");
refuses("come out of itself", base + "enter a rise from=a", "out of itself");
refuses("come out of an undefined solid", base + "enter a rise from=nope", "not defined");
refuses("stagger out of range", base + "enter a drop stagger=5", "stagger");
refuses("float twice", base + "float a\nfloat a", "already has float");
refuses("flow on a solid", base + "flow a", "not an arrow");
refuses("two timelines", base + "timeline loop\ntimeline once", "only one timeline");
refuses("timeline that is neither", base + "timeline forever", "loop or once");
refuses("hold out of range", base + "timeline loop hold=30", "hold");
refuses("coming out would pass behind a wall", "box wall 1 6 3 at 3 -1 0\nbox device 1 1 1 at 0 2 0\nslab card 1 1 0.2 at 6 2 0\nenter card rise from=device", "pass behind wall");
{
  // a clear way out is fine
  const svg = render(build(parse("slab base 8 3 0.2 at 0 0 0\nbox device 1.5 1.5 1.2 at 0.5 0.7 0.2\nslab card 1.5 1.5 0.2 at 4 0.7 0.2\nenter card rise from=device")));
  check("coming out along a clear way compiles", svg.includes("<style>"));
}

// belts, presses, lights and signals
{
  const p = planOf("slab belt 8 1 0.2 at 0 0 0\ngrid crates 0.6 n=4,1,1 pitch=1.6 at 0.4 0.2 0.2\nbox ram 0.8 0.8 0.4 at 2 0.1 1.5\nicon r \"bolt\" on=ram size=0.4\ntag ram \"PACK\"\nslide crates by=1.6,0,0\nbob ram by=0,0,-0.5");
  const first = p.ambient.get("crates.000")!, mid = p.ambient.get("crates.100")!, last = p.ambient.get("crates.300")!;
  check("slide: the part upstream fades in", lookAt(first, 0).o === 0 && lookAt(first, 0.8).o === 1);
  check("slide: the part downstream fades out", lookAt(last, 0.8).o === 1 && lookAt(last, 1.59).o < 0.2);
  check("slide: a middle part stays and moves one step", lookAt(mid, 1.2).o === 1 && Math.abs(lookAt(mid, 0.8).tx - lookAt(mid, 0).tx) > 1);
  const ram = p.ambient.get("ram")!;
  check("bob: next to a belt it keeps the belt's time", ram.period === first.period);
  check("bob: goes down and comes back", lookAt(ram, ram.period * 0.45).ty > 1 && Math.abs(lookAt(ram, ram.period * 0.95).ty) < 1e-6);
  check("bob: the icon on it goes with it", p.ambient.get("r") === ram);
  check("bob: its tag rides with it", p.rides.get(0) === ram);
}
{
  const p = planOf("box router 3 1.5 0.5 at 0 0 0\ngrid leds 0.14 n=4,1,1 pitch=0.3 at 0.5 1.2 0.5\nblink leds\nripple router");
  const a = p.ambient.get("leds.000")!, b = p.ambient.get("leds.300")!;
  check("blink: lights take turns", b.delay > a.delay && lookAt(a, a.period * 0.7).o < 0.5);
  check("ripple: three rings, spreading and fading", [0, 1, 2].every((k) => p.ambient.has(`router~ripple${k}`)) &&
    lookAt(p.ambient.get("router~ripple0")!, 2.3).s > 1.2);
  const svg = render(build(parse("box router 3 1.5 0.5 at 0 0 0\nripple router")));
  check("ripple: the rings are drawn", (svg.match(/fill="none" stroke="[^"]+" stroke-width="[^"]+" data-role="signal"/g) ?? []).length === 3);
}
{
  // under the pointer
  const svg = render(build(parse("tray t 4 2 0.3 wall=0.1 at 0 0 0\ngrid keys 0.4 n=3,1,1 pitch=0.6 at 0.5 0.5 0.1\nbox d 1 1 0.4 at 5 0 0 accent\nhover keys lift=0.3\nhover d open=0,1,0")));
  check("hover: each key and the drawer take the pointer on a still outline", (svg.match(/pointer-events="all"/g) ?? []).length === 4);
  check("hover: the move is css, so a saved svg does it too", /-hv:hover [^{]*-hm\{transform:translate\(var\(--hx\),var\(--hy\)\)\}/.test(svg));
  const still = render(build(parse("box d 1 1 0.4 at 0 0 0\nhover d glow")), {}, { at: 1 });
  check("hover: a still frame has none of it", !still.includes("pointer-events"));
}
{
  // what rests on a hovered part goes with it, and lets the pointer through to it
  const svg = render(build(parse("slab desk 5 3 0.2 at 0 0 0\nslab paper 2 1.5 0.06 at 1.5 0.8 0.2\nword due \"DUE\" size=0.5 deep=0.06 axis=z on=paper\nhover paper open=0,0,0.8")));
  check("hover: a word on a hovered sheet rides with it", (svg.match(/-hr0" style="[^"]*pointer-events:none/g) ?? []).length === 3 && /svg:has\(\.[^)]*-hk0:hover\)/.test(svg));
}
refuses("hover without what it does", base + "hover a", "lift=0.3, open=x,y,z or glow");
refuses("slide needs a move", base + "slide a", "by=x,y,z");
refuses("bob by nothing", base + "bob a by=0,0,0", "not all 0");
refuses("slide and bob the same solid", base + "slide a by=1,0,0\nbob a by=0,0,1", "already slides or bobs");
refuses("ripple an undefined solid", base + "ripple nope", "not defined");

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
