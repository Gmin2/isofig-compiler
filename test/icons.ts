// the icon line: a drawing the model names instead of drawing
import { compile } from "../src/index.ts";
import { build } from "../src/scene.ts";
import { parse } from "../src/parse.ts";
import { readFileSync } from "node:fs";
import { findGlyph, glyphNames } from "../src/icons.ts";

let failed = 0;
const check = (what: string, ok: boolean, detail = ""): void => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : `  ${detail}`}`);
};

const scene = (src: string) => build(parse(src), { lenient: true });

{
  const s = scene('slab plate 3 3 0.3 at 0 0 0\nicon doc "sheet" on=plate');
  const [icon] = s.icons;
  check("an icon lands on the solid it was put on", !!icon && icon.z === 0.3, JSON.stringify(s.icons));
  check("and sits in the middle of it", !!icon && icon.x === 1 && icon.y === 1, JSON.stringify(icon));
  check("its height is one unit unless asked", icon?.size === 1, String(icon?.size));
}
{
  const s = scene('icon big "sheet" at 2 3 1 size=2.5');
  check("size sets its height", s.icons[0]?.size === 2.5, String(s.icons[0]?.size));
  check("at puts it exactly where it says", s.icons[0]?.x === 2 && s.icons[0]?.y === 3 && s.icons[0]?.z === 1, JSON.stringify(s.icons[0]));
}
{
  const r = compile('slab plate 3 3 0.3 at 0 0 0\nicon doc "sheet" on=plate');
  check("it draws", r.ok && r.figure.svg.includes("<svg"));
  check("the glyph itself is in the svg", r.ok && r.figure.svg.includes("translate(0 960)") && r.figure.svg.includes('<path d="M'), r.ok ? "" : "did not compile");
}
{
  // a word nobody put in the catalogue costs the glyph, never the figure
  const r = compile('slab plate 3 3 0.3 at 0 0 0\nicon doc "zzz nothing like this" on=plate');
  check("an unknown glyph still draws the figure", r.ok);
  check("and says what it left out", r.ok && r.figure.notes.some((n) => n.includes("zzz nothing like this")), r.ok ? JSON.stringify(r.figure.notes) : "");
}
{
  const r = compile('slab plate 3 3 0.3 at 0 0 0\nicon doc "document" on=plate');
  check("a name the catalogue knows by another word resolves", r.ok && r.figure.svg.includes('<path d="M'));
  check("and so does a plural nobody listed", !!findGlyph("servers") && !!findGlyph("documents"));
  check("the catalogue is the whole set, not a handful", glyphNames().length > 3000, String(glyphNames().length));
  check("a word for nothing resolves to nothing", findGlyph("zzz nothing like this") === null);
}
{
  // the solid nearer the viewer is drawn after the glyph, so it covers it
  const r = compile('icon doc "sheet" at 0 0 0\nbox front 2 2 2 at 3 3 0');
  const svg = r.ok ? r.figure.svg : "";
  const glyph = svg.indexOf("translate(0 960)");
  const box = svg.lastIndexOf("polygon");
  check("a solid in front of a glyph is drawn over it", r.ok && glyph > 0 && box > glyph, `glyph ${glyph} box ${box}`);
}
{
  const bad = compile('slab p 3 3 0.3 at 0 0 0\nicon doc "sheet" on=p size=0');
  check("a size of zero is refused, with its line", !bad.ok && bad.error.line === 2, JSON.stringify(bad));
  const nameless = compile("slab p 3 3 0.3 at 0 0 0\nicon doc on=p");
  check("an icon with no glyph name is refused", !nameless.ok && nameless.error.message.includes("glyph name"), JSON.stringify(nameless));
  const nowhere = compile('icon doc "sheet"');
  check("an icon with no placement is refused", !nowhere.ok, JSON.stringify(nowhere));
}
{
  // it is a scene name like any other, so it can be labelled and animated
  const r = compile('slab plate 3 3 0.3 at 0 0 0\nicon doc "sheet" on=plate\ntag doc "REPORT"\nenter doc rise');
  check("a glyph can be tagged and can enter", r.ok && r.figure.animated && r.figure.svg.includes("REPORT"), r.ok ? "" : JSON.stringify(r));
}


{
  // a glyph standing in a scene is a thing you would point at, and the references
  // we are working from do exactly that
  const r = compile('slab plate 3 3 0.3 at 0 0 0\nicon doc "database" on=plate\nbox reader 1.4 1.4 1.2 at 6 0 0\narrow look from=reader to=doc dashed');
  check("an arrow can point at a glyph", r.ok, r.ok ? "" : JSON.stringify(r));
  const back = compile('slab plate 3 3 0.3 at 0 0 0\nicon doc "database" on=plate\nbox reader 1.4 1.4 1.2 at 6 0 0\narrow feed from=doc to=reader');
  check("and can start from one", back.ok, back.ok ? "" : JSON.stringify(back));
}

{
  // an alias pointing at a name the catalogue does not have is worse than no
  // alias: the word looks supported and quietly draws nothing
  const src = readFileSync(new URL("../src/icons.ts", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("const ALIAS"), src.indexOf("};", src.indexOf("const ALIAS")));
  const pairs = [...block.matchAll(/(\w+):\s*"([a-z_ ]+)"/g)];
  const dead = pairs.filter((m) => findGlyph(m[2]!) === null).map((m) => `${m[1]} -> ${m[2]}`);
  check("every alias points at a glyph that exists", dead.length === 0, dead.join(", "));
}

{
  // a figure should not be stuck with one accent colour and white
  const r = compile("box a 2 2 1 at 0 0 0 tint=blue\nbox b 2 2 1 at 3 0 0 tint=green\nbox c 2 2 1 at 6 0 0 accent");
  check("solids can take a colour from the palette", r.ok && r.figure.svg.includes("#8FBEFF") && r.figure.svg.includes("#8FD6A0"), r.ok ? "" : JSON.stringify(r));
  check("and accent still means the yellow one", r.ok && r.figure.svg.includes("#F5C542"));
  const plain = compile("box a 2 2 1 at 0 0 0");
  check("a solid with no colour is still white", plain.ok && plain.figure.svg.includes('fill="#fff"'));
  const wrong = compile("box a 2 2 1 at 0 0 0 tint=puce");
  check("a colour that is not in the palette is refused, with the list", !wrong.ok && wrong.error.message.includes("purple"), JSON.stringify(wrong));
  const cyl = compile("cyl t r=1 h=2 axis=z at 0 0 0 tint=teal");
  check("a cylinder takes one too", cyl.ok && cyl.figure.svg.includes("#8ED9D1"), cyl.ok ? "" : JSON.stringify(cyl));
}

{
  // a name the set lacks whole falls back to one of its words, last first
  check("a phrase finds the glyph its last word names", findGlyph("calendar event") !== null && findGlyph("how to rate") !== null);
  check("a word with an alias finds it", findGlyph("cog") !== null && findGlyph("note") !== null);
  check("nothing like it is still nothing", findGlyph("blorp zork") === null);
}
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
