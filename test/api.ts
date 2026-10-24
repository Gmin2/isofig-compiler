// the library api: results instead of throws, and picking the best sample
import { badness, compile, frames, isSerious, pickBest, rankSamples, repetition } from "../src/index.ts";

let failed = 0;
const check = (what: string, ok: boolean, detail = ""): void => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : `  ${detail}`}`);
};

const clean = "slab a 2 2 0.4 at 0 0 0\nslab b 2 2 0.4 at 4 0 0\narrow go from=a to=b";
const overlapping = "box a 2 2 1 at 0 0 0\nbox b 2 2 1 at 1 0 0";
const shallow = "box a 2 2 1 at 0 0 0\nbox b 2 2 1 at 1.93 0 0";
const broken = "slab a 2 2 0.4 at 0 0 0\narrow go from=a to=nope";

{
  const r = compile(clean);
  check("a good figure compiles to an svg", r.ok && r.figure.svg.startsWith("<svg") && r.figure.issues.length === 0 && !r.figure.animated);
  const m = compile(clean + "\nenter a pop");
  check("motion lines mark it animated and add css", m.ok && m.figure.animated && m.figure.svg.includes("<style>"));
  const f = compile(clean + "\nenter a pop", { at: 0 });
  check("a still frame has no css", f.ok && !f.figure.svg.includes("<style>"));
}
{
  const plain = compile(clean + '\ntag a "START"');
  const marked = compile(clean + '\ntag a "START"', { ids: true });
  check("an editor can ask which solid and line each piece came from", marked.ok && marked.figure.svg.includes('data-name="a"') &&
    marked.figure.svg.includes('data-name="b"') && marked.figure.svg.includes('data-tag="0"'));
  check("and nobody else gets the marks", plain.ok && !plain.figure.svg.includes("data-name") && !plain.figure.svg.includes("data-tag"));
}
{
  const r = compile(broken);
  check("a bad figure is an error with its line, not a throw", !r.ok && r.error.line === 2 && r.error.message.includes("not defined"), JSON.stringify(r));
  const unknown = compile("tray t 4 4 1 at 0 0 0\nbox card 1 1 1 at 0 2 0\nbox wall 1 6 3 at 3 -1 0\nslab c 1 1 0.2 at 6 2 0\nenter c rise from=card");
  check("a refusal while drawing has its line too", !unknown.ok && unknown.error.line === 5, JSON.stringify(unknown));
  const nonsense = compile("");
  check("an empty figure is an error", !nonsense.ok, JSON.stringify(nonsense));
}
{
  const o = compile(overlapping);
  check("an overlap is serious", o.ok && o.figure.issues.some(isSerious));
  const s = compile(shallow);
  check("a sliver is reported but not serious", s.ok && s.figure.issues.length === 1 && !s.figure.issues.some(isSerious));
  const ls = compile(shallow, { lenient: true }), lo = compile(overlapping, { lenient: true });
  check("leniently, a sliver is slid clear before drawing, and says so", ls.ok && ls.figure.issues.length === 0 && ls.figure.settled.length === 1);
  check("leniently, a deep overlap is left where it was written", lo.ok && lo.figure.settled.length === 0 && lo.figure.issues.some(isSerious));
  const sunk = compile("slab plate 4 4 0.3 at 0 0 0\nbox cup 1 1 1 at 1.5 1.5 0", { lenient: true });
  check("leniently, a solid sunk into the one under it is lifted onto it", sunk.ok && sunk.figure.issues.length === 0 && /lifted 0\.30/.test(sunk.figure.settled.join()));
  check("badness orders failed, what is wrong, repetition, depth", JSON.stringify([badness(compile(broken)), badness(o), badness(s), badness(compile(clean))]) ===
    JSON.stringify([[1, 0, 0, 0], [0, 1, 0, 1], [0, 0, 0, 0.07], [0, 0, 0, 0]]), JSON.stringify([badness(compile(broken)), badness(o), badness(s)]));
}
{
  const p = pickBest([broken, overlapping, clean, shallow]);
  check("picks the clean sample", p !== null && p.index === 2 && p.clean);
  const q = pickBest([overlapping, shallow]);
  check("with no clean one, the shallow one is still clean enough", q !== null && q.index === 1 && q.clean);
  const r = pickBest([broken, overlapping]);
  check("a compiling sample beats a broken one even when it overlaps", r !== null && r.index === 1 && !r.clean);
  const tie = pickBest([clean, clean]);
  check("ties keep the earliest", tie !== null && tie.index === 0);
  check("no samples, no pick", pickBest([]) === null);
  const all = pickBest([broken, broken]);
  check("all broken still picks one, marked not clean", all !== null && all.index === 0 && !all.clean && !all.result.ok);
  const ranked = rankSamples([broken, overlapping, clean, shallow, clean]).map((p) => p.index);
  check("ranking puts clean first, broken last, ties in order", JSON.stringify(ranked) === "[2,4,3,1,0]", JSON.stringify(ranked));
  check("ranking nothing is empty", rankSamples([]).length === 0);
}

{
  // a figure that asks to loop, played once instead
  const looping = clean + "\nenter a pop\nenter b drop\nfloat b\npulse a\nflow go\ntimeline loop hold=2";
  const own = compile(looping);
  const once = compile(looping, { loop: false });
  // entrance rules end "infinite both" when they loop and "1 both" when they play once; flow is "linear infinite" with no fill
  // entrances start at 0s; float and pulse start once the figure has landed, so they have a delay
  const entrances = (svg: string) => [...svg.matchAll(/animation:\S+k [\d.]+s linear 0s (infinite|1) both/g)].map((m) => m[1]);
  check("the figure's own timeline loops", own.ok && entrances(own.figure.svg).length > 0 && entrances(own.figure.svg).every((r) => r === "infinite"),
    JSON.stringify(own.ok && entrances(own.figure.svg)));
  check("loop: false plays every entrance once", once.ok && entrances(once.figure.svg).length > 0 && entrances(once.figure.svg).every((r) => r === "1"),
    JSON.stringify(once.ok && entrances(once.figure.svg)));
  check("float, pulse and flow keep going after it lands", once.ok && /3s linear [1-9][\d.]*s infinite both/.test(once.figure.svg) &&
    /1\.6s linear [1-9][\d.]*s infinite both/.test(once.figure.svg) && /0\.8s linear infinite/.test(once.figure.svg));
  const later = compile(looping, { loop: false, at: 60 });
  const settled = compile(clean + "\nfloat b\nflow go");
  check("long after the end, a once figure is the finished figure", later.ok && !/opacity="0"/.test(later.figure.svg) && settled.ok);
}

{
  // a vague brief can send the model into a loop: the same line with a new name, over and over
  const row = (n: number) => Array.from({ length: n }, (_, i) =>
    `slab pin${i} 0.45 0.45 0.08 ${i === 0 ? "at 0 0 0" : `beside=pin${i - 1} +x gap=0.15`}`).join("\n");
  check("a few of the same shape is a row, not repetition", repetition(row(5)) === 0 && repetition(row(6)) === 0);
  check("many of the same shape counts as repetition", repetition(row(25)) === 18, String(repetition(row(25))));
  check("different shapes do not count", repetition(clean) === 0 && repetition("box a 1 1 1 at 0 0 0\nslab b 2 2 0.2 on=a\ncyl c r=0.4 h=0.2 on=b") === 0);
  const rambling = row(25);
  const overlapping2 = "box a 2 2 1 at 0 0 0\nbox b 2 2 1 at 1 0 0";
  const p = pickBest([rambling, overlapping2]);
  check("a rambling figure loses to one with an overlap", p !== null && p.index === 1, JSON.stringify([badness(compile(rambling), rambling), badness(compile(overlapping2), overlapping2)]));
  check("and it is not called clean", !(rankSamples([rambling])[0]?.clean ?? true));
}

{
  // strictly, a figure the compiler can not draw properly is one to write again. on the site it is
  // better to draw what can be drawn and say what was left out
  const cramped = "slab platform 8 6 0.3 r=0.9 at 0 0 0\nslab raw 2.2 2.2 0.2 r=0.4 at 0.6 0.7 0.3\nbox processing 1.6 1.6 1.1 r=0.35 at 3.2 2.2 0.3 accent\narrow incoming from=raw to=processing";
  const strict = compile(cramped);
  const lenient = compile(cramped, { lenient: true });
  check("strictly, an arrow with no room refuses the figure", !strict.ok && /too close for an arrow/.test(strict.error.message));
  check("leniently, the figure is drawn without that arrow", lenient.ok && lenient.figure.svg.startsWith("<svg") &&
    lenient.figure.notes.length === 1 && /no room between raw and processing/.test(lenient.figure.notes[0] ?? ""), JSON.stringify(lenient.ok && lenient.figure.notes));

  const crossing = "tray t 4 4 1 at 0 0 0\nbox card 1 1 1 at 0.5 2 0.3\nbox wall 1 6 3 at 4.5 -1 0\nslab c 1 1 0.2 at 7 2 0\nenter c rise from=card";
  const refused = compile(crossing);
  const drawn = compile(crossing, { lenient: true });
  check("strictly, motion that would pass behind something refuses the figure", !refused.ok && refused.error.line === 5);
  check("leniently, it comes in where it stands, and says so", drawn.ok && drawn.figure.animated &&
    drawn.figure.notes.some((n) => /comes in where it stands/.test(n)), JSON.stringify(drawn.ok && drawn.figure.notes));

  const fine = compile(clean, { lenient: true });
  check("a figure with nothing wrong has nothing to say", fine.ok && fine.figure.notes.length === 0);
  const ranked = pickBest([cramped, clean], { lenient: true });
  check("a figure missing an arrow loses to a whole one", ranked !== null && ranked.index === 1 && !ranked.clean === false);
}

{
  // solids that are not boxes
  const star = compile("slab base 4 4 0.2 at 0 0 0\nshape s star 1.4 1.4 0.4 on=base accent\ntag s \"RATED\"");
  check("a shape compiles, sits where it is put and carries its tag", star.ok && star.figure.issues.length === 0 && star.figure.svg.includes("RATED") && /fill-rule="evenodd"/.test(star.figure.svg));
  const ring = compile("shape r ring 2 0.4 2 axis=y at 0 0 0");
  check("a standing ring has its hole cut out", ring.ok && /M[^"]*ZM/.test(ring.figure.svg));
  const w = compile("slab base 6 2 0.2 at 0 0 0\nword sign \"OPEN 24\" size=1 on=base\naccent sign.0");
  check("a word is one solid a letter, the space left out", w.ok && w.figure.issues.length === 0 && (w.figure.svg.match(/fill-rule="evenodd"/g) ?? []).length === 6);
  const odd = compile("word w \"50·\" size=1 at 0 0 0", { lenient: true });
  check("a character the alphabet lacks is left out, and said", odd.ok && odd.figure.notes.some((n) => n.includes("·")));
  const bad = compile("shape s blob 1 1 1 at 0 0 0");
  check("a shape it does not know is refused", !bad.ok && /shape needs a kind/.test(bad.error.message));
}

{
  const moving = frames(clean + "\nenter a pop\nenter b pop\nflow go", { fps: 10 });
  const still = frames(clean, { fps: 10 });
  const seconds = compile(clean + "\nenter a pop\nenter b pop").ok ? (compile(clean + "\nenter a pop\nenter b pop") as { ok: true; figure: { seconds: number | null } }).figure.seconds : null;
  check("a moving figure says how long its entrances take", seconds !== null && seconds > 0.5 && seconds < 3, String(seconds));
  check("and turns into frames: the entrances and a moment after, all on one canvas", moving !== null && moving.svgs.length > 10 &&
    moving.svgs.every((s) => s.startsWith("<svg") && !s.includes("<style>")) &&
    new Set(moving.svgs.map((s) => s.match(/viewBox="[^"]+"/)?.[0])).size === 1 && moving.svgs[0] !== moving.svgs.at(-1), String(moving?.svgs.length));
  check("a figure that does not move is one frame", still !== null && still.svgs.length === 1);
}

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
