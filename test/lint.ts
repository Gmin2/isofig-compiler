// what the lint flags and what it leaves alone
import { parse } from "../src/parse.ts";
import { build } from "../src/scene.ts";
import { lint, type Issue } from "../src/lint.ts";

let failed = 0;
const check = (what: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : `  ${detail}`}`);
};
const issues = (src: string): Issue[] => lint(build(parse(src)));
const clean = (what: string, src: string) => { const i = issues(src); check(what, i.length === 0, JSON.stringify(i)); };
const flags = (what: string, src: string, kind: Issue["kind"], min = 0) => {
  const i = issues(src);
  check(what, i.some((x) => x.kind === kind && x.depth >= min), JSON.stringify(i));
};

// touching is not overlapping
clean("sitting on top", "slab base 4 4 0.3 at 0 0 0\nbox b 1 1 1 on=base");
clean("beside with no gap", "box a 1 1 1 at 0 0 0\nbox b 1 1 1 beside=a +x");
clean("a stack's own layers", "stack s 2 2 0.2 n=5 r=1 at 0 0 0");
clean("a fanned stack's own layers", "stack s 2 2 0.2 n=5 step=0.3,0 at 0 0 0");
clean("a grid's own cubes", "grid g 1 n=3,3,3 at 0 0 0");
clean("coins on a platform", "slab base 4 4 0.3 r=0.6 at 0 0 0\nstack c 1 1 0.2 n=4 r=0.5 on=base");
clean("a box inside a tray, clear of the walls", "tray t 4 4 1 wall=0.3 at 0 0 0\nbox b 1 1 1 at 1.5 1.5 0.3");
clean("a cylinder standing on a slab", "slab base 3 3 0.3 at 0 0 0\ncyl c r=0.6 h=2 on=base");
// rounded shapes whose bounding boxes overlap but the shapes do not
clean("two discs corner to corner", "slab a 2 2 0.2 r=1 at 0 0 0\nslab b 2 2 0.2 r=1 at 1.5 1.5 0");
// the disc centre is 1.13 from the box corner, its radius 1: bounds overlap, shapes do not
clean("a standing cylinder in the corner of a box's bounds", "box a 2 2 1 at 0 0 0\ncyl c r=1 h=1 at 1.8 1.8 0");
flags("but closer in, the disc does reach the corner", "box a 2 2 1 at 0 0 0\ncyl c r=1 h=1 at 1.6 1.6 0", "overlap", 0.05);
// a sliver of overlap is reported, but shallow
{
  const i = issues("box a 2 2 1 at 0 0 0\nbox b 2 2 1 at 1.96 0 0");
  check("a sliver under the touch limit is not reported", i.length === 0, JSON.stringify(i));
  const j = issues("box a 2 2 1 at 0 0 0\nbox b 2 2 1 at 1.92 0 0");
  check("just past it is reported, with its depth", j.length === 1 && j[0]!.kind === "overlap" && j[0]!.depth === 0.08, JSON.stringify(j));
}

// real overlaps
flags("two tiles running into each other", "slab p 6 3 0.3 at 0 0 0\nslab raw 1.5 1.5 0.3 on=p\nbox local 1.5 1.5 1 at 1.2 0.6 0.3", "overlap", 0.1);
flags("a box inside a box", "box outer 3 3 3 at 0 0 0\nbox inner 1 1 1 at 1 1 1", "overlap", 0.9);
flags("a card through a tray wall", "tray t 4 4 1 wall=0.3 at 0 0 0\nslab card 1 1 0.2 at 3.5 1 0.5", "overlap", 0.1);
flags("two discs sharing space", "slab a 2 2 0.4 r=1 at 0 0 0\nslab b 2 2 0.4 r=1 at 1 0 0", "overlap", 0.3);
flags("a cylinder sunk into a slab", "slab base 3 3 0.5 at 0 0 0\ncyl c r=0.6 h=2 at 0.9 0.9 0.2", "overlap", 0.3);
{
  const i = issues("box outer 3 3 3 at 0 0 0 hidden=dashed\nbox inner 1 1 1 at 1 1 1");
  check("a dashed container holding something is not flagged", i.length === 0, JSON.stringify(i));
}

// arrows
clean("a routed arrow does not count its own ends", "box a 2 2 1 at 0 0 0\nbox b 2 2 1 at 4 0 0\narrow go from=a to=b");
clean("a routed arrow into a stack", "slab a 2 2 0.4 at 0 0 0\nstack s 2 2 0.2 n=3 at 4 0 0\narrow go from=a to=s");
flags("a routed arrow through a third solid", "slab a 1 1 1 at 0 0 0\nbox mid 1 1 1 at 2.5 0 0\nslab b 1 1 1 at 5 0 0\narrow go from=a to=b", "arrow-through", 0.3);
flags("a point arrow drawn down into a box", "box b 2 2 2 at 0 0 0\narrow down from=1,1,4 to=1,1,1", "arrow-through", 0.9);
clean("a point arrow in the open", "box b 2 2 2 at 0 0 0\narrow go from=3,1,1 to=6,1,1");
flags("a point arrow starting inside a box", "box b 2 2 2 at 0 0 0\narrow out from=1,1,1 to=5,1,1", "arrow-through", 0.5);

// words are read: two that cover each other on the page are broken, even apart in depth
flags("a word stood in front of another", "slab base 5 3 0.2 at 0 0 0\nword big \"42\" size=1.2 deep=0.12 at 1 0.4 0.2\nword small \"ON TIME\" size=0.4 deep=0.06 beside=big +y", "crowded", 0.2);
clean("two words side by side", "slab base 8 3 0.2 at 0 0 0\nword big \"42\" size=1 deep=0.12 at 0.5 1 0.2\nword small \"ON TIME\" size=0.5 deep=0.08 beside=big +x gap=0.4");
clean("one word on its own is not crowded by itself", "word sign \"OPEN\" size=1 at 0 0 0");

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
